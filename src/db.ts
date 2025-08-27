import mysql from 'mysql2/promise';
import { Ticket, Asset, Analysis, TicketWithAnalysis } from './types.js';

// const dbConfig = {
//   host: process.env.DB_HOST || 'localhost',
//   port: parseInt(process.env.DB_PORT || '3306'),
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASSWORD || '',
//   database: process.env.DB_NAME || 'homefix',
//   charset: 'utf8mb4'
// };

const dbConfig = {
  host: process.env.MYSQLHOST || 'localhost',
  port:  Number(process.env.MYSQLPORT),
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'homefix',
  charset: 'utf8mb4'
};

let pool: mysql.Pool;

export function initializeDB() {
  pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

export async function createTicket(description: string, userEmail?: string): Promise<number> {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'INSERT INTO tickets (description, user_email) VALUES (?, ?)',
    [description, userEmail || null]
  );
  return result.insertId;
}

export async function createAsset(
  ticketId: number,
  path: string,
  originalName: string,
  mime: string,
  sizeBytes: number
): Promise<number> {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'INSERT INTO assets (ticket_id, path, original_name, mime, size_bytes) VALUES (?, ?, ?, ?, ?)',
    [ticketId, path, originalName, mime, sizeBytes]
  );
  return result.insertId;
}

export async function createAnalysis(
  ticketId: number,
  materials: any[],
  tools: any[],
  steps: string[],
  likelihood?: Record<string, number>,
  safety?: string[],
  youtubeUrl?: string
): Promise<number> {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'INSERT INTO analyses (ticket_id, materials, tools, steps, likelihood, safety, youtube_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      ticketId,
      JSON.stringify(materials),
      JSON.stringify(tools),
      JSON.stringify(steps),
      likelihood ? JSON.stringify(likelihood) : null,
      safety ? JSON.stringify(safety) : null,
      youtubeUrl || null
    ]
  );
  return result.insertId;
}

export async function updateTicketStatus(ticketId: number, status: string): Promise<void> {
  await pool.execute(
    'UPDATE tickets SET status = ? WHERE id = ?',
    [status, ticketId]
  );
}

export async function getTicketsWithAnalysis(limit: number = 50): Promise<TicketWithAnalysis[]> {
  // Ensure limit is a valid positive integer
  const validLimit = Math.max(1, Math.min(Math.floor(Number(limit)), 1000));
  
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT 
      t.id,
      t.created_at,
      t.status,
      t.user_email,
      t.description,
      a.id as analysis_id,
      a.materials,
      a.tools,
      a.steps,
      a.likelihood,
      a.safety,
      a.youtube_url,
      a.created_at as analysis_created_at
    FROM tickets t
    LEFT JOIN (
      SELECT a1.*
      FROM analyses a1
      INNER JOIN (
        SELECT ticket_id, MAX(id) as max_id
        FROM analyses
        GROUP BY ticket_id
      ) a2 ON a1.ticket_id = a2.ticket_id AND a1.id = a2.max_id
    ) a ON t.id = a.ticket_id
    ORDER BY t.created_at DESC
    LIMIT ?`,
    [validLimit]
  );

  return rows.map(row => {
    const ticket: TicketWithAnalysis = {
      id: row.id,
      created_at: row.created_at,
      status: row.status,
      user_email: row.user_email,
      description: row.description
    };

    if (row.analysis_id) {
      const safeJsonParse = (value: any) => {
        if (!value || value === null) return undefined;
        if (typeof value === 'object') return value;
        try {
          return JSON.parse(value);
        } catch (e) {
          console.warn('Failed to parse JSON:', value);
          return [];
        }
      };

      ticket.latest_analysis = {
        id: row.analysis_id,
        ticket_id: row.id,
        materials: safeJsonParse(row.materials) || [],
        tools: safeJsonParse(row.tools) || [],
        steps: safeJsonParse(row.steps) || [],
        likelihood: safeJsonParse(row.likelihood),
        safety: safeJsonParse(row.safety),
        youtube_url: row.youtube_url,
        created_at: row.analysis_created_at
      };
    }

    return ticket;
  });
}

export async function getAssetsByTicketId(ticketId: number): Promise<Asset[]> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT * FROM assets WHERE ticket_id = ? ORDER BY created_at ASC',
    [ticketId]
  );

  return rows.map(row => ({
    id: row.id,
    ticket_id: row.ticket_id,
    path: row.path,
    original_name: row.original_name,
    mime: row.mime,
    size_bytes: row.size_bytes,
    created_at: row.created_at
  }));
}

export async function createContactSubmission(
  name: string,
  email: string,
  subject: string,
  message: string
): Promise<number> {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    'INSERT INTO contact_submissions (name, email, subject, message) VALUES (?, ?, ?, ?)',
    [name, email, subject, message]
  );
  return result.insertId;
}
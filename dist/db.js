"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDB = initializeDB;
exports.createTicket = createTicket;
exports.createAsset = createAsset;
exports.createAnalysis = createAnalysis;
exports.updateTicketStatus = updateTicketStatus;
exports.getTicketsWithAnalysis = getTicketsWithAnalysis;
exports.getAssetsByTicketId = getAssetsByTicketId;
exports.createContactSubmission = createContactSubmission;
const promise_1 = __importDefault(require("mysql2/promise"));
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'homefix',
    charset: 'utf8mb4'
};
let pool;
function initializeDB() {
    pool = promise_1.default.createPool({
        ...dbConfig,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
}
async function createTicket(description, userEmail) {
    const [result] = await pool.execute('INSERT INTO tickets (description, user_email) VALUES (?, ?)', [description, userEmail || null]);
    return result.insertId;
}
async function createAsset(ticketId, path, originalName, mime, sizeBytes) {
    const [result] = await pool.execute('INSERT INTO assets (ticket_id, path, original_name, mime, size_bytes) VALUES (?, ?, ?, ?, ?)', [ticketId, path, originalName, mime, sizeBytes]);
    return result.insertId;
}
async function createAnalysis(ticketId, materials, tools, steps, likelihood, safety, youtubeUrl) {
    const [result] = await pool.execute('INSERT INTO analyses (ticket_id, materials, tools, steps, likelihood, safety, youtube_url) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        ticketId,
        JSON.stringify(materials),
        JSON.stringify(tools),
        JSON.stringify(steps),
        likelihood ? JSON.stringify(likelihood) : null,
        safety ? JSON.stringify(safety) : null,
        youtubeUrl || null
    ]);
    return result.insertId;
}
async function updateTicketStatus(ticketId, status) {
    await pool.execute('UPDATE tickets SET status = ? WHERE id = ?', [status, ticketId]);
}
async function getTicketsWithAnalysis(limit = 50) {
    const validLimit = Math.max(1, Math.min(Math.floor(Number(limit)), 1000));
    const [rows] = await pool.query(`SELECT 
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
    LIMIT ?`, [validLimit]);
    return rows.map(row => {
        const ticket = {
            id: row.id,
            created_at: row.created_at,
            status: row.status,
            user_email: row.user_email,
            description: row.description
        };
        if (row.analysis_id) {
            const safeJsonParse = (value) => {
                if (!value || value === null)
                    return undefined;
                if (typeof value === 'object')
                    return value;
                try {
                    return JSON.parse(value);
                }
                catch (e) {
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
async function getAssetsByTicketId(ticketId) {
    const [rows] = await pool.execute('SELECT * FROM assets WHERE ticket_id = ? ORDER BY created_at ASC', [ticketId]);
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
async function createContactSubmission(name, email, subject, message) {
    const [result] = await pool.execute('INSERT INTO contact_submissions (name, email, subject, message) VALUES (?, ?, ?, ?)', [name, email, subject, message]);
    return result.insertId;
}
//# sourceMappingURL=db.js.map
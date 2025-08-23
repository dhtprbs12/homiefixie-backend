import { Asset, TicketWithAnalysis } from './types.js';
export declare function initializeDB(): void;
export declare function createTicket(description: string, userEmail?: string): Promise<number>;
export declare function createAsset(ticketId: number, path: string, originalName: string, mime: string, sizeBytes: number): Promise<number>;
export declare function createAnalysis(ticketId: number, materials: any[], tools: any[], steps: string[], likelihood?: Record<string, number>, safety?: string[], youtubeUrl?: string): Promise<number>;
export declare function updateTicketStatus(ticketId: number, status: string): Promise<void>;
export declare function getTicketsWithAnalysis(limit?: number): Promise<TicketWithAnalysis[]>;
export declare function getAssetsByTicketId(ticketId: number): Promise<Asset[]>;
export declare function createContactSubmission(name: string, email: string, subject: string, message: string): Promise<number>;
//# sourceMappingURL=db.d.ts.map
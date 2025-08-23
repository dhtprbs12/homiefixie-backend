export interface Material {
    name: string;
    spec?: string;
    qty?: string;
    description?: string;
    alt?: string[];
    image_url?: string;
    product_url?: string;
    store_name?: string;
}
export interface Tool {
    name: string;
    purpose?: string;
    description?: string;
    image_url?: string;
    product_url?: string;
    store_name?: string;
}
export interface YouTubeVideo {
    url: string;
    title: string;
    channel?: string;
    views?: string;
    duration?: string;
}
export interface AnalysisResult {
    materials: Material[];
    tools: Tool[];
    steps: string[];
    likelihood?: Record<string, number>;
    safety?: string[];
    youtube_url?: string;
    youtube_search_term?: string;
    youtube_videos?: YouTubeVideo[];
}
export interface Ticket {
    id: number;
    created_at: Date;
    status: string;
    user_email?: string;
    description: string;
}
export interface Asset {
    id: number;
    ticket_id: number;
    path: string;
    original_name: string;
    mime: string;
    size_bytes: number;
    created_at: Date;
}
export interface Analysis {
    id: number;
    ticket_id: number;
    materials: Material[];
    tools: Tool[];
    steps: string[];
    likelihood?: Record<string, number>;
    safety?: string[];
    youtube_url?: string;
    created_at: Date;
}
export interface TicketWithAnalysis extends Ticket {
    latest_analysis?: Analysis;
    assets?: Asset[];
}
export interface AnalyzeRequest {
    description?: string;
    email?: string;
}
export interface AnalyzeResponse extends AnalysisResult {
    ticketId: number;
}
export interface ContactSubmission {
    id: number;
    name: string;
    email: string;
    subject: string;
    message: string;
    created_at: Date;
}
//# sourceMappingURL=types.d.ts.map
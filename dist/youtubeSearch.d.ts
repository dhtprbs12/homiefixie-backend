import { AnalysisResult } from './types.js';
interface YouTubeSearchResult {
    url: string;
    title: string;
    channel: string;
    views?: string;
    duration?: string;
}
export declare function searchYouTubeVideos(description: string, analysis?: AnalysisResult): Promise<YouTubeSearchResult[] | null>;
export {};
//# sourceMappingURL=youtubeSearch.d.ts.map
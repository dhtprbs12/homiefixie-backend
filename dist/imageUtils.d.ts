export interface ImageProcessingResult {
    processedPath: string;
    originalSize: number;
    processedSize: number;
    width: number;
    height: number;
}
export declare function processImageForOpenAI(originalPath: string, outputDir?: string): Promise<ImageProcessingResult>;
export declare function cleanupProcessedImage(processedPath: string): Promise<void>;
//# sourceMappingURL=imageUtils.d.ts.map
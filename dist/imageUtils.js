"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processImageForOpenAI = processImageForOpenAI;
exports.cleanupProcessedImage = cleanupProcessedImage;
const sharp_1 = __importDefault(require("sharp"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
async function processImageForOpenAI(originalPath, outputDir = path_1.default.dirname(originalPath)) {
    const originalStats = await promises_1.default.stat(originalPath);
    const originalSize = originalStats.size;
    const baseName = path_1.default.basename(originalPath, path_1.default.extname(originalPath));
    const processedPath = path_1.default.join(outputDir, `${baseName}_processed.jpg`);
    const image = (0, sharp_1.default)(originalPath);
    const metadata = await image.metadata();
    let targetWidth = metadata.width || 1920;
    let targetHeight = metadata.height || 1080;
    const maxWidth = 1920;
    const maxHeight = 1080;
    if (targetWidth > maxWidth || targetHeight > maxHeight) {
        const aspectRatio = targetWidth / targetHeight;
        if (aspectRatio > maxWidth / maxHeight) {
            targetWidth = maxWidth;
            targetHeight = Math.round(maxWidth / aspectRatio);
        }
        else {
            targetHeight = maxHeight;
            targetWidth = Math.round(maxHeight * aspectRatio);
        }
    }
    await image
        .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true
    })
        .jpeg({
        quality: 85,
        progressive: true
    })
        .toFile(processedPath);
    const processedStats = await promises_1.default.stat(processedPath);
    const processedSize = processedStats.size;
    console.log(`Image processed: ${originalSize} bytes → ${processedSize} bytes (${Math.round((1 - processedSize / originalSize) * 100)}% reduction)`);
    return {
        processedPath,
        originalSize,
        processedSize,
        width: targetWidth,
        height: targetHeight
    };
}
async function cleanupProcessedImage(processedPath) {
    try {
        await promises_1.default.unlink(processedPath);
        console.log(`Cleaned up processed image: ${processedPath}`);
    }
    catch (error) {
        console.warn(`Failed to cleanup processed image: ${processedPath}`, error);
    }
}
//# sourceMappingURL=imageUtils.js.map
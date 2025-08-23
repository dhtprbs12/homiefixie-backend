import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

export interface ImageProcessingResult {
  processedPath: string;
  originalSize: number;
  processedSize: number;
  width: number;
  height: number;
}

/**
 * Process and optimize an image for OpenAI API
 * - Resize to maximum 1920x1080 while maintaining aspect ratio
 * - Compress to reduce file size
 * - Convert to JPEG for consistency
 */
export async function processImageForOpenAI(
  originalPath: string,
  outputDir: string = path.dirname(originalPath)
): Promise<ImageProcessingResult> {
  const originalStats = await fs.stat(originalPath);
  const originalSize = originalStats.size;
  
  // Create output filename
  const baseName = path.basename(originalPath, path.extname(originalPath));
  const processedPath = path.join(outputDir, `${baseName}_processed.jpg`);
  
  // Process the image
  const image = sharp(originalPath);
  const metadata = await image.metadata();
  
  // Calculate optimal dimensions (max 1920x1080, maintain aspect ratio)
  let targetWidth = metadata.width || 1920;
  let targetHeight = metadata.height || 1080;
  
  const maxWidth = 1920;
  const maxHeight = 1080;
  
  if (targetWidth > maxWidth || targetHeight > maxHeight) {
    const aspectRatio = targetWidth / targetHeight;
    
    if (aspectRatio > maxWidth / maxHeight) {
      // Image is wider relative to max dimensions
      targetWidth = maxWidth;
      targetHeight = Math.round(maxWidth / aspectRatio);
    } else {
      // Image is taller relative to max dimensions
      targetHeight = maxHeight;
      targetWidth = Math.round(maxHeight * aspectRatio);
    }
  }
  
  // Process and save the image
  await image
    .resize(targetWidth, targetHeight, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({
      quality: 85, // Good balance between quality and file size
      progressive: true
    })
    .toFile(processedPath);
  
  const processedStats = await fs.stat(processedPath);
  const processedSize = processedStats.size;
  
  console.log(`Image processed: ${originalSize} bytes → ${processedSize} bytes (${Math.round((1 - processedSize/originalSize) * 100)}% reduction)`);
  
  return {
    processedPath,
    originalSize,
    processedSize,
    width: targetWidth,
    height: targetHeight
  };
}

/**
 * Clean up processed images to save disk space
 */
export async function cleanupProcessedImage(processedPath: string): Promise<void> {
  try {
    await fs.unlink(processedPath);
    console.log(`Cleaned up processed image: ${processedPath}`);
  } catch (error) {
    console.warn(`Failed to cleanup processed image: ${processedPath}`, error);
  }
}
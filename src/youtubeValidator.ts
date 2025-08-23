// YouTube URL validation utilities

// Extract YouTube video ID from various URL formats
export function getYouTubeVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/)|(.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  const videoId = match ? match[2] : null;
  
  // Check for placeholder patterns
  if (videoId && (
    videoId === 'example' || 
    videoId === 'placeholder' || 
    videoId === 'VIDEO_ID_HERE' ||
    videoId.includes('example') ||
    videoId.includes('placeholder') ||
    videoId.includes('sample') ||
    videoId.includes('demo') ||
    /^[a-zA-Z_]+$/.test(videoId) // All letters/underscores (likely placeholder)
  )) {
    console.warn(`Placeholder YouTube video ID detected: ${videoId}`);
    return null;
  }
  
  return videoId || null;
}

// Validate YouTube URL by checking if video exists
export async function validateYouTubeUrl(url: string): Promise<boolean> {
  try {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) {
      console.warn('Invalid YouTube URL format:', url);
      return false;
    }

    console.log(`Validating YouTube video ID: ${videoId}`);

    // Try multiple thumbnail sizes as fallback
    const thumbnailUrls = [
      `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/default.jpg`,
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    ];
    
    for (let i = 0; i < thumbnailUrls.length; i++) {
      const thumbnailUrl = thumbnailUrls[i];
      if (!thumbnailUrl) continue;
      
      try {
        console.log(`Trying thumbnail ${i + 1}/${thumbnailUrls.length}: ${thumbnailUrl}`);
        
        const response = await fetch(thumbnailUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(5000) // Increased timeout
        });

        console.log(`Thumbnail response: ${response.status} ${response.statusText}`);

        if (response.ok && response.status === 200) {
          const contentLength = response.headers.get('content-length');
          console.log(`Content length: ${contentLength}`);
          
          // Very lenient check - accept almost any valid response
          if (!contentLength || parseInt(contentLength) > 100) {
            console.log(`YouTube video ${videoId} validated successfully`);
            return true;
          }
        }
      } catch (fetchError) {
        console.warn(`Thumbnail ${i + 1} failed:`, fetchError);
        continue;
      }
    }
    
    console.warn(`All thumbnail validation attempts failed for video: ${videoId}`);
    return false;
    
  } catch (error) {
    console.warn('YouTube URL validation error:', error);
    return false;
  }
}

// Clean and normalize YouTube URL
export function normalizeYouTubeUrl(url: string): string | null {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    return null;
  }
  
  return `https://www.youtube.com/watch?v=${videoId}`;
}
// YouTube video search utilities using direct scraping
import { AnalysisResult } from './types.js';

interface YouTubeSearchResult {
  url: string;
  title: string;
  channel: string;
  views?: string;
  duration?: string;
}

// Search for YouTube videos using OpenAI-generated search term
export async function searchYouTubeVideos(description: string, analysis?: AnalysisResult): Promise<YouTubeSearchResult[] | null> {
  try {
    console.log(`Searching YouTube videos for: ${description}`);
    
    // Use OpenAI-generated search term if available, otherwise generate one
    let searchQuery: string;
    if (analysis?.youtube_search_term) {
      searchQuery = analysis.youtube_search_term;
      console.log(`Using OpenAI search term: "${searchQuery}"`);
    } else {
      searchQuery = generateSimpleSearchTerm(description, analysis);
      console.log(`Fallback search term: "${searchQuery}"`);
    }
    
    const youtubeUrls = await searchForYouTube(searchQuery);
    
    if (youtubeUrls.length > 0) {
      // Return up to 5 YouTube videos
      const topVideos = youtubeUrls.slice(0, 5);
      console.log(`Found ${topVideos.length} YouTube videos:`);
      topVideos.forEach((video, index) => {
        console.log(`  ${index + 1}. ${video.url} - ${video.title}`);
      });
      return topVideos;
    }
    
    console.log('No YouTube videos found in search results');
    return null;
    
  } catch (error) {
    console.warn('YouTube search failed:', error);
    return null;
  }
}

// Generate optimized search term using simple keyword extraction (fast, no API calls)
function generateSimpleSearchTerm(description: string, analysis?: AnalysisResult): string {
  try {
    // Extract key terms from description
    const desc = description.toLowerCase();
    
    // Common home improvement keywords that work well for YouTube searches
    const keywords = [];
    
    // Add "how to" or "DIY" prefix for better YouTube results
    const hasHowTo = desc.includes('how to') || desc.includes('how do');
    const hasDIY = desc.includes('diy') || desc.includes('do it yourself');
    
    if (!hasHowTo && !hasDIY) {
      keywords.push('how to');
    }
    
    // Extract main action words
    const actionWords = ['fix', 'repair', 'install', 'replace', 'remove', 'clean', 'paint', 'caulk', 'seal', 'patch'];
    for (const action of actionWords) {
      if (desc.includes(action)) {
        keywords.push(action);
        break; // Only use one main action
      }
    }
    
    // Extract material/object words
    const materialWords = ['drywall', 'wall', 'ceiling', 'floor', 'tile', 'grout', 'paint', 'caulk', 'pipe', 'faucet', 'outlet', 'switch', 'light', 'door', 'window', 'toilet', 'sink', 'bathtub', 'shower'];
    for (const material of materialWords) {
      if (desc.includes(material)) {
        keywords.push(material);
      }
    }
    
    // Use analysis insights if available
    if (analysis) {
      // Add first material or tool if relevant
      const firstMaterial = analysis.materials?.[0]?.name?.toLowerCase();
      const firstTool = analysis.tools?.[0]?.name?.toLowerCase();
      
      if (firstMaterial && !keywords.includes(firstMaterial)) {
        keywords.push(firstMaterial);
      }
      if (firstTool && !keywords.includes(firstTool) && keywords.length < 4) {
        keywords.push(firstTool);
      }
    }
    
    // Fallback: extract first few meaningful words from description
    if (keywords.length < 2) {
      const words = description.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !['this', 'that', 'with', 'have', 'need', 'want', 'like', 'would', 'could', 'should'].includes(word))
        .slice(0, 3);
      keywords.push(...words);
    }
    
    // Create search term (max 6 words for better results)
    const searchTerm = keywords.slice(0, 6).join(' ');
    return searchTerm || description.slice(0, 50); // Fallback to truncated description
    
  } catch (error) {
    console.warn('Failed to generate simple search term, using description:', error);
    return description;
  }
}

async function searchForYouTube(searchQuery: string): Promise<YouTubeSearchResult[]> {
  try {
    // Use YouTube search directly with minimal processing
    const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    
    console.log(`YouTube Search URL: ${youtubeSearchUrl}`);
    
    const response = await fetch(youtubeSearchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(3000) // Very fast timeout
    });

    if (!response.ok) {
      console.warn(`YouTube search failed with status: ${response.status}`);
      return [];
    }

    const html = await response.text();
    
    // Fast, simple YouTube video extraction with minimal logging
    const startTime = Date.now();
    const youtubeUrls = extractYouTubeUrlsFast(html);
    const extractionTime = Date.now() - startTime;
    
    console.log(`Fast extraction: found ${youtubeUrls.length} YouTube videos in ${extractionTime}ms`);
    
    return youtubeUrls;
    
  } catch (error) {
    console.warn('YouTube search request failed:', error);
    return [];
  }
}

// Validate if a title looks like a complete YouTube video title
function isValidYouTubeTitle(title: string): boolean {
  // Skip titles that look like fragments or incomplete sentences
  const lowerTitle = title.toLowerCase();
  
  // Skip if it starts with common sentence fragments
  const invalidStarts = [
    'and ', 'but ', 'or ', 'so ', 'then ', 'that ', 'this ', 'the ', 'a ',
    'because ', 'since ', 'when ', 'where ', 'what ', 'why ', 'who ',
    'cut a ', 'that way', 'mistake with'
  ];
  
  for (const start of invalidStarts) {
    if (lowerTitle.startsWith(start)) {
      return false;
    }
  }
  
  // Skip if it ends with incomplete sentence patterns
  const invalidEnds = [
    ' and', ' but', ' or', ' so', ' that', ' this', ' the', ' a',
    ' about', ' with', ' from', ' to', ' in', ' on', ' at'
  ];
  
  for (const end of invalidEnds) {
    if (lowerTitle.endsWith(end)) {
      return false;
    }
  }
  
  // Skip if it contains too many incomplete words or looks fragmented
  const words = title.split(' ');
  if (words.length < 3) {
    return false; // Too short to be a proper title
  }
  
  // Check for common video title patterns (positive indicators)
  const goodPatterns = [
    /how to/i,
    /tutorial/i,
    /guide/i,
    /fix/i,
    /repair/i,
    /install/i,
    /diy/i,
    /step by step/i,
    /easy way/i,
    /best way/i,
    /complete/i,
    /full/i,
    /\d+ (steps?|ways?|methods?|tips?)/i
  ];
  
  const hasGoodPattern = goodPatterns.some(pattern => pattern.test(title));
  
  // If it has good patterns, it's probably valid
  if (hasGoodPattern) {
    return true;
  }
  
  // For titles without explicit good patterns, be more selective
  // Must be reasonably long and not contain fragment indicators
  return title.length >= 25 && !lowerTitle.includes('...') && !lowerTitle.includes('...');
}

// Fast, lightweight YouTube video extraction
function extractYouTubeUrlsFast(html: string): YouTubeSearchResult[] {
  const results: YouTubeSearchResult[] = [];
  
  try {
    // Extract videos from YouTube's modern JSON structure
    const sampleMatches = html.match(/\/watch\?v=[a-zA-Z0-9_-]{11}/g);
    if (!sampleMatches) {
      console.log('No YouTube video URLs found in HTML');
      return results;
    }
    // Pattern to match any object with videoId, thumbnail, and title structure
    const pattern = /"videoId":"([a-zA-Z0-9_-]{11})"[^{}]*"thumbnail":\s*\{(?:[^{}]|\{[^{}]*\})*\}[^{}]*"title":\s*\{\s*"runs":\s*\[\s*\{\s*"text":"([^"]+)"/g
    
    const seenVideoIds = new Set<string>();
    let jsonMatch;
    
    while ((jsonMatch = pattern.exec(html)) !== null && results.length < 5) {
      const videoId = jsonMatch[1];
      const title = jsonMatch[2];
  
      // Only take the first match for each unique video ID
      if (videoId && title && !seenVideoIds.has(videoId)) {
        seenVideoIds.add(videoId);
        
        const cleanTitle = title
          .replace(/\\u0026/g, '&')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim();
        
        // Skip titles that are too short or look like fragments
        if (cleanTitle.length > 15 && isValidYouTubeTitle(cleanTitle)) {
          results.push({
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: cleanTitle,
            channel: 'YouTube'
          });
        }
      }
    }
    
    // If no results, fall back to original method
    if (results.length === 0) {
      console.log('No videos found with JSON method, falling back to URL patterns');
      
      const fallbackPattern = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
      const fallbackSeenIds = new Set<string>();
      let fallbackMatch;
      
      while ((fallbackMatch = fallbackPattern.exec(html)) !== null && results.length < 5) {
        const videoId = fallbackMatch[1];
        if (videoId && !fallbackSeenIds.has(videoId)) {
          fallbackSeenIds.add(videoId);
          results.push({
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: 'YouTube Tutorial',
            channel: 'YouTube'
          });
        }
      }
    }
    
    return results;
    
  } catch (error) {
    console.warn('Fast YouTube extraction failed:', error);
    return [];
  }
}
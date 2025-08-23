"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchYouTubeVideos = searchYouTubeVideos;
async function searchYouTubeVideos(description, analysis) {
    try {
        console.log(`Searching YouTube videos for: ${description}`);
        let searchQuery;
        if (analysis?.youtube_search_term) {
            searchQuery = analysis.youtube_search_term;
            console.log(`Using OpenAI search term: "${searchQuery}"`);
        }
        else {
            searchQuery = generateSimpleSearchTerm(description, analysis);
            console.log(`Fallback search term: "${searchQuery}"`);
        }
        const youtubeUrls = await searchForYouTube(searchQuery);
        if (youtubeUrls.length > 0) {
            const topVideos = youtubeUrls.slice(0, 5);
            console.log(`Found ${topVideos.length} YouTube videos:`);
            topVideos.forEach((video, index) => {
                console.log(`  ${index + 1}. ${video.url} - ${video.title}`);
            });
            return topVideos;
        }
        console.log('No YouTube videos found in search results');
        return null;
    }
    catch (error) {
        console.warn('YouTube search failed:', error);
        return null;
    }
}
function generateSimpleSearchTerm(description, analysis) {
    try {
        const desc = description.toLowerCase();
        const keywords = [];
        const hasHowTo = desc.includes('how to') || desc.includes('how do');
        const hasDIY = desc.includes('diy') || desc.includes('do it yourself');
        if (!hasHowTo && !hasDIY) {
            keywords.push('how to');
        }
        const actionWords = ['fix', 'repair', 'install', 'replace', 'remove', 'clean', 'paint', 'caulk', 'seal', 'patch'];
        for (const action of actionWords) {
            if (desc.includes(action)) {
                keywords.push(action);
                break;
            }
        }
        const materialWords = ['drywall', 'wall', 'ceiling', 'floor', 'tile', 'grout', 'paint', 'caulk', 'pipe', 'faucet', 'outlet', 'switch', 'light', 'door', 'window', 'toilet', 'sink', 'bathtub', 'shower'];
        for (const material of materialWords) {
            if (desc.includes(material)) {
                keywords.push(material);
            }
        }
        if (analysis) {
            const firstMaterial = analysis.materials?.[0]?.name?.toLowerCase();
            const firstTool = analysis.tools?.[0]?.name?.toLowerCase();
            if (firstMaterial && !keywords.includes(firstMaterial)) {
                keywords.push(firstMaterial);
            }
            if (firstTool && !keywords.includes(firstTool) && keywords.length < 4) {
                keywords.push(firstTool);
            }
        }
        if (keywords.length < 2) {
            const words = description.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 3 && !['this', 'that', 'with', 'have', 'need', 'want', 'like', 'would', 'could', 'should'].includes(word))
                .slice(0, 3);
            keywords.push(...words);
        }
        const searchTerm = keywords.slice(0, 6).join(' ');
        return searchTerm || description.slice(0, 50);
    }
    catch (error) {
        console.warn('Failed to generate simple search term, using description:', error);
        return description;
    }
}
async function searchForYouTube(searchQuery) {
    try {
        const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
        console.log(`YouTube Search URL: ${youtubeSearchUrl}`);
        const response = await fetch(youtubeSearchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) {
            console.warn(`YouTube search failed with status: ${response.status}`);
            return [];
        }
        const html = await response.text();
        const startTime = Date.now();
        const youtubeUrls = extractYouTubeUrlsFast(html);
        const extractionTime = Date.now() - startTime;
        console.log(`Fast extraction: found ${youtubeUrls.length} YouTube videos in ${extractionTime}ms`);
        return youtubeUrls;
    }
    catch (error) {
        console.warn('YouTube search request failed:', error);
        return [];
    }
}
function isValidYouTubeTitle(title) {
    const lowerTitle = title.toLowerCase();
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
    const invalidEnds = [
        ' and', ' but', ' or', ' so', ' that', ' this', ' the', ' a',
        ' about', ' with', ' from', ' to', ' in', ' on', ' at'
    ];
    for (const end of invalidEnds) {
        if (lowerTitle.endsWith(end)) {
            return false;
        }
    }
    const words = title.split(' ');
    if (words.length < 3) {
        return false;
    }
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
    if (hasGoodPattern) {
        return true;
    }
    return title.length >= 25 && !lowerTitle.includes('...') && !lowerTitle.includes('...');
}
function extractYouTubeUrlsFast(html) {
    const results = [];
    try {
        const sampleMatches = html.match(/\/watch\?v=[a-zA-Z0-9_-]{11}/g);
        if (!sampleMatches) {
            console.log('No YouTube video URLs found in HTML');
            return results;
        }
        const patterns = [
            /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"[^}]*"title":\{"runs":\[\{"text":"([^"]+)"/g,
            /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"[^}]*"title":\{"simpleText":"([^"]+)"/g,
            /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"[^}]*"title":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/g,
            /"videoId":"([a-zA-Z0-9_-]{11})"[^}]*"title":\{"runs":\[\{"text":"([^"]+)"/g,
            /"videoId":"([a-zA-Z0-9_-]{11})".*?"title"[^}]*"text":"([^"]+)"/g
        ];
        const seenVideoIds = new Set();
        for (let p = 0; p < patterns.length && results.length < 5; p++) {
            const pattern = patterns[p];
            if (!pattern)
                continue;
            let jsonMatch;
            pattern.lastIndex = 0;
            while ((jsonMatch = pattern.exec(html)) !== null && results.length < 5) {
                const videoId = jsonMatch[1];
                const title = jsonMatch[2];
                console.log(`Pattern ${p} matched:`, {
                    videoId,
                    title,
                    fullMatch: jsonMatch[0].substring(0, 200) + '...'
                });
                if (videoId && title && !seenVideoIds.has(videoId)) {
                    seenVideoIds.add(videoId);
                    const cleanTitle = title
                        .replace(/\\u0026/g, '&')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\')
                        .replace(/&quot;/g, '"')
                        .replace(/&amp;/g, '&')
                        .trim();
                    if (cleanTitle.length > 15 && isValidYouTubeTitle(cleanTitle)) {
                        results.push({
                            url: `https://www.youtube.com/watch?v=${videoId}`,
                            title: cleanTitle,
                            channel: 'YouTube'
                        });
                    }
                }
            }
            if (results.length > 0) {
                break;
            }
        }
        if (results.length === 0) {
            console.log('No videos found with JSON method, falling back to URL patterns');
            const fallbackPattern = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
            const fallbackSeenIds = new Set();
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
    }
    catch (error) {
        console.warn('Fast YouTube extraction failed:', error);
        return [];
    }
}
//# sourceMappingURL=youtubeSearch.js.map
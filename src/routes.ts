import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { 
  createTicket, 
  createAsset, 
  createAnalysis, 
  updateTicketStatus, 
  getTicketsWithAnalysis,
  createContactSubmission
} from './db.js';
import { analyzeWithOpenAI } from './openai.js';
import { addProductImages } from './productImages.js';
import { validateYouTubeUrl, normalizeYouTubeUrl } from './youtubeValidator.js';
import { searchYouTubeVideos } from './youtubeSearch.js';
import { processImageForOpenAI, cleanupProcessedImage } from './imageUtils.js';
import { AnalyzeRequest, AnalyzeResponse, YouTubeVideo } from './types.js';
import { generateQuestionsWithAI } from './questionGenerator.js';

// Fallback YouTube videos for common home issues
function getFallbackYouTubeVideo(description: string): string | null {
  const desc = description.toLowerCase();
  
  // Working YouTube videos - validated to exist
  if (desc.includes('drywall') || desc.includes('wall') || desc.includes('hole') || desc.includes('crack')) {
    return 'https://www.youtube.com/watch?v=xDMP3i36naA'; // Working drywall tutorial video
  }
  
  if (desc.includes('caulk') || desc.includes('seal') || desc.includes('bathroom') || desc.includes('bathtub')) {
    return 'https://www.youtube.com/watch?v=xDMP3i36naA'; // Fallback to working video
  }
  
  if (desc.includes('paint') || desc.includes('primer') || desc.includes('painting')) {
    return 'https://www.youtube.com/watch?v=xDMP3i36naA'; // Fallback to working video
  }
  
  if (desc.includes('plumb') || desc.includes('pipe') || desc.includes('leak') || desc.includes('faucet')) {
    return 'https://www.youtube.com/watch?v=xDMP3i36naA'; // Fallback to working video
  }
  
  if (desc.includes('electrical') || desc.includes('outlet') || desc.includes('wire') || desc.includes('switch')) {
    return 'https://www.youtube.com/watch?v=xDMP3i36naA'; // Fallback to working video
  }
  
  if (desc.includes('floor') || desc.includes('tile') || desc.includes('laminate') || desc.includes('hardwood')) {
    return 'https://www.youtube.com/watch?v=xDMP3i36naA'; // Fallback to working video
  }
  
  // Generic home improvement video for other cases
  return 'https://www.youtube.com/watch?v=xDMP3i36naA'; // Working fallback video
}

const router = Router();

// Configure multer for file uploads
const uploadDir = process.env.UPLOAD_DIR || 'uploads';

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// POST /api/analyze
router.post('/analyze', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  let processedImagePath: string | undefined;
  let imagePath: string | undefined;
  
  try {
    const startTime = Date.now();
    const { description, email }: AnalyzeRequest = req.body;
    
    // Validate input
    if (!description && !req.file) {
      res.status(400).json({ 
        error: 'Provide a description or an image.' 
      });
      return;
    }
    
    const finalDescription = description || 'User uploaded an image for analysis';
    
    // Run ticket creation and image processing in parallel
    const [ticketId, imageProcessingResult] = await Promise.all([
      createTicket(finalDescription, email),
      req.file ? processImageForOpenAI(req.file.path).catch(error => {
        console.warn('Failed to process image, using original:', error);
        return { processedPath: req.file!.path, originalSize: req.file!.size, processedSize: req.file!.size, width: 0, height: 0 };
      }) : Promise.resolve(null)
    ]);
    
    // Save asset if image was uploaded
    if (req.file && imageProcessingResult) {
      const assetId = await createAsset(
        ticketId,
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        req.file.size
      );
      imagePath = req.file.path;
      processedImagePath = imageProcessingResult.processedPath;
      console.log(`Image processed: ${imageProcessingResult.originalSize} bytes → ${imageProcessingResult.processedSize} bytes`);
    }
    
    // Analyze with OpenAI using processed image
    const openaiStart = Date.now();
    let analysis = await analyzeWithOpenAI(finalDescription, processedImagePath);
    console.log(`OpenAI analysis completed in ${Date.now() - openaiStart}ms`);
    console.log('Analysis before product images:', JSON.stringify(analysis, null, 2));
    
    // Run product image search and YouTube search in parallel for better performance
    const parallelStart = Date.now();
    console.log('Starting parallel search for product images and YouTube videos...');
    const [analysisWithProducts, searchedVideos] = await Promise.all([
      addProductImages(analysis),
      searchYouTubeVideos(finalDescription, analysis)
    ]);
    console.log(`Parallel searches completed in ${Date.now() - parallelStart}ms`);
    
    // Update analysis with product images
    analysis = analysisWithProducts;
    
    // Handle YouTube URLs - prioritize search over OpenAI generation
    let validatedYouTubeUrl: string | null = null;
    let youtubeVideos: YouTubeVideo[] = [];
    
    if (searchedVideos && searchedVideos.length > 0) {
      console.log(`Found ${searchedVideos.length} YouTube videos via search`);
      youtubeVideos = searchedVideos;
      validatedYouTubeUrl = searchedVideos[0]?.url || null; // Keep first video for backward compatibility
    } else if (analysis.youtube_url) {
      // Fallback to OpenAI-provided URL if search fails
      console.log(`YouTube URL received from OpenAI: ${analysis.youtube_url}`);
      const normalizedUrl = normalizeYouTubeUrl(analysis.youtube_url);
      if (normalizedUrl) {
        console.log(`YouTube URL normalized: ${normalizedUrl}`);
        validatedYouTubeUrl = normalizedUrl;
        console.log(`YouTube URL accepted: ${normalizedUrl}`);
      } else {
        console.log(`YouTube URL format invalid: ${analysis.youtube_url}`);
      }
    }
    
    // Final fallback to hardcoded videos if all else fails
    if (!validatedYouTubeUrl) {
      console.log('No YouTube URL found via search or OpenAI - using fallback videos');
      const fallbackVideos = getFallbackYouTubeVideo(finalDescription);
      if (fallbackVideos) {
        validatedYouTubeUrl = fallbackVideos;
        console.log(`Using fallback YouTube URL: ${fallbackVideos}`);
      }
    }
    
    // Prepare response object
    const response: AnalyzeResponse = {
      ticketId,
      materials: analysis.materials || [],
      tools: analysis.tools || [],
      steps: analysis.steps || [],
      ...(analysis.likelihood && { likelihood: analysis.likelihood }),
      ...(analysis.safety && { safety: analysis.safety }),
      ...(validatedYouTubeUrl && { youtube_url: validatedYouTubeUrl }),
      ...(youtubeVideos.length > 0 && { youtube_videos: youtubeVideos })
    };
    
    // Send response immediately, then handle database operations and cleanup in background
    console.log(`Total analysis completed in ${Date.now() - startTime}ms`);
    res.json(response);
    
    // Run database operations and cleanup in parallel (non-blocking)
    Promise.all([
      createAnalysis(
        ticketId,
        analysis.materials || [],
        analysis.tools || [],
        analysis.steps || [],
        analysis.likelihood || undefined,
        analysis.safety || undefined,
        validatedYouTubeUrl || undefined
      ),
      updateTicketStatus(ticketId, 'analyzed'),
      processedImagePath && processedImagePath !== imagePath 
        ? cleanupProcessedImage(processedImagePath)
        : Promise.resolve()
    ]).catch(err => 
      console.warn('Background operations failed:', err)
    );
    
  } catch (error) {
    console.error('Analysis error:', error);
    
    // Cleanup processed image on error too
    if (processedImagePath && processedImagePath !== imagePath) {
      cleanupProcessedImage(processedImagePath).catch(err => 
        console.warn('Failed to cleanup processed image on error:', err)
      );
    }
    
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ 
          error: 'File size too large. Maximum size is 25MB.' 
        });
        return;
      }
    }
    
    res.status(500).json({ 
      error: 'Server error' 
    });
  }
});

// GET /api/tickets
router.get('/tickets', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const tickets = await getTicketsWithAnalysis(Math.min(limit, 100));
    res.json(tickets);
  } catch (error) {
    console.error('Failed to fetch tickets:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tickets' 
    });
  }
});

// POST /api/contact
router.post('/contact', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, subject, message } = req.body;
    
    // Validate required fields
    if (!name || !email || !subject || !message) {
      res.status(400).json({ 
        error: 'All fields are required (name, email, subject, message).' 
      });
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ 
        error: 'Please provide a valid email address.' 
      });
      return;
    }
    
    // Save to database
    const submissionId = await createContactSubmission(
      name.trim(),
      email.trim(),
      subject.trim(),
      message.trim()
    );
    
    console.log(`Contact form submission saved: ${submissionId} from ${email}`);
    
    res.json({ 
      success: true,
      message: 'Thank you for your message! We\'ll get back to you soon.',
      submissionId 
    });
    
  } catch (error) {
    console.error('Contact form submission error:', error);
    res.status(500).json({ 
      error: 'Failed to submit your message. Please try again.' 
    });
  }
});

// POST /api/generate-questions
router.post('/generate-questions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { description } = req.body;
    
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      res.status(400).json({ 
        error: 'Description is required' 
      });
      return;
    }

    console.log(`Generating questions for: "${description.substring(0, 100)}..."`);
    
    const questionSet = await generateQuestionsWithAI(description.trim());
    
    res.json({
      success: true,
      questionSet
    });
    
  } catch (error) {
    console.error('Question generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate follow-up questions' 
    });
  }
});

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

export default router;
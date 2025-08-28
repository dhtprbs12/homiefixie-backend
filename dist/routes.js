"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const db_js_1 = require("./db.js");
const openai_js_1 = require("./openai.js");
const productImages_js_1 = require("./productImages.js");
const youtubeValidator_js_1 = require("./youtubeValidator.js");
const youtubeSearch_js_1 = require("./youtubeSearch.js");
const imageUtils_js_1 = require("./imageUtils.js");
const questionGenerator_js_1 = require("./questionGenerator.js");
function getFallbackYouTubeVideo(description) {
    const desc = description.toLowerCase();
    if (desc.includes('drywall') || desc.includes('wall') || desc.includes('hole') || desc.includes('crack')) {
        return 'https://www.youtube.com/watch?v=xDMP3i36naA';
    }
    if (desc.includes('caulk') || desc.includes('seal') || desc.includes('bathroom') || desc.includes('bathtub')) {
        return 'https://www.youtube.com/watch?v=xDMP3i36naA';
    }
    if (desc.includes('paint') || desc.includes('primer') || desc.includes('painting')) {
        return 'https://www.youtube.com/watch?v=xDMP3i36naA';
    }
    if (desc.includes('plumb') || desc.includes('pipe') || desc.includes('leak') || desc.includes('faucet')) {
        return 'https://www.youtube.com/watch?v=xDMP3i36naA';
    }
    if (desc.includes('electrical') || desc.includes('outlet') || desc.includes('wire') || desc.includes('switch')) {
        return 'https://www.youtube.com/watch?v=xDMP3i36naA';
    }
    if (desc.includes('floor') || desc.includes('tile') || desc.includes('laminate') || desc.includes('hardwood')) {
        return 'https://www.youtube.com/watch?v=xDMP3i36naA';
    }
    return 'https://www.youtube.com/watch?v=xDMP3i36naA';
}
const router = (0, express_1.Router)();
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
const ensureUploadDir = async () => {
    try {
        await promises_1.default.access(uploadDir);
    }
    catch {
        await promises_1.default.mkdir(uploadDir, { recursive: true });
    }
};
const storage = multer_1.default.diskStorage({
    destination: async (req, file, cb) => {
        await ensureUploadDir();
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed'));
        }
    }
});
router.post('/analyze', upload.single('image'), async (req, res) => {
    let processedImagePath;
    let imagePath;
    try {
        const startTime = Date.now();
        const { description, email } = req.body;
        if (!description && !req.file) {
            res.status(400).json({
                error: 'Provide a description or an image.'
            });
            return;
        }
        const finalDescription = description || 'User uploaded an image for analysis';
        const [ticketId, imageProcessingResult] = await Promise.all([
            (0, db_js_1.createTicket)(finalDescription, email),
            req.file ? (0, imageUtils_js_1.processImageForOpenAI)(req.file.path).catch(error => {
                console.warn('Failed to process image, using original:', error);
                return { processedPath: req.file.path, originalSize: req.file.size, processedSize: req.file.size, width: 0, height: 0 };
            }) : Promise.resolve(null)
        ]);
        if (req.file && imageProcessingResult) {
            const assetId = await (0, db_js_1.createAsset)(ticketId, req.file.path, req.file.originalname, req.file.mimetype, req.file.size);
            imagePath = req.file.path;
            processedImagePath = imageProcessingResult.processedPath;
            console.log(`Image processed: ${imageProcessingResult.originalSize} bytes → ${imageProcessingResult.processedSize} bytes`);
        }
        const openaiStart = Date.now();
        let analysis = await (0, openai_js_1.analyzeWithOpenAI)(finalDescription, processedImagePath);
        console.log(`OpenAI analysis completed in ${Date.now() - openaiStart}ms`);
        console.log('Analysis before product images:', JSON.stringify(analysis, null, 2));
        const parallelStart = Date.now();
        console.log('Starting parallel search for product images and YouTube videos...');
        const [analysisWithProducts, searchedVideos] = await Promise.all([
            (0, productImages_js_1.addProductImages)(analysis),
            (0, youtubeSearch_js_1.searchYouTubeVideos)(finalDescription, analysis)
        ]);
        console.log(`Parallel searches completed in ${Date.now() - parallelStart}ms`);
        analysis = analysisWithProducts;
        let validatedYouTubeUrl = null;
        let youtubeVideos = [];
        if (searchedVideos && searchedVideos.length > 0) {
            console.log(`Found ${searchedVideos.length} YouTube videos via search`);
            youtubeVideos = searchedVideos;
            validatedYouTubeUrl = searchedVideos[0]?.url || null;
        }
        else if (analysis.youtube_url) {
            console.log(`YouTube URL received from OpenAI: ${analysis.youtube_url}`);
            const normalizedUrl = (0, youtubeValidator_js_1.normalizeYouTubeUrl)(analysis.youtube_url);
            if (normalizedUrl) {
                console.log(`YouTube URL normalized: ${normalizedUrl}`);
                validatedYouTubeUrl = normalizedUrl;
                console.log(`YouTube URL accepted: ${normalizedUrl}`);
            }
            else {
                console.log(`YouTube URL format invalid: ${analysis.youtube_url}`);
            }
        }
        if (!validatedYouTubeUrl) {
            console.log('No YouTube URL found via search or OpenAI - using fallback videos');
            const fallbackVideos = getFallbackYouTubeVideo(finalDescription);
            if (fallbackVideos) {
                validatedYouTubeUrl = fallbackVideos;
                console.log(`Using fallback YouTube URL: ${fallbackVideos}`);
            }
        }
        const response = {
            ticketId,
            materials: analysis.materials || [],
            tools: analysis.tools || [],
            steps: analysis.steps || [],
            ...(analysis.likelihood && { likelihood: analysis.likelihood }),
            ...(analysis.safety && { safety: analysis.safety }),
            ...(validatedYouTubeUrl && { youtube_url: validatedYouTubeUrl }),
            ...(youtubeVideos.length > 0 && { youtube_videos: youtubeVideos })
        };
        console.log(`Total analysis completed in ${Date.now() - startTime}ms`);
        res.json(response);
        Promise.all([
            (0, db_js_1.createAnalysis)(ticketId, analysis.materials || [], analysis.tools || [], analysis.steps || [], analysis.likelihood || undefined, analysis.safety || undefined, validatedYouTubeUrl || undefined),
            (0, db_js_1.updateTicketStatus)(ticketId, 'analyzed'),
            imagePath ? promises_1.default.unlink(imagePath).catch(err => console.warn('Failed to delete original image:', err)) : Promise.resolve(),
            processedImagePath && processedImagePath !== imagePath
                ? (0, imageUtils_js_1.cleanupProcessedImage)(processedImagePath)
                : Promise.resolve()
        ]).catch(err => console.warn('Background operations failed:', err));
    }
    catch (error) {
        console.error('Analysis error:', error);
        if (imagePath) {
            promises_1.default.unlink(imagePath).catch(err => console.warn('Failed to delete original image on error:', err));
        }
        if (processedImagePath && processedImagePath !== imagePath) {
            (0, imageUtils_js_1.cleanupProcessedImage)(processedImagePath).catch(err => console.warn('Failed to cleanup processed image on error:', err));
        }
        if (error instanceof multer_1.default.MulterError) {
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
router.get('/tickets', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const tickets = await (0, db_js_1.getTicketsWithAnalysis)(Math.min(limit, 100));
        res.json(tickets);
    }
    catch (error) {
        console.error('Failed to fetch tickets:', error);
        res.status(500).json({
            error: 'Failed to fetch tickets'
        });
    }
});
router.post('/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        if (!name || !email || !subject || !message) {
            res.status(400).json({
                error: 'All fields are required (name, email, subject, message).'
            });
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({
                error: 'Please provide a valid email address.'
            });
            return;
        }
        const submissionId = await (0, db_js_1.createContactSubmission)(name.trim(), email.trim(), subject.trim(), message.trim());
        console.log(`Contact form submission saved: ${submissionId} from ${email}`);
        res.json({
            success: true,
            message: 'Thank you for your message! We\'ll get back to you soon.',
            submissionId
        });
    }
    catch (error) {
        console.error('Contact form submission error:', error);
        res.status(500).json({
            error: 'Failed to submit your message. Please try again.'
        });
    }
});
router.post('/generate-questions', async (req, res) => {
    try {
        const { description } = req.body;
        if (!description || typeof description !== 'string' || description.trim().length === 0) {
            res.status(400).json({
                error: 'Description is required'
            });
            return;
        }
        console.log(`Generating questions for: "${description.substring(0, 100)}..."`);
        const questionSet = await (0, questionGenerator_js_1.generateQuestionsWithAI)(description.trim());
        res.json({
            success: true,
            questionSet
        });
    }
    catch (error) {
        console.error('Question generation error:', error);
        res.status(500).json({
            error: 'Failed to generate follow-up questions'
        });
    }
});
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});
exports.default = router;
//# sourceMappingURL=routes.js.map
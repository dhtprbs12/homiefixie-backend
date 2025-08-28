"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
if (process.env.NODE_ENV === 'production') {
    dotenv_1.default.config();
}
else {
    dotenv_1.default.config({ path: '.env.local' });
}
const db_js_1 = require("./db.js");
const routes_js_1 = __importDefault(require("./routes.js"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
app.use('/uploads', express_1.default.static(path_1.default.resolve(uploadDir)));
app.use('/api', routes_js_1.default);
app.get('/', (req, res) => {
    res.json({
        name: 'House AI Server',
        version: '1.0.0',
        status: 'running'
    });
});
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error'
    });
});
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not found'
    });
});
async function startServer() {
    try {
        (0, db_js_1.initializeDB)();
        console.log('Database connection initialized');
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});
startServer();
//# sourceMappingURL=server.js.map
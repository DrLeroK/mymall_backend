import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import routes from './routes';
import { apiLimiter } from './middleware/rateLimiter';

const app = express();

// Security HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS
app.use(cors());

// Rate Limiting for API routes
app.use('/api/', apiLimiter);

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file uploads directory serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check API
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'HEALTHY',
    service: 'MyMall Multi-Tenant SaaS Backend',
    timestamp: new Date().toISOString(),
  });
});

// API Routes prefix
app.use('/api/v1', routes);

// 404 Route Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.originalUrl} not found on MyMall API server.`,
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('🔥 Unhandled Express Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

export default app;

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import codingRoutes from './modules/routes/coding.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/coding', codingRoutes);
  app.use('/', codingRoutes);

  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || 'Internal server error',
      details: err.details
    });
  });

  return app;
}

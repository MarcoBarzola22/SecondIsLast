import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import healthRouter from './routes/health.js';
import whitelistRouter from './routes/whitelist.js';
import authRouter from './routes/auth.js';
import tournamentsRouter from './routes/tournaments.js';
import matchesRouter from './routes/matches.js';
import historyRouter from './routes/history.js';
import rulesRouter from './routes/rules.js';
import adminRouter from './routes/admin.js';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  // Mount API routes
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/whitelist', whitelistRouter);
  app.use('/api/tournaments', tournamentsRouter);
  app.use('/api/matches', matchesRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/rules', rulesRouter);
  app.use('/api/admin', adminRouter);

  return app;
}

export const app = createApp();

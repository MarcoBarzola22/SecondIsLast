import dotenv from 'dotenv';
import path from 'path';

// Load root .env first, then server/.env if present
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  initialAdminEmail: process.env.INITIAL_ADMIN_EMAIL || 'admin@example.com',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
  googleClientId: process.env.GOOGLE_CLIENT_ID || 'mock-google-client-id',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock-google-client-secret',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};

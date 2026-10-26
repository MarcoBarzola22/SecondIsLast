import { createServer } from 'http';
import { app } from './app.js';
import { config } from './config/env.js';
import { initSocketServer } from './sockets/index.js';

// Global error handlers to shield the process against unexpected ECONNRESET or unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Process] Uncaught Exception:', error);
});

const httpServer = createServer(app);

httpServer.on('error', (err) => {
  console.error('[HttpServer] Error occurred on HTTP server:', err);
});

export const io = initSocketServer(httpServer);
app.set('io', io);

const server = httpServer.listen(config.port, () => {
  console.log(`Server listening on port ${config.port} in ${config.nodeEnv} mode`);
});

export default server;

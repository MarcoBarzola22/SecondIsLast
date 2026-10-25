import { createServer } from 'http';
import { app } from './app.js';
import { config } from './config/env.js';
import { initSocketServer } from './sockets/index.js';

const httpServer = createServer(app);
export const io = initSocketServer(httpServer);
app.set('io', io);

const server = httpServer.listen(config.port, () => {
  console.log(`Server listening on port ${config.port} in ${config.nodeEnv} mode`);
});

export default server;

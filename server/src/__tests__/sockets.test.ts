import { createServer, type Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { Role } from '@prisma/client';
import { createApp } from '../app.js';
import { initSocketServer, type AppSocketServer } from '../sockets/index.js';
import { userService } from '../services/userService.js';
import { whitelistService } from '../services/whitelistService.js';

describe('Socket.io Setup and Authentication (RNF-1, RNF-4)', () => {
  let httpServer: HttpServer;
  let io: AppSocketServer;
  let port: number;
  const clientSockets: ClientSocket[] = [];

  const validUser = {
    id: 'user-whitelisted-1',
    email: 'messi@secondislast.com',
    name: 'Lionel Messi',
    role: Role.PLAYER,
    playerId: 'player-messi',
  };

  const nonWhitelistedUser = {
    id: 'user-intruder-1',
    email: 'intruder@example.com',
    name: 'Intruder',
    role: Role.PLAYER,
  };

  beforeAll(async () => {
    const app = createApp();
    httpServer = createServer(app);
    io = initSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createClient(options: {
    auth?: Record<string, any>;
    extraHeaders?: Record<string, string>;
  }): ClientSocket {
    const socket = ioClient(`http://localhost:${port}`, {
      autoConnect: false,
      transports: ['websocket'],
      ...options,
    });
    clientSockets.push(socket);
    return socket;
  }

  describe('Handshake Authentication (RNF-4)', () => {
    it('rejects connection if no token is provided', async () => {
      const socket = createClient({});

      const error = await new Promise<Error>((resolve) => {
        socket.on('connect_error', (err) => resolve(err));
        socket.connect();
      });

      expect(error.message).toContain('No autorizado');
      expect(socket.connected).toBe(false);
    });

    it('rejects connection if token is invalid or expired', async () => {
      const socket = createClient({
        auth: { token: 'invalid.jwt.token' },
      });

      const error = await new Promise<Error>((resolve) => {
        socket.on('connect_error', (err) => resolve(err));
        socket.connect();
      });

      expect(error.message).toContain('Sesión inválida o expirada');
      expect(socket.connected).toBe(false);
    });

    it('rejects connection with Rioplatense message if user is not in Whitelist (RNF-4, RF-89)', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(false);
      const token = userService.signUserToken(nonWhitelistedUser as any);

      const socket = createClient({
        auth: { token },
      });

      const error = await new Promise<Error>((resolve) => {
        socket.on('connect_error', (err) => resolve(err));
        socket.connect();
      });

      expect(error.message).toBe(
        'No estás en la lista blanca de la juntada. Pedile al admin que te habilite'
      );
      expect(socket.connected).toBe(false);
    });

    it('successfully connects when valid token is passed in auth object', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      const token = userService.signUserToken(validUser as any);

      const socket = createClient({
        auth: { token },
      });

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', (err) => reject(err));
        socket.connect();
      });

      expect(socket.connected).toBe(true);
      expect(socket.id).toBeDefined();
    });

    it('successfully connects when valid token is passed via cookie header', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      const token = userService.signUserToken(validUser as any);

      const socket = createClient({
        extraHeaders: {
          cookie: `token=${token}; other=value`,
        },
      });

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', (err) => reject(err));
        socket.connect();
      });

      expect(socket.connected).toBe(true);
    });

    it('successfully connects when valid token is passed via Authorization Bearer header', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      const token = userService.signUserToken(validUser as any);

      const socket = createClient({
        extraHeaders: {
          authorization: `Bearer ${token}`,
        },
      });

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', (err) => reject(err));
        socket.connect();
      });

      expect(socket.connected).toBe(true);
    });
  });

  describe('Room Management: tournament:<tournamentId> (RNF-1)', () => {
    it('allows client to join tournament room and receive broadcast events', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      const token = userService.signUserToken(validUser as any);

      const socket = createClient({
        auth: { token },
      });

      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      // Join room via tournament:join
      const joinResponse = await new Promise<{ ok: boolean; room: string }>(
        (resolve) => {
          socket.emit('tournament:join', 'tourney-abc-123', (res: any) =>
            resolve(res)
          );
        }
      );

      expect(joinResponse.ok).toBe(true);
      expect(joinResponse.room).toBe('tournament:tourney-abc-123');

      // Test receiving broadcast in the room
      const receivedPayload = await new Promise<{ message: string }>((resolve) => {
        socket.on('test:broadcast', (data) => resolve(data));
        io.to('tournament:tourney-abc-123').emit('test:broadcast', {
          message: 'Hola torneo en vivo',
        });
      });

      expect(receivedPayload.message).toBe('Hola torneo en vivo');
    });

    it('auto-joins room if tournamentId is provided in handshake auth', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      const token = userService.signUserToken(validUser as any);

      const socket = createClient({
        auth: { token, tournamentId: 'tourney-auto-999' },
      });

      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      // Broadcast to room immediately
      const receivedPayload = await new Promise<string>((resolve) => {
        socket.on('room:ping', (msg) => resolve(msg));
        io.to('tournament:tourney-auto-999').emit('room:ping', 'pong');
      });

      expect(receivedPayload).toBe('pong');
    });

    it('allows client to leave tournament room', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      const token = userService.signUserToken(validUser as any);

      const socket = createClient({
        auth: { token },
      });

      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      await new Promise<{ ok: boolean }>((resolve) => {
        socket.emit('tournament:join', 'tourney-to-leave', (res: any) =>
          resolve(res)
        );
      });

      const leaveResponse = await new Promise<{ ok: boolean }>((resolve) => {
        socket.emit('tournament:leave', 'tourney-to-leave', (res: any) =>
          resolve(res)
        );
      });

      expect(leaveResponse.ok).toBe(true);
    });
  });
});

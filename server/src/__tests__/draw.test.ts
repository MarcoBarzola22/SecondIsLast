import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createServer, type Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { Role, TournamentStatus } from '@prisma/client';
import { createApp } from '../app.js';
import { config } from '../config/env.js';
import { initSocketServer, type AppSocketServer } from '../sockets/index.js';
import { whitelistService } from '../services/whitelistService.js';
import { prisma } from '../db.js';
import { clearActiveDrawSessions, type DrawAnimatedPayload } from '../sockets/drawHandler.js';

describe('Teams Preload, Preview and Synchronized Draw (T16 · RF-103, RF-104)', () => {
  let app: ReturnType<typeof createApp>;
  let httpServer: HttpServer;
  let io: AppSocketServer;
  let port: number;
  const clientSockets: ClientSocket[] = [];

  const adminUser = {
    id: 'user-admin-1',
    email: 'admin@secondislast.com',
    name: 'Admin Boss',
    role: Role.ADMIN,
    playerId: 'player-admin',
  };

  const player1 = {
    id: 'user-player-1',
    email: 'player1@secondislast.com',
    name: 'Lionel Messi',
    role: Role.PLAYER,
    playerId: 'player-messi',
  };

  const createToken = (payload: object) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
  };

  function createSocketClient(token: string, tournamentId?: string): ClientSocket {
    const socket = ioClient(`http://localhost:${port}`, {
      autoConnect: false,
      transports: ['websocket'],
      auth: { token, tournamentId },
    });
    clientSockets.push(socket);
    return socket;
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);

    app = createApp();
    httpServer = createServer(app);
    io = initSocketServer(httpServer);
    app.set('io', io);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    clearActiveDrawSessions();
    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    clientSockets.length = 0;
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  describe('GET /api/tournaments/teams (RF-103 Preview)', () => {
    it('returns default teams for a built-in theme', async () => {
      const token = createToken(player1);
      const res = await request(app)
        .get('/api/tournaments/teams?theme=Apertura 2006')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.theme).toBe('Apertura 2006');
      expect(res.body.teams).toContain('Boca Juniors');
      expect(res.body.teams).toContain('River Plate');
      expect(res.body.isCustom).toBe(false);
    });
  });

  describe('POST /api/tournaments/teams (RF-103 Admin Preload)', () => {
    it('returns 403 when non-admin attempts to preload teams', async () => {
      const token = createToken(player1);
      const res = await request(app)
        .post('/api/tournaments/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          theme: 'Champions 2006',
          teams: ['Barcelona', 'Arsenal', 'Milan', 'Villarreal'],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Solo los administradores');
    });

    it('returns 400 when teams list has fewer than 4 teams', async () => {
      const token = createToken(adminUser);
      const res = await request(app)
        .post('/api/tournaments/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          theme: 'Champions 2006',
          teams: ['Barcelona', 'Arsenal'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('al menos 4 equipos');
    });

    it('returns 400 when teams list has duplicate names', async () => {
      const token = createToken(adminUser);
      const res = await request(app)
        .post('/api/tournaments/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          theme: 'Champions 2006',
          teams: ['Barcelona', 'Arsenal', 'barcelona', 'Milan'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('duplicado');
    });

    it('successfully preloads teams when submitted by Admin and updates preview', async () => {
      const token = createToken(adminUser);
      const newTeams = ['Milan 07', 'Liverpool 07', 'Chelsea 07', 'Manchester United 07'];

      const postRes = await request(app)
        .post('/api/tournaments/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          theme: 'Semifinales Champions 2007',
          teams: newTeams,
        });

      expect(postRes.status).toBe(200);
      expect(postRes.body.teams).toEqual(newTeams);

      // Now verify GET returns this custom preloaded roster
      const getRes = await request(app)
        .get('/api/tournaments/teams?theme=Semifinales Champions 2007')
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.teams).toEqual(newTeams);
      expect(getRes.body.isCustom).toBe(true);
    });
  });

  describe('POST /api/tournaments/draw-teams and WebSocket draw:animated (RF-104)', () => {
    const tourneyId = 'tourney-draw-test';
    const mockTournament = {
      id: tourneyId,
      name: 'Torneo Apertura 2026',
      status: TournamentStatus.VOTING_FORMAT,
      theme: 'Apertura 2006',
      participants: [
        { id: 'part-1', playerId: 'player-1', player: { firstName: 'Lionel', lastName: 'Messi' }, isPresent: true },
        { id: 'part-2', playerId: 'player-2', player: { firstName: 'Angel', lastName: 'Di Maria' }, isPresent: true },
        { id: 'part-3', playerId: 'player-3', player: { firstName: 'Julian', lastName: 'Alvarez' }, isPresent: true },
        { id: 'part-4', playerId: 'player-4', player: { firstName: 'Emiliano', lastName: 'Martinez' }, isPresent: true },
      ],
    };

    it('returns 400 if quorum is less than 4 participants', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue({
        ...mockTournament,
        participants: mockTournament.participants.slice(0, 3),
      } as any);

      const token = createToken(adminUser);
      const res = await request(app)
        .post('/api/tournaments/draw-teams')
        .set('Authorization', `Bearer ${token}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('quórum mínimo');
    });

    it('executes synchronized team draw and emits draw:animated steps to connected sockets', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(mockTournament as any);
      const updateParticipantSpy = vi.spyOn(prisma.tournamentParticipant, 'update').mockResolvedValue({} as any);

      const socket = createSocketClient(createToken(player1), tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const receivedSteps: DrawAnimatedPayload[] = [];
      const drawPromise = new Promise<void>((resolve) => {
        socket.on('draw:animated', (data: DrawAnimatedPayload) => {
          receivedSteps.push(data);
          if (data.isFinal) {
            resolve();
          }
        });
      });

      // Pass fast intervalMs for testing (50ms)
      const res = await request(app)
        .post('/api/tournaments/draw-teams')
        .set('Authorization', `Bearer ${createToken(adminUser)}`)
        .send({
          tournamentId: tourneyId,
          intervalMs: 50,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('iniciado');
      expect(res.body.plan.steps).toHaveLength(4);

      await drawPromise;

      expect(receivedSteps.length).toBe(4);
      expect(receivedSteps[0]?.step).toBe(1);
      expect(receivedSteps[3]?.step).toBe(4);
      expect(receivedSteps[3]?.isFinal).toBe(true);
      expect(receivedSteps[3]?.assignments).toBeDefined();

      // Verify Prisma participant updates were triggered
      expect(updateParticipantSpy).toHaveBeenCalled();
    });

    it('supports draw:sync to provide resolved state upon client reconnection midway or after draw', async () => {
      vi.spyOn(prisma.tournamentParticipant, 'findMany').mockResolvedValue([
        { id: 'part-1', teamName: 'Boca Juniors' },
        { id: 'part-2', teamName: 'River Plate' },
        { id: 'part-3', teamName: 'Milan' },
        { id: 'part-4', teamName: 'Real Madrid' },
      ] as any);

      const socket = createSocketClient(createToken(player1), tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const ackResponse = await new Promise<any>((resolve) => {
        socket.emit('draw:sync', tourneyId, (res: any) => resolve(res));
      });

      expect(ackResponse.ok).toBe(true);
      expect(ackResponse.isComplete).toBe(true);
      expect(ackResponse.assignments['part-1']).toBe('Boca Juniors');
      expect(ackResponse.assignments['part-2']).toBe('River Plate');
    });
  });
});

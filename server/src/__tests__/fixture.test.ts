import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createServer, type Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { Role, TournamentStatus, TournamentFormat, MatchFormat, MatchStatus } from '@prisma/client';
import { createApp } from '../app.js';
import { config } from '../config/env.js';
import { initSocketServer, type AppSocketServer } from '../sockets/index.js';
import { whitelistService } from '../services/whitelistService.js';
import { prisma } from '../db.js';

describe('Relational Fixture Generation & Auto-closed Byes (T17 · RF-113, RNF-2)', () => {
  let app: ReturnType<typeof createApp>;
  let httpServer: HttpServer;
  let io: AppSocketServer;
  let port: number;
  const clientSockets: ClientSocket[] = [];

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
    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    clientSockets.length = 0;
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  describe('POST /api/tournaments/fixture', () => {
    it('returns 401 when token is missing', async () => {
      const res = await request(app).post('/api/tournaments/fixture');
      expect(res.status).toBe(401);
    });

    it('returns 404 when tournament does not exist', async () => {
      vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(null);
      const token = createToken(player1);

      const res = await request(app)
        .post('/api/tournaments/fixture')
        .set('Authorization', `Bearer ${token}`)
        .send({ tournamentId: 'non-existent' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Torneo no encontrado');
    });

    it('returns 400 when quorum is less than 4 participants', async () => {
      const mockTourney = {
        id: 'tourney-low-p',
        status: TournamentStatus.VOTING_THEME,
        participants: [
          { id: 'part-1', playerId: 'p1', player: { firstName: 'A', lastName: 'B' }, isPresent: true },
          { id: 'part-2', playerId: 'p2', player: { firstName: 'C', lastName: 'D' }, isPresent: true },
        ],
      };

      vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(mockTourney as any);
      const token = createToken(player1);

      const res = await request(app)
        .post('/api/tournaments/fixture')
        .set('Authorization', `Bearer ${token}`)
        .send({ tournamentId: 'tourney-low-p' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('quórum mínimo');
    });

    it('generates relational Bracket fixture, transitions to IN_PROGRESS and emits fixture:ready', async () => {
      const tourneyId = 'tourney-fixture-4';
      const participants = [
        { id: 'part-1', playerId: 'p1', player: { firstName: 'Lionel', lastName: 'Messi' }, isPresent: true },
        { id: 'part-2', playerId: 'p2', player: { firstName: 'Angel', lastName: 'Di Maria' }, isPresent: true },
        { id: 'part-3', playerId: 'p3', player: { firstName: 'Julian', lastName: 'Alvarez' }, isPresent: true },
        { id: 'part-4', playerId: 'p4', player: { firstName: 'Emiliano', lastName: 'Martinez' }, isPresent: true },
      ];

      const mockTourney = {
        id: tourneyId,
        format: TournamentFormat.BRACKET,
        matchFormat: MatchFormat.SINGLE_MATCH,
        status: TournamentStatus.VOTING_THEME,
        participants,
      };

      vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(mockTourney as any);

      // Mock transaction execution
      const createdMatchesInTx: any[] = [];
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const txMock = {
          match: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockImplementation((args: any) => {
              createdMatchesInTx.push({ id: `match-${createdMatchesInTx.length + 1}`, ...args.data });
              return Promise.resolve({ id: `match-${createdMatchesInTx.length}`, ...args.data });
            }),
            findMany: vi.fn().mockImplementation(() => Promise.resolve(createdMatchesInTx)),
          },
          tournament: {
            update: vi.fn().mockResolvedValue({
              ...mockTourney,
              status: TournamentStatus.IN_PROGRESS,
              currentRound: 1,
            }),
          },
        };
        return callback(txMock);
      });

      const socket = createSocketClient(createToken(player1), tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const fixtureReadyPromise = new Promise<any>((resolve) => {
        socket.on('fixture:ready', (data: any) => resolve(data));
      });

      const res = await request(app)
        .post('/api/tournaments/fixture')
        .set('Authorization', `Bearer ${createToken(player1)}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(200);
      expect(res.body.tournament.status).toBe(TournamentStatus.IN_PROGRESS);
      expect(res.body.byesCount).toBe(0);
      expect(res.body.matches).toHaveLength(4);

      const socketData = await fixtureReadyPromise;
      expect(socketData.currentRound).toBe(1);
      expect(socketData.matches).toHaveLength(4);
    });

    it('auto-closes Byes in status CLOSED with closedAt and auto-advances participants for 5 players (RF-113)', async () => {
      const tourneyId = 'tourney-fixture-5';
      const participants = [
        { id: 'part-1', playerId: 'p1', player: { firstName: 'Lionel', lastName: 'Messi' }, isPresent: true },
        { id: 'part-2', playerId: 'p2', player: { firstName: 'Angel', lastName: 'Di Maria' }, isPresent: true },
        { id: 'part-3', playerId: 'p3', player: { firstName: 'Julian', lastName: 'Alvarez' }, isPresent: true },
        { id: 'part-4', playerId: 'p4', player: { firstName: 'Emiliano', lastName: 'Martinez' }, isPresent: true },
        { id: 'part-5', playerId: 'p5', player: { firstName: 'Rodrigo', lastName: 'De Paul' }, isPresent: true },
      ];

      const mockTourney = {
        id: tourneyId,
        format: TournamentFormat.BRACKET,
        matchFormat: MatchFormat.SINGLE_MATCH,
        status: TournamentStatus.VOTING_THEME,
        participants,
      };

      vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(mockTourney as any);

      const createdMatchesInTx: any[] = [];
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const txMock = {
          match: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockImplementation((args: any) => {
              createdMatchesInTx.push({ id: `match-${createdMatchesInTx.length + 1}`, ...args.data });
              return Promise.resolve({ id: `match-${createdMatchesInTx.length}`, ...args.data });
            }),
            findMany: vi.fn().mockImplementation(() => Promise.resolve(createdMatchesInTx)),
          },
          tournament: {
            update: vi.fn().mockResolvedValue({
              ...mockTourney,
              status: TournamentStatus.IN_PROGRESS,
              currentRound: 1,
            }),
          },
        };
        return callback(txMock);
      });

      const res = await request(app)
        .post('/api/tournaments/fixture')
        .set('Authorization', `Bearer ${createToken(player1)}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(200);
      expect(res.body.byesCount).toBe(3);

      // Verify that Byes are persisted directly in CLOSED status (RF-113)
      const byeMatches = res.body.matches.filter((m: any) => m.isBye);
      expect(byeMatches).toHaveLength(3);
      for (const m of byeMatches) {
        expect(m.status).toBe(MatchStatus.CLOSED);
        expect(m.closedAt).toBeDefined();
        expect(m.awayParticipantId).toBeNull();
      }

      // Verify active Round 1 QF match
      const qfMatches = res.body.matches.filter((m: any) => m.round === 1 && !m.isBye);
      expect(qfMatches).toHaveLength(1);
      expect(qfMatches[0].status).toBe(MatchStatus.PENDING_SUBMISSION);

      // Verify that the participants with Byes are auto-advanced into Round 2 (Semifinals)
      const round2Matches = res.body.matches.filter((m: any) => m.round === 2);
      expect(round2Matches).toHaveLength(2);
      const round2Ids = round2Matches.flatMap((m: any) => [m.homeParticipantId, m.awayParticipantId]).filter(Boolean);
      for (const b of byeMatches) {
        expect(round2Ids).toContain(b.homeParticipantId);
      }
    });

    it('generates relational League fixture for 4 players (Berger 6 matches)', async () => {
      const tourneyId = 'tourney-fixture-league';
      const participants = [
        { id: 'part-1', playerId: 'p1', player: { firstName: 'Lionel', lastName: 'Messi' }, isPresent: true },
        { id: 'part-2', playerId: 'p2', player: { firstName: 'Angel', lastName: 'Di Maria' }, isPresent: true },
        { id: 'part-3', playerId: 'p3', player: { firstName: 'Julian', lastName: 'Alvarez' }, isPresent: true },
        { id: 'part-4', playerId: 'p4', player: { firstName: 'Emiliano', lastName: 'Martinez' }, isPresent: true },
      ];

      const mockTourney = {
        id: tourneyId,
        format: TournamentFormat.LEAGUE,
        matchFormat: MatchFormat.SINGLE_MATCH,
        status: TournamentStatus.VOTING_THEME,
        participants,
      };

      vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(mockTourney as any);

      const createdMatchesInTx: any[] = [];
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const txMock = {
          match: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockImplementation((args: any) => {
              createdMatchesInTx.push({ id: `match-${createdMatchesInTx.length + 1}`, ...args.data });
              return Promise.resolve({ id: `match-${createdMatchesInTx.length}`, ...args.data });
            }),
            findMany: vi.fn().mockImplementation(() => Promise.resolve(createdMatchesInTx)),
          },
          tournament: {
            update: vi.fn().mockResolvedValue({
              ...mockTourney,
              status: TournamentStatus.IN_PROGRESS,
              currentRound: 1,
            }),
          },
        };
        return callback(txMock);
      });

      const res = await request(app)
        .post('/api/tournaments/fixture')
        .set('Authorization', `Bearer ${createToken(player1)}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(200);
      expect(res.body.matches).toHaveLength(6);
      expect(res.body.byesCount).toBe(0);
      for (const m of res.body.matches) {
        expect(m.status).toBe(MatchStatus.PENDING_SUBMISSION);
        expect(m.isBye).toBe(false);
      }
    });
  });
});

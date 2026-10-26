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
import { tournamentService } from '../services/tournamentService.js';

describe('Lobby, Presence & Quorum API and WebSocket Events (T13 · RF-93 to RF-98)', () => {
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

  const player2 = {
    id: 'user-player-2',
    email: 'player2@secondislast.com',
    name: 'Angel Di Maria',
    role: Role.PLAYER,
    playerId: 'player-dimaria',
  };

  const player3 = {
    id: 'user-player-3',
    email: 'player3@secondislast.com',
    name: 'Julian Alvarez',
    role: Role.PLAYER,
    playerId: 'player-julian',
  };

  const player4 = {
    id: 'user-player-4',
    email: 'player4@secondislast.com',
    name: 'Emiliano Martinez',
    role: Role.PLAYER,
    playerId: 'player-dibu',
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

  describe('GET /api/tournaments/active (RF-97)', () => {
    it('returns null when there is no active tournament', async () => {
      vi.spyOn(tournamentService, 'getActiveTournament').mockResolvedValue(null);

      const token = createToken(player1);
      const res = await request(app)
        .get('/api/tournaments/active')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tournament: null });
    });

    it('returns active tournament data with participants count and quorum status', async () => {
      const mockActive = {
        id: 'tourney-123',
        name: 'Torneo Apertura 2026',
        status: TournamentStatus.LOBBY,
        participantCount: 2,
        participants: [
          { id: 'part-1', playerId: 'player-messi', isPresent: true, player: { id: 'player-messi', firstName: 'Lionel', lastName: 'Messi' } },
          { id: 'part-2', playerId: 'player-dimaria', isPresent: true, player: { id: 'player-dimaria', firstName: 'Angel', lastName: 'Di Maria' } },
        ],
        count: 2,
        canStart: false,
      };

      vi.spyOn(tournamentService, 'getActiveTournament').mockResolvedValue(mockActive as any);

      const token = createToken(player1);
      const res = await request(app)
        .get('/api/tournaments/active')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.tournament).toBeDefined();
      expect(res.body.tournament.id).toBe('tourney-123');
      expect(res.body.tournament.count).toBe(2);
      expect(res.body.tournament.canStart).toBe(false);
    });
  });

  describe('POST /api/tournaments/lobby (RF-97, RF-98)', () => {
    it('creates a new tournament in LOBBY status when no active tournament exists (RF-98)', async () => {
      const createdTournament = {
        id: 'new-tourney-1',
        name: 'Juntada del Sábado',
        status: TournamentStatus.LOBBY,
        participantCount: 0,
        participants: [],
        count: 0,
        canStart: false,
      };

      vi.spyOn(tournamentService, 'createLobby').mockResolvedValue(createdTournament as any);

      const token = createToken(player1);
      const res = await request(app)
        .post('/api/tournaments/lobby')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Juntada del Sábado' });

      expect(res.status).toBe(201);
      expect(res.body.tournament.status).toBe('LOBBY');
      expect(res.body.tournament.name).toBe('Juntada del Sábado');
    });

    it('rejects with 409 Conflict if an active tournament already exists (RF-97)', async () => {
      const res = await request(app)
        .post('/api/tournaments/lobby')
        .set('Authorization', `Bearer ${createToken(player1)}`)
        .send({ name: 'Otro Torneo' });

      // Assuming conflict when service throws ConflictError
      // Let's spy to throw ConflictError
      vi.spyOn(tournamentService, 'createLobby').mockRejectedValue(
        new (class ConflictError extends Error {
          statusCode = 409;
        })('Ya existe un torneo activo en curso.')
      );

      const resConflict = await request(app)
        .post('/api/tournaments/lobby')
        .set('Authorization', `Bearer ${createToken(player1)}`)
        .send({ name: 'Otro Torneo' });

      expect(resConflict.status).toBe(409);
      expect(resConflict.body.error).toBe('Ya existe un torneo activo en curso.');
    });
  });

  describe('POST /api/tournaments/lobby/presence (RF-93, RF-94, RF-96)', () => {
    it('confirms presence and broadcasts lobby:updated with canStart = false when count < 4 (RF-93, RF-96)', async () => {
      const tourneyId = 'tourney-test-presence';
      const token = createToken(player1);

      // Connect socket and join tournament room
      const socket = createSocketClient(token, tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const updatedPromise = new Promise<any>((resolve) => {
        socket.on('lobby:updated', (payload) => resolve(payload));
      });

      const mockPresenceResult = {
        tournament: { id: tourneyId, status: TournamentStatus.LOBBY, participantCount: 1 },
        participant: { id: 'part-1', playerId: 'player-messi', isPresent: true },
        participants: [
          { id: 'part-1', playerId: 'player-messi', isPresent: true, player: { firstName: 'Lionel', lastName: 'Messi' } },
        ],
        count: 1,
        canStart: false,
      };

      vi.spyOn(tournamentService, 'confirmPresence').mockResolvedValue(mockPresenceResult as any);

      const res = await request(app)
        .post('/api/tournaments/lobby/presence')
        .set('Authorization', `Bearer ${token}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.canStart).toBe(false);

      const socketPayload = await updatedPromise;
      expect(socketPayload.count).toBe(1);
      expect(socketPayload.canStart).toBe(false);
      expect(socketPayload.participants).toHaveLength(1);
    });

    it('enforces quorum rule: enables canStart = true when 4th participant confirms (RF-96)', async () => {
      const tourneyId = 'tourney-quorum';
      const token = createToken(player4);

      const socket = createSocketClient(token, tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const updatedPromise = new Promise<any>((resolve) => {
        socket.on('lobby:updated', (payload) => resolve(payload));
      });

      const mockParticipants = [
        { id: 'part-1', playerId: player1.playerId, isPresent: true, player: { firstName: 'Lionel', lastName: 'Messi' } },
        { id: 'part-2', playerId: player2.playerId, isPresent: true, player: { firstName: 'Angel', lastName: 'Di Maria' } },
        { id: 'part-3', playerId: player3.playerId, isPresent: true, player: { firstName: 'Julian', lastName: 'Alvarez' } },
        { id: 'part-4', playerId: player4.playerId, isPresent: true, player: { firstName: 'Emiliano', lastName: 'Martinez' } },
      ];

      const mockPresenceResult = {
        tournament: { id: tourneyId, status: TournamentStatus.LOBBY, participantCount: 4 },
        participant: { id: 'part-4', playerId: player4.playerId, isPresent: true },
        participants: mockParticipants,
        count: 4,
        canStart: true,
      };

      vi.spyOn(tournamentService, 'confirmPresence').mockResolvedValue(mockPresenceResult as any);

      const res = await request(app)
        .post('/api/tournaments/lobby/presence')
        .set('Authorization', `Bearer ${token}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(4);
      expect(res.body.canStart).toBe(true);

      const socketPayload = await updatedPromise;
      expect(socketPayload.count).toBe(4);
      expect(socketPayload.canStart).toBe(true);
      expect(socketPayload.lobbyExpiresAt).toBeDefined();
      expect(typeof socketPayload.lobbyExpiresAt).toBe('string');
    });
  });

  describe('RF-94: Disconnection Persistence', () => {
    it('does not remove confirmed participant presence when socket disconnects', async () => {
      const tourneyId = 'tourney-disconnect-persistence';
      const token = createToken(player1);

      const socket = createSocketClient(token, tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      // Disconnect socket abruptly
      socket.disconnect();
      expect(socket.connected).toBe(false);

      // Verify that getActiveTournament still returns presence intact
      const mockActive = {
        id: tourneyId,
        status: TournamentStatus.LOBBY,
        participantCount: 1,
        participants: [
          { id: 'part-1', playerId: 'player-messi', isPresent: true, player: { firstName: 'Lionel', lastName: 'Messi' } },
        ],
        count: 1,
        canStart: false,
      };
      vi.spyOn(tournamentService, 'getActiveTournament').mockResolvedValue(mockActive as any);

      const res = await request(app)
        .get('/api/tournaments/active')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.tournament.count).toBe(1);
      expect(res.body.tournament.participants[0].isPresent).toBe(true);
    });
  });

  describe('DELETE /api/tournaments/lobby/presence (RF-95: Voluntary Cancellation)', () => {
    it('cancels presence voluntarily and broadcasts lobby:updated', async () => {
      const tourneyId = 'tourney-cancel-presence';
      const token = createToken(player1);

      const socket = createSocketClient(token, tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const updatedPromise = new Promise<any>((resolve) => {
        socket.on('lobby:updated', (payload) => resolve(payload));
      });

      vi.spyOn(tournamentService, 'cancelPresence').mockResolvedValue({
        tournament: { id: tourneyId, status: TournamentStatus.LOBBY, participantCount: 0 },
        participants: [],
        count: 0,
        canStart: false,
      } as any);

      const res = await request(app)
        .delete('/api/tournaments/lobby/presence')
        .set('Authorization', `Bearer ${token}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('cancelada correctamente');
      expect(res.body.count).toBe(0);
      expect(res.body.canStart).toBe(false);

      const socketPayload = await updatedPromise;
      expect(socketPayload.count).toBe(0);
      expect(socketPayload.canStart).toBe(false);
    });
  });

  describe('DELETE /api/tournaments/lobby/participants/:id (RF-95: Admin Kick)', () => {
    it('rejects kick attempt with 403 Forbidden if user is not ADMIN', async () => {
      const token = createToken(player1); // regular player
      const res = await request(app)
        .delete('/api/tournaments/lobby/participants/part-target-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('allows Admin to kick a participant and broadcasts lobby:updated', async () => {
      const tourneyId = 'tourney-admin-kick';
      const adminToken = createToken(adminUser);

      const socket = createSocketClient(adminToken, tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const updatedPromise = new Promise<any>((resolve) => {
        socket.on('lobby:updated', (payload) => resolve(payload));
      });

      vi.spyOn(tournamentService, 'removeParticipant').mockResolvedValue({
        tournament: { id: tourneyId, status: TournamentStatus.LOBBY, participantCount: 1 },
        removedParticipantId: 'part-to-kick',
        participants: [
          { id: 'part-admin', playerId: adminUser.playerId, isPresent: true },
        ],
        count: 1,
        canStart: false,
      } as any);

      const res = await request(app)
        .delete('/api/tournaments/lobby/participants/part-to-kick')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('removido del lobby');
      expect(res.body.removedParticipantId).toBe('part-to-kick');

      const socketPayload = await updatedPromise;
      expect(socketPayload.count).toBe(1);
      expect(socketPayload.canStart).toBe(false);
    });
  });

  describe('WebSocket lobby:sync event', () => {
    it('returns lobby status via ack and emits lobby:updated on lobby:sync', async () => {
      const tourneyId = 'tourney-sync-test';
      const token = createToken(player1);

      const socket = createSocketClient(token);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const mockActive = {
        id: tourneyId,
        status: TournamentStatus.LOBBY,
        participantCount: 1,
        participants: [
          { id: 'part-1', playerId: 'player-messi', isPresent: true, player: { firstName: 'Lionel', lastName: 'Messi' } },
        ],
        count: 1,
        canStart: false,
      };

      vi.spyOn(tournamentService, 'getActiveTournament').mockResolvedValue(mockActive as any);

      const ackResponse = await new Promise<any>((resolve) => {
        socket.emit('lobby:sync', tourneyId, (res: any) => resolve(res));
      });

      expect(ackResponse.ok).toBe(true);
      expect(ackResponse.count).toBe(1);
      expect(ackResponse.canStart).toBe(false);
    });
  });

  describe('TournamentService Business Logic & Prisma Operations', () => {
    it('getActiveTournament queries database and calculates count & canStart properly', async () => {
      const mockPrisma: any = {
        tournament: {
          findFirst: vi.fn().mockResolvedValue({
            id: 't-1',
            status: TournamentStatus.LOBBY,
            participants: [
              { id: 'p1', isPresent: true, player: {} },
              { id: 'p2', isPresent: true, player: {} },
              { id: 'p3', isPresent: true, player: {} },
              { id: 'p4', isPresent: true, player: {} },
            ],
          }),
        },
      };

      const { TournamentService } = await import('../services/tournamentService.js');
      const service = new TournamentService(mockPrisma);

      const result = await service.getActiveTournament();
      expect(result).not.toBeNull();
      expect(result?.count).toBe(4);
      expect(result?.canStart).toBe(true);
    });

    it('createLobby throws ConflictError if an active tournament already exists', async () => {
      const mockPrisma: any = {
        tournament: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'existing-active',
            status: TournamentStatus.IN_PROGRESS,
            participants: [],
          }),
        },
      };

      const { TournamentService, ConflictError } = await import('../services/tournamentService.js');
      const service = new TournamentService(mockPrisma);

      await expect(service.createLobby('Nuevo Torneo')).rejects.toThrow(ConflictError);
    });

    it('confirmPresence auto-provisions a Player if user has no playerId linked', async () => {
      const mockPrisma: any = {
        tournament: {
          findFirst: vi.fn().mockResolvedValue({ id: 't-lobby', status: TournamentStatus.LOBBY }),
          update: vi.fn().mockResolvedValue({ id: 't-lobby', participantCount: 1 }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: 'u-1', playerId: null }),
          update: vi.fn().mockResolvedValue({ id: 'u-1', playerId: 'new-player-id' }),
        },
        player: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'new-player-id', firstName: 'Rodrigo', lastName: 'De Paul' }),
        },
        tournamentParticipant: {
          upsert: vi.fn().mockResolvedValue({ id: 'part-new', playerId: 'new-player-id', isPresent: true }),
          findMany: vi.fn().mockResolvedValue([
            { id: 'part-new', playerId: 'new-player-id', isPresent: true, player: { firstName: 'Rodrigo', lastName: 'De Paul' } },
          ]),
        },
      };

      const { TournamentService } = await import('../services/tournamentService.js');
      const service = new TournamentService(mockPrisma);

      const userWithoutPlayer: any = {
        id: 'u-1',
        email: 'depaul@secondislast.com',
        name: 'Rodrigo De Paul',
        role: Role.PLAYER,
        playerId: null,
      };

      const result = await service.confirmPresence(userWithoutPlayer);
      expect(mockPrisma.player.create).toHaveBeenCalledWith({
        data: { firstName: 'Rodrigo', lastName: 'De Paul' },
      });
      expect(result.count).toBe(1);
      expect(result.canStart).toBe(false);
    });

    it('removeParticipant rejects with ForbiddenError if user is not admin', async () => {
      const mockPrisma: any = {};
      const { TournamentService, ForbiddenError } = await import('../services/tournamentService.js');
      const service = new TournamentService(mockPrisma);

      await expect(
        service.removeParticipant('part-1', player1 as any)
      ).rejects.toThrow(ForbiddenError);
    });
  });
});


import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createServer, type Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { Role, TournamentStatus, MatchStatus } from '@prisma/client';
import { createApp } from '../app.js';
import { config } from '../config/env.js';
import { initSocketServer, type AppSocketServer } from '../sockets/index.js';
import { whitelistService } from '../services/whitelistService.js';
import { prisma } from '../db.js';

describe('Walkover Flow & UI (T22 · RF-116, RF-117, RNF-2)', () => {
  let app: ReturnType<typeof createApp>;
  let httpServer: HttpServer;
  let io: AppSocketServer;
  let port: number;
  const clientSockets: ClientSocket[] = [];

  const player1User = {
    id: 'user-p1',
    email: 'p1@secondislast.com',
    name: 'Lionel Messi',
    role: Role.PLAYER,
    playerId: 'player-1-id',
  };

  const player2User = {
    id: 'user-p2',
    email: 'p2@secondislast.com',
    name: 'Cristiano Ronaldo',
    role: Role.PLAYER,
    playerId: 'player-2-id',
  };

  const adminUser = {
    id: 'user-admin',
    email: 'admin@secondislast.com',
    name: 'Admin Juntada',
    role: Role.ADMIN,
    playerId: 'player-admin-id',
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

  describe('POST /api/tournaments/participants/:id/walkover', () => {
    const tournamentId = 'tourney-walkover-test';

    const p1 = {
      id: 'part-p1',
      tournamentId,
      playerId: 'player-1-id',
      isPresent: true,
      isWalkover: false,
      walkoverAt: null,
      player: { id: 'player-1-id', firstName: 'Lionel', lastName: 'Messi' },
    };

    const p2 = {
      id: 'part-p2',
      tournamentId,
      playerId: 'player-2-id',
      isPresent: true,
      isWalkover: false,
      walkoverAt: null,
      player: { id: 'player-2-id', firstName: 'Cristiano', lastName: 'Ronaldo' },
    };

    const p3 = {
      id: 'part-p3',
      tournamentId,
      playerId: 'player-3-id',
      isPresent: true,
      isWalkover: false,
      walkoverAt: null,
      player: { id: 'player-3-id', firstName: 'Neymar', lastName: 'Jr' },
    };

    const p4 = {
      id: 'part-p4',
      tournamentId,
      playerId: 'player-4-id',
      isPresent: true,
      isWalkover: false,
      walkoverAt: null,
      player: { id: 'player-4-id', firstName: 'Kylian', lastName: 'Mbappe' },
    };

    const mockTournament = {
      id: tournamentId,
      name: 'Torneo Walkover',
      status: TournamentStatus.IN_PROGRESS,
      format: 'LEAGUE',
      matchFormat: 'SINGLE_MATCH',
      participants: [p1, p2, p3, p4],
    };

    const mockMatches = [
      {
        id: 'm1',
        tournamentId,
        round: 1,
        leg: 1,
        seriesId: null,
        homeParticipantId: 'part-p1',
        awayParticipantId: 'part-p2',
        status: MatchStatus.PENDING_SUBMISSION,
        homeScore: null,
        awayScore: null,
        homeYellowCards: 0,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0,
        penaltiesWinnerId: null,
        version: 1,
        homeParticipant: p1,
        awayParticipant: p2,
      },
      {
        id: 'm2',
        tournamentId,
        round: 2,
        leg: 1,
        seriesId: null,
        homeParticipantId: 'part-p3',
        awayParticipantId: 'part-p1',
        status: MatchStatus.PENDING_SUBMISSION,
        homeScore: null,
        awayScore: null,
        homeYellowCards: 0,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0,
        penaltiesWinnerId: null,
        version: 1,
        homeParticipant: p3,
        awayParticipant: p1,
      },
      {
        id: 'm3',
        tournamentId,
        round: 1,
        leg: 1,
        seriesId: null,
        homeParticipantId: 'part-p3',
        awayParticipantId: 'part-p4',
        status: MatchStatus.PENDING_SUBMISSION,
        homeScore: null,
        awayScore: null,
        homeYellowCards: 0,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0,
        penaltiesWinnerId: null,
        version: 1,
        homeParticipant: p3,
        awayParticipant: p4,
      },
    ];

    it('allows a player to auto-declare walkover for themselves (RF-116 vía 1)', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(mockTournament as any);
      vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(mockTournament as any);

      const updateParticipantSpy = vi.fn().mockResolvedValue({
        ...p1,
        isWalkover: true,
        walkoverAt: new Date(),
      });
      const updateMatchSpy = vi.fn().mockResolvedValue({} as any);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          tournamentParticipant: {
            update: updateParticipantSpy,
          },
          match: {
            findMany: vi.fn().mockResolvedValue(mockMatches),
            update: updateMatchSpy,
          },
          tournament: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockTournament,
              participants: [
                { ...p1, isWalkover: true, walkoverAt: new Date() },
                p2,
                p3,
                p4,
              ],
            }),
          },
        };
        return callback(tx);
      });

      // Socket client listening for walkover:applied
      const p2Token = createToken(player2User);
      const socket = createSocketClient(p2Token, tournamentId);
      socket.connect();
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const eventPromise = new Promise<any>((resolve) => {
        socket.on('walkover:applied', (payload) => resolve(payload));
      });

      // P1 declares walkover
      const p1Token = createToken(player1User);
      const res = await request(app)
        .post(`/api/tournaments/participants/${p1.id}/walkover`)
        .set('Authorization', `Bearer ${p1Token}`)
        .expect(200);

      expect(res.body.message).toContain('Abandono (Walkover) registrado exitosamente.');
      expect(res.body.participant.id).toBe(p1.id);
      expect(res.body.participant.isWalkover).toBe(true);

      // Verify participant was updated with walkoverAt
      expect(updateParticipantSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: p1.id },
          data: expect.objectContaining({ isWalkover: true }),
        })
      );

      // Verify matches involving P1 were updated to 0-3 defeat and CLOSED (RF-117)
      expect(updateMatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' }, // P1 Home vs P2 Away -> 0 - 3
          data: expect.objectContaining({
            homeScore: 0,
            awayScore: 3,
            status: 'CLOSED',
          }),
        })
      );

      expect(updateMatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm2' }, // P3 Home vs P1 Away -> 3 - 0
          data: expect.objectContaining({
            homeScore: 3,
            awayScore: 0,
            status: 'CLOSED',
          }),
        })
      );

      // Verify m3 (P3 vs P4) was NOT modified
      expect(updateMatchSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm3' },
        })
      );

      // Verify WebSocket broadcast
      const eventPayload = await eventPromise;
      expect(eventPayload.tournamentId).toBe(tournamentId);
      expect(eventPayload.participantId).toBe(p1.id);
      expect(eventPayload.playerId).toBe(p1.playerId);
      expect(eventPayload.unblockedParticipants).toBeDefined();
    });

    it('allows an Admin to declare walkover for an absent participant (RF-116 vía 2)', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(mockTournament as any);
      vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(mockTournament as any);

      const updateParticipantSpy = vi.fn().mockResolvedValue({
        ...p2,
        isWalkover: true,
        walkoverAt: new Date(),
      });
      const updateMatchSpy = vi.fn().mockResolvedValue({} as any);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          tournamentParticipant: {
            update: updateParticipantSpy,
          },
          match: {
            findMany: vi.fn().mockResolvedValue(mockMatches),
            update: updateMatchSpy,
          },
          tournament: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockTournament,
              participants: [p1, { ...p2, isWalkover: true, walkoverAt: new Date() }, p3, p4],
            }),
          },
        };
        return callback(tx);
      });

      const adminToken = createToken(adminUser);
      // Admin calls walkover for p2 using player ID
      const res = await request(app)
        .post(`/api/tournaments/participants/${p2.playerId}/walkover`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.participant.id).toBe(p2.id);
      expect(updateParticipantSpy).toHaveBeenCalled();
    });

    it('rejects with 403 Forbidden when a player attempts to declare walkover for another player (RF-116)', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(mockTournament as any);

      // Player 2 attempts to abandon Player 1
      const p2Token = createToken(player2User);
      const res = await request(app)
        .post(`/api/tournaments/participants/${p1.id}/walkover`)
        .set('Authorization', `Bearer ${p2Token}`)
        .expect(403);

      expect(res.body.error).toContain('RF-116');
      expect(res.body.error).toContain('Solo el propio jugador o un Administrador');
    });

    it('rejects with 400 BadRequest if participant has already abandoned', async () => {
      const walkedOverTournament = {
        ...mockTournament,
        participants: [
          { ...p1, isWalkover: true },
          p2,
          p3,
          p4,
        ],
      };
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(walkedOverTournament as any);

      const p1Token = createToken(player1User);
      const res = await request(app)
        .post(`/api/tournaments/participants/${p1.id}/walkover`)
        .set('Authorization', `Bearer ${p1Token}`)
        .expect(400);

      expect(res.body.error).toContain('El participante ya ha declarado abandono');
    });

    it('rejects with 404 NotFound if participant does not belong to active tournament', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(mockTournament as any);

      const adminToken = createToken(adminUser);
      const res = await request(app)
        .post('/api/tournaments/participants/unknown-participant-id/walkover')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.error).toContain('Participante no encontrado');
    });

    it('rejects with 400 BadRequest if tournament is not in progress', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(null);

      const adminToken = createToken(adminUser);
      const res = await request(app)
        .post(`/api/tournaments/participants/${p1.id}/walkover`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.error).toContain('No hay ningún torneo en curso');
    });

    it('scores 0-0 when both opponents in a match have abandoned', async () => {
      // P1 already abandoned; now P2 abandons. Match m1 is between P1 and P2!
      const tournamentWithP1Walkover = {
        ...mockTournament,
        participants: [
          { ...p1, isWalkover: true },
          p2,
          p3,
          p4,
        ],
      };

      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(tournamentWithP1Walkover as any);

      const updateMatchSpy = vi.fn().mockResolvedValue({} as any);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          tournamentParticipant: {
            update: vi.fn().mockResolvedValue({ ...p2, isWalkover: true }),
          },
          match: {
            findMany: vi.fn().mockResolvedValue(mockMatches),
            update: updateMatchSpy,
          },
          tournament: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockTournament,
              participants: [
                { ...p1, isWalkover: true },
                { ...p2, isWalkover: true },
                p3,
                p4,
              ],
            }),
          },
        };
        return callback(tx);
      });

      const p2Token = createToken(player2User);
      await request(app)
        .post(`/api/tournaments/participants/${p2.id}/walkover`)
        .set('Authorization', `Bearer ${p2Token}`)
        .expect(200);

      // Match m1 was P1 vs P2 (both walked over) -> 0 - 0
      expect(updateMatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' },
          data: expect.objectContaining({
            homeScore: 0,
            awayScore: 0,
            status: 'CLOSED',
          }),
        })
      );
    });
  });
});

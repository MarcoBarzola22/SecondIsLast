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
import {
  getTournamentPointsDistribution,
  getHeadToHeadKey,
} from '../domain/awardsAndRankings.js';
import { historyService } from '../services/historyService.js';

describe('Tournament Closure, Podium & Historical Tables (T23 · RF-110, Principle 5)', () => {
  let app: ReturnType<typeof createApp>;
  let httpServer: HttpServer;
  let io: AppSocketServer;
  let port: number;
  const clientSockets: ClientSocket[] = [];

  const player1User = {
    id: 'user-p1',
    email: 'messi@secondislast.com',
    name: 'Lionel Messi',
    role: Role.PLAYER,
    playerId: 'player-1',
  };

  const adminUser = {
    id: 'user-admin',
    email: 'admin@secondislast.com',
    name: 'Admin Juntada',
    role: Role.ADMIN,
    playerId: 'player-admin',
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

  describe('Pure Domain: Scaled Points & H2H Keys', () => {
    it('calculates scaled tournament points distribution correctly for N=4 and N=8 (Principle 5)', () => {
      // N = 4
      const dist4 = getTournamentPointsDistribution(4);
      expect(dist4.participantCount).toBe(4);
      expect(dist4.multiplier).toBe(1);
      expect(dist4.champion).toBe(10);
      expect(dist4.runnerUp).toBe(7);
      expect(dist4.third).toBe(5);
      expect(dist4.fourth).toBe(3);
      expect(dist4.participation).toBe(1);

      // N = 8
      const dist8 = getTournamentPointsDistribution(8);
      expect(dist8.participantCount).toBe(8);
      expect(dist8.multiplier).toBe(2);
      expect(dist8.champion).toBe(20);
      expect(dist8.runnerUp).toBe(14);
      expect(dist8.third).toBe(10);
      expect(dist8.fourth).toBe(6);
      expect(dist8.participation).toBe(1);
    });

    it('enforces canonical alphabetical ordering for HeadToHead keys', () => {
      const h2hOrder1 = getHeadToHeadKey('player-a', 'player-b');
      const h2hOrder2 = getHeadToHeadKey('player-b', 'player-a');
      expect(h2hOrder1).toBe('player-a_player-b');
      expect(h2hOrder2).toBe('player-a_player-b');
    });
  });

  describe('History Read Endpoints (/api/history/*)', () => {
    it('GET /api/history/stats returns historical stats for all players', async () => {
      const token = createToken(player1User);
      const mockStats = [
        {
          id: 'stats-1',
          playerId: 'player-1',
          points: 30,
          matchesPlayed: 10,
          matchesWon: 8,
          matchesDrawn: 1,
          matchesLost: 1,
          goalsFor: 25,
          goalsAgainst: 8,
          yellowCards: 2,
          redCards: 0,
          podiums: 3,
          firstPlaces: 2,
          secondPlaces: 1,
          thirdPlaces: 0,
          player: { id: 'player-1', name: 'Lionel Messi' },
        },
      ];

      vi.spyOn(prisma.historicalStats, 'findMany').mockResolvedValue(mockStats as any);

      const res = await request(app)
        .get('/api/history/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.stats).toHaveLength(1);
      expect(res.body.stats[0].playerId).toBe('player-1');
      expect(res.body.stats[0].points).toBe(30);
    });

    it('GET /api/history/annual returns ranking entries for the specified year', async () => {
      const token = createToken(player1User);
      const mockEntries = [
        {
          id: 'annual-1',
          year: 2026,
          playerId: 'player-1',
          points: 20,
          tournamentsPlayed: 2,
          podiums: 2,
          yellowCards: 1,
          redCards: 0,
          player: { id: 'player-1', name: 'Lionel Messi' },
        },
      ];

      vi.spyOn(prisma.annualRankingEntry, 'findMany').mockResolvedValue(mockEntries as any);

      const res = await request(app)
        .get('/api/history/annual?year=2026')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.year).toBe(2026);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].playerId).toBe('player-1');
    });

    it('GET /api/history/h2h returns head-to-head records', async () => {
      const token = createToken(player1User);
      const mockRecords = [
        {
          id: 'h2h-1',
          playerAId: 'player-1',
          playerBId: 'player-2',
          matchesPlayed: 3,
          winsA: 2,
          winsB: 1,
          draws: 0,
          goalsA: 6,
          goalsB: 4,
          playerA: { id: 'player-1', name: 'Lionel Messi' },
          playerB: { id: 'player-2', name: 'Cristiano Ronaldo' },
        },
      ];

      vi.spyOn(prisma.headToHeadRecord, 'findMany').mockResolvedValue(mockRecords as any);

      const res = await request(app)
        .get('/api/history/h2h')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.records).toHaveLength(1);
      expect(res.body.records[0].matchesPlayed).toBe(3);
    });

    it('GET /api/history/tournaments returns completed tournaments', async () => {
      const token = createToken(player1User);
      const mockTourneys = [
        {
          id: 'tourney-1',
          name: 'Copa Apertura',
          status: TournamentStatus.COMPLETED,
          winnerId: 'player-1',
          winner: { id: 'player-1', name: 'Lionel Messi' },
          participants: [],
        },
      ];

      vi.spyOn(prisma.tournament, 'findMany').mockResolvedValue(mockTourneys as any);

      const res = await request(app)
        .get('/api/history/tournaments')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.tournaments).toHaveLength(1);
      expect(res.body.tournaments[0].status).toBe(TournamentStatus.COMPLETED);
    });

    it('GET /api/history/players returns registered players from PostgreSQL (T47)', async () => {
      const token = createToken(player1User);
      const mockPlayers = [
        { id: 'p1', firstName: 'Marco', lastName: 'Barzola' },
        { id: 'p2', firstName: 'Nico', lastName: 'Gómez' },
      ];
      vi.spyOn(prisma.player, 'findMany').mockResolvedValue(mockPlayers as any);

      const res = await request(app)
        .get('/api/history/players')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.players).toHaveLength(2);
      expect(res.body.players[0].firstName).toBe('Marco');
    });

    it('GET /api/history/profiles/:playerId returns comprehensive career profile (T47)', async () => {
      const token = createToken(player1User);
      const mockPlayer = {
        id: 'player-1',
        firstName: 'Lionel',
        lastName: 'Messi',
        pendingYellowCards: 1,
        pendingRedCards: 0,
      };

      vi.spyOn(prisma.player, 'findUnique').mockResolvedValue(mockPlayer as any);
      vi.spyOn(prisma.tournament, 'findMany').mockResolvedValue([
        {
          id: 't1',
          name: 'Mundial 2026',
          format: 'BRACKET',
          status: TournamentStatus.COMPLETED,
          createdAt: new Date(),
          participants: [
            { id: 'part-1', playerId: 'player-1', teamName: 'Argentina', player: mockPlayer },
            { id: 'part-2', playerId: 'player-2', teamName: 'Francia', player: { id: 'player-2', firstName: 'Kylian', lastName: 'Mbappé' } },
          ],
          matches: [
            {
              id: 'm1',
              seriesId: 'F',
              homeParticipantId: 'part-1',
              awayParticipantId: 'part-2',
              homeScore: 3,
              awayScore: 3,
              penaltiesWinnerId: 'part-1',
              isBye: false,
              round: 1,
              leg: 1,
            },
          ],
        },
      ] as any);

      const res = await request(app)
        .get('/api/history/profiles/player-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.player.id).toBe('player-1');
      expect(res.body.career.titles).toBe(1);
      expect(res.body.manoAMano.seriesWon).toBe(1);
      expect(res.body.manoAMano.penaltiesWon).toBe(1);
      expect(res.body.teamsUsed).toHaveLength(1);
      expect(res.body.teamsUsed[0].teamName).toBe('Argentina');
      expect(res.body.discipline.statusText).toContain('1/4 amarillas');
    });

    it('DELETE /api/history/reset rejects non-admin users with 403 Forbidden (T47)', async () => {
      const nonAdminToken = createToken(player1User);
      const res = await request(app)
        .delete('/api/history/reset')
        .set('Authorization', `Bearer ${nonAdminToken}`);

      expect(res.status).toBe(403);
    });

    it('DELETE /api/history/reset executes database transaction when requested by Admin (T47)', async () => {
      const adminToken = createToken(adminUser);
      const deleteAnnualMock = vi.fn().mockResolvedValue({ count: 5 });
      const deleteH2HMock = vi.fn().mockResolvedValue({ count: 3 });
      const deleteStatsMock = vi.fn().mockResolvedValue({ count: 4 });
      const deleteTourneysMock = vi.fn().mockResolvedValue({ count: 2 });

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          annualRankingEntry: { deleteMany: deleteAnnualMock },
          headToHeadRecord: { deleteMany: deleteH2HMock },
          historicalStats: { deleteMany: deleteStatsMock },
          tournament: { deleteMany: deleteTourneysMock },
        });
      });

      const res = await request(app)
        .delete('/api/history/reset')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Historial reseteado exitosamente');
      expect(deleteAnnualMock).toHaveBeenCalled();
      expect(deleteH2HMock).toHaveBeenCalled();
      expect(deleteStatsMock).toHaveBeenCalled();
      expect(deleteTourneysMock).toHaveBeenCalled();
    });
  });

  describe('Tournament Finalization & Podium Transition (POST /api/history/tournaments/:id/finish)', () => {
    const tournamentId = 'tourney-final-123';

    const participants = [
      { id: 'part-1', tournamentId, playerId: 'player-1', team: 'Argentina', player: { id: 'player-1', name: 'Lionel Messi' } },
      { id: 'part-2', tournamentId, playerId: 'player-2', team: 'Francia', player: { id: 'player-2', name: 'Kylian Mbappé' } },
      { id: 'part-3', tournamentId, playerId: 'player-3', team: 'Croacia', player: { id: 'player-3', name: 'Luka Modric' } },
      { id: 'part-4', tournamentId, playerId: 'player-4', team: 'Marruecos', player: { id: 'player-4', name: 'Achraf Hakimi' } },
    ];

    const completedMatches = [
      // Final (F): P1 defeats P2 3-2
      {
        id: 'm-f',
        tournamentId,
        seriesId: 'F',
        round: 2,
        leg: 1,
        homeParticipantId: 'part-1',
        awayParticipantId: 'part-2',
        homeScore: 3,
        awayScore: 2,
        homeYellowCards: 1,
        awayYellowCards: 2,
        homeRedCards: 0,
        awayRedCards: 0,
        penaltiesWinnerId: null,
        status: 'CLOSED',
        isBye: false,
      },
      // 3rd Place (TP): P3 defeats P4 2-1
      {
        id: 'm-tp',
        tournamentId,
        seriesId: 'TP',
        round: 2,
        leg: 1,
        homeParticipantId: 'part-3',
        awayParticipantId: 'part-4',
        homeScore: 2,
        awayScore: 1,
        homeYellowCards: 0,
        awayYellowCards: 1,
        homeRedCards: 0,
        awayRedCards: 0,
        penaltiesWinnerId: null,
        status: 'CLOSED',
        isBye: false,
      },
      // Semifinal 1 (SF1): P1 defeats P3 2-0
      {
        id: 'm-sf1',
        tournamentId,
        seriesId: 'SF1',
        round: 1,
        leg: 1,
        homeParticipantId: 'part-1',
        awayParticipantId: 'part-3',
        homeScore: 2,
        awayScore: 0,
        homeYellowCards: 0,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0,
        penaltiesWinnerId: null,
        status: 'CLOSED',
        isBye: false,
      },
      // Semifinal 2 (SF2): P2 defeats P4 1-0
      {
        id: 'm-sf2',
        tournamentId,
        seriesId: 'SF2',
        round: 1,
        leg: 1,
        homeParticipantId: 'part-2',
        awayParticipantId: 'part-4',
        homeScore: 1,
        awayScore: 0,
        homeYellowCards: 1,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0,
        penaltiesWinnerId: null,
        status: 'CLOSED',
        isBye: false,
      },
    ];

    const mockTournament = {
      id: tournamentId,
      name: 'Mundialito 2026',
      status: TournamentStatus.IN_PROGRESS,
      format: 'BRACKET',
      participants,
      matches: completedMatches,
      settings: {},
    };

    it('successfully closes tournament, transitions to COMPLETED, updates stats & emits tournament:finished (RF-110)', async () => {
      const token = createToken(adminUser);

      vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(mockTournament as any);

      // Spy on $transaction execution
      const historicalStatsUpsertSpy = vi.fn().mockResolvedValue({});
      const annualRankingEntryUpsertSpy = vi.fn().mockResolvedValue({});
      const headToHeadRecordUpsertSpy = vi.fn().mockResolvedValue({});
      const tournamentUpdateSpy = vi.fn().mockResolvedValue({
        ...mockTournament,
        status: TournamentStatus.COMPLETED,
        winnerId: 'player-1',
      });

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          historicalStats: { upsert: historicalStatsUpsertSpy },
          annualRankingEntry: { upsert: annualRankingEntryUpsertSpy },
          headToHeadRecord: { upsert: headToHeadRecordUpsertSpy },
          tournament: { update: tournamentUpdateSpy },
        });
      });

      // Socket client listening for tournament:finished
      const socket = createSocketClient(token, tournamentId);
      socket.connect();
      await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

      const eventPromise = new Promise<any>((resolve) => {
        socket.on('tournament:finished', (payload) => resolve(payload));
      });

      const res = await request(app)
        .post(`/api/history/tournaments/${tournamentId}/finish`)
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.tournament.status).toBe(TournamentStatus.COMPLETED);
      expect(res.body.podium.champion).toBe('player-1');
      expect(res.body.podium.runnerUp).toBe('player-2');
      expect(res.body.podium.third).toBe('player-3');
      expect(res.body.podium.fourth).toBe('player-4');

      // Verify points distribution for N=4
      expect(res.body.pointsDistribution.champion).toBe(10);
      expect(res.body.pointsDistribution.runnerUp).toBe(7);
      expect(res.body.pointsDistribution.third).toBe(5);
      expect(res.body.pointsDistribution.fourth).toBe(3);

      // Verify HistoricalStats upserts (4 participants)
      expect(historicalStatsUpsertSpy).toHaveBeenCalledTimes(4);

      // Verify AnnualRankingEntry upserts (4 participants)
      expect(annualRankingEntryUpsertSpy).toHaveBeenCalledTimes(4);

      // Verify HeadToHead upserts occurred
      expect(headToHeadRecordUpsertSpy).toHaveBeenCalled();

      // Verify Tournament was marked COMPLETED with winnerId
      expect(tournamentUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: tournamentId },
          data: expect.objectContaining({
            status: TournamentStatus.COMPLETED,
            winnerId: 'player-1',
          }),
        })
      );

      // Verify socket broadcast
      const eventPayload = await eventPromise;
      expect(eventPayload.tournamentId).toBe(tournamentId);
      expect(eventPayload.status).toBe('COMPLETED');
      expect(eventPayload.winnerId).toBe('player-1');
      expect(eventPayload.podium.champion).toBe('player-1');
    });

    it('rejects if tournament is not found', async () => {
      const token = createToken(adminUser);
      vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/history/tournaments/non-existent-tourney/finish')
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Torneo no encontrado');
    });
  });
});

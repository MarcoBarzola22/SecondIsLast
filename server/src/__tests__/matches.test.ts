import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createServer, type Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { Role, MatchStatus } from '@prisma/client';
import { createApp } from '../app.js';
import { config } from '../config/env.js';
import { initSocketServer, type AppSocketServer } from '../sockets/index.js';
import { whitelistService } from '../services/whitelistService.js';
import { prisma } from '../db.js';

describe('Match Submission by Home Player with Penalties & Sequential Lock (T18 · RF-105, RF-106, RF-107)', () => {
  let app: ReturnType<typeof createApp>;
  let httpServer: HttpServer;
  let io: AppSocketServer;
  let port: number;
  const clientSockets: ClientSocket[] = [];

  const homeUser = {
    id: 'user-home',
    email: 'local@secondislast.com',
    name: 'Jugador Local',
    role: Role.PLAYER,
    playerId: 'player-local-id',
  };

  const awayUser = {
    id: 'user-away',
    email: 'visitante@secondislast.com',
    name: 'Jugador Visitante',
    role: Role.PLAYER,
    playerId: 'player-away-id',
  };

  const adminUser = {
    id: 'user-admin',
    email: 'admin@secondislast.com',
    name: 'Admin Group',
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

  describe('POST /api/matches/:id/submit', () => {
    const tournamentId = 'tourney-test-18';
    const matchId = 'match-round-1-h-vs-a';

    const baseMatch = {
      id: matchId,
      tournamentId,
      round: 1,
      leg: 1,
      seriesId: null,
      homeParticipantId: 'part-home',
      awayParticipantId: 'part-away',
      status: MatchStatus.PENDING_SUBMISSION,
      isBye: false,
      homeScore: null,
      awayScore: null,
      homeYellowCards: 0,
      awayYellowCards: 0,
      homeRedCards: 0,
      awayRedCards: 0,
      penaltiesWinnerId: null,
      version: 1,
      submittedByParticipantId: null,
      submittedAt: null,
      closedAt: null,
      homeParticipant: {
        id: 'part-home',
        playerId: 'player-local-id',
        player: { id: 'player-local-id', firstName: 'Juan', lastName: 'Local' },
      },
      awayParticipant: {
        id: 'part-away',
        playerId: 'player-away-id',
        player: { id: 'player-away-id', firstName: 'Pedro', lastName: 'Visitante' },
      },
      penaltiesWinner: null,
    };

    it('returns 401 when authentication token is missing', async () => {
      const res = await request(app).post(`/api/matches/${matchId}/submit`).send({
        homeScore: 2,
        awayScore: 1,
        expectedVersion: 1,
      });

      expect(res.status).toBe(401);
    });

    it('returns 404 when match does not exist', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(null);
      const token = createToken(homeUser);

      const res = await request(app)
        .post(`/api/matches/non-existent/submit`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          homeScore: 2,
          awayScore: 1,
          expectedVersion: 1,
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Partido no encontrado');
    });

    it('returns 403 Forbidden when caller is not the Home participant (RF-106, RF-112)', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(baseMatch as any);

      // 1. Away player tries to submit
      const awayToken = createToken(awayUser);
      const resAway = await request(app)
        .post(`/api/matches/${matchId}/submit`)
        .set('Authorization', `Bearer ${awayToken}`)
        .send({
          homeScore: 1,
          awayScore: 2,
          expectedVersion: 1,
        });

      expect(resAway.status).toBe(403);
      expect(resAway.body.error).toContain('solo el participante Local');

      // 2. Admin tries to submit (RF-112 inviolability)
      const adminToken = createToken(adminUser);
      const resAdmin = await request(app)
        .post(`/api/matches/${matchId}/submit`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          homeScore: 3,
          awayScore: 0,
          expectedVersion: 1,
        });

      expect(resAdmin.status).toBe(403);
      expect(resAdmin.body.error).toContain('solo el participante Local');
    });

    it('returns 400 when required payload fields are missing or invalid', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(baseMatch as any);
      vi.spyOn(prisma.match, 'findMany').mockResolvedValue([baseMatch] as any);

      const homeToken = createToken(homeUser);

      // Missing expectedVersion
      const resMissingVersion = await request(app)
        .post(`/api/matches/${matchId}/submit`)
        .set('Authorization', `Bearer ${homeToken}`)
        .send({
          homeScore: 2,
          awayScore: 1,
        });
      expect(resMissingVersion.status).toBe(400);
      expect(resMissingVersion.body.error).toContain('Falta expectedVersion');

      // Missing homeScore
      const resMissingScore = await request(app)
        .post(`/api/matches/${matchId}/submit`)
        .set('Authorization', `Bearer ${homeToken}`)
        .send({
          awayScore: 1,
          expectedVersion: 1,
        });
      expect(resMissingScore.status).toBe(400);
      expect(resMissingScore.body.error).toContain('obligatorios');

      // Invalid score (> 99 or < 0)
      const resInvalidScore = await request(app)
        .post(`/api/matches/${matchId}/submit`)
        .set('Authorization', `Bearer ${homeToken}`)
        .send({
          homeScore: -1,
          awayScore: 1,
          expectedVersion: 1,
        });
      expect(resInvalidScore.status).toBe(400);
      expect(resInvalidScore.body.error).toContain('Goles inválidos');

      // Invalid penaltiesWinnerId (neither home nor away)
      const resInvalidPenalties = await request(app)
        .post(`/api/matches/${matchId}/submit`)
        .set('Authorization', `Bearer ${homeToken}`)
        .send({
          homeScore: 1,
          awayScore: 1,
          penaltiesWinnerId: 'random-alien-id',
          expectedVersion: 1,
        });
      expect(resInvalidPenalties.status).toBe(400);
      expect(resInvalidPenalties.body.error).toContain('Ganador de penales inválido');
    });

    it('returns 400 when match is sequentially blocked by previous unclosed matches (RF-114)', async () => {
      // Target match is in round 2
      const round2Match = {
        ...baseMatch,
        id: 'match-round-2',
        round: 2,
      };

      // Previous round 1 match for home participant is still PENDING_SUBMISSION
      const round1PendingMatch = {
        ...baseMatch,
        id: 'match-round-1-pending',
        round: 1,
        status: MatchStatus.PENDING_SUBMISSION,
      };

      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(round2Match as any);
      vi.spyOn(prisma.match, 'findMany').mockResolvedValue([
        round1PendingMatch,
        round2Match,
      ] as any);

      const homeToken = createToken(homeUser);
      const res = await request(app)
        .post(`/api/matches/${round2Match.id}/submit`)
        .set('Authorization', `Bearer ${homeToken}`)
        .send({
          homeScore: 2,
          awayScore: 0,
          expectedVersion: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('pendientes de cierre');
    });

    it('allows submission when earlier matches of OTHER participants are unclosed (RF-115 Desacoplamiento)', async () => {
      // Target match is round 2 between Home and Away
      const round2Match = {
        ...baseMatch,
        id: 'match-round-2-clean',
        round: 2,
      };

      // Both Home and Away already CLOSED their round 1 matches
      const round1HomeClosed = {
        ...baseMatch,
        id: 'match-round-1-home-closed',
        round: 1,
        homeParticipantId: 'part-home',
        awayParticipantId: 'part-third',
        status: MatchStatus.CLOSED,
      };

      const round1AwayClosed = {
        ...baseMatch,
        id: 'match-round-1-away-closed',
        round: 1,
        homeParticipantId: 'part-fourth',
        awayParticipantId: 'part-away',
        status: MatchStatus.CLOSED,
      };

      // Meanwhile, other participants X and Y are still playing round 1
      const round1OthersPending = {
        ...baseMatch,
        id: 'match-round-1-others-pending',
        round: 1,
        homeParticipantId: 'part-x',
        awayParticipantId: 'part-y',
        status: MatchStatus.PENDING_SUBMISSION,
      };

      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(round2Match as any);
      vi.spyOn(prisma.match, 'findMany').mockResolvedValue([
        round1HomeClosed,
        round1AwayClosed,
        round1OthersPending,
        round2Match,
      ] as any);

      vi.spyOn(prisma.match, 'updateMany').mockResolvedValue({ count: 1 });
      vi.spyOn(prisma.match, 'findUniqueOrThrow').mockResolvedValue({
        ...round2Match,
        status: MatchStatus.PENDING_CONFIRMATION,
        homeScore: 3,
        awayScore: 1,
        version: 2,
      } as any);

      const homeToken = createToken(homeUser);
      const res = await request(app)
        .post(`/api/matches/${round2Match.id}/submit`)
        .set('Authorization', `Bearer ${homeToken}`)
        .send({
          homeScore: 3,
          awayScore: 1,
          expectedVersion: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.match.status).toBe(MatchStatus.PENDING_CONFIRMATION);
      expect(res.body.match.version).toBe(2);
    });

    it('returns 409 Conflict when expectedVersion does not match current match version (RF-109 OCC)', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(baseMatch as any);
      vi.spyOn(prisma.match, 'findMany').mockResolvedValue([baseMatch] as any);

      const homeToken = createToken(homeUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/submit`)
        .set('Authorization', `Bearer ${homeToken}`)
        .send({
          homeScore: 1,
          awayScore: 0,
          expectedVersion: 99, // stale version
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Conflicto de concurrencia');
    });

    it('successfully submits match with penaltiesWinnerId and broadcasts match:submitted over WebSocket (RF-105, RF-106, RF-107)', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(baseMatch as any);
      vi.spyOn(prisma.match, 'findMany').mockResolvedValue([baseMatch] as any);

      const updatedMatchInDb = {
        ...baseMatch,
        status: MatchStatus.PENDING_CONFIRMATION,
        homeScore: 2,
        awayScore: 2,
        homeYellowCards: 1,
        awayYellowCards: 2,
        homeRedCards: 0,
        awayRedCards: 1,
        penaltiesWinnerId: 'part-home',
        penaltiesWinner: baseMatch.homeParticipant,
        version: 2,
        submittedByParticipantId: 'part-home',
        submittedAt: new Date(),
      };

      vi.spyOn(prisma.match, 'updateMany').mockResolvedValue({ count: 1 });
      vi.spyOn(prisma.match, 'findUniqueOrThrow').mockResolvedValue(updatedMatchInDb as any);

      // Connect client socket to receive real-time match:submitted
      const awayToken = createToken(awayUser);
      const socket = createSocketClient(awayToken, tournamentId);
      socket.connect();

      await new Promise<void>((resolve) => {
        socket.on('connect', () => {
          socket.emit('tournament:join', tournamentId, () => resolve());
        });
      });

      const socketEventPromise = new Promise<any>((resolve) => {
        socket.on('match:submitted', (payload) => {
          resolve(payload);
        });
      });

      const homeToken = createToken(homeUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/submit`)
        .set('Authorization', `Bearer ${homeToken}`)
        .send({
          homeScore: 2,
          awayScore: 2,
          homeYellowCards: 1,
          awayYellowCards: 2,
          homeRedCards: 0,
          awayRedCards: 1,
          penaltiesWinnerId: 'part-home',
          expectedVersion: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.match.status).toBe(MatchStatus.PENDING_CONFIRMATION);
      expect(res.body.match.homeScore).toBe(2);
      expect(res.body.match.awayScore).toBe(2);
      expect(res.body.match.penaltiesWinnerId).toBe('part-home');
      expect(res.body.match.version).toBe(2);

      // Validate WebSocket event received by connected peer
      const emittedPayload = await socketEventPromise;
      expect(emittedPayload).toEqual({
        matchId,
        version: 2,
        homeScore: 2,
        awayScore: 2,
        penaltiesWinnerId: 'part-home',
      });
    });
  });

  describe('POST /api/matches/:id/reject (T19 · RF-108, RF-109, RF-111, RF-112)', () => {
    const tournamentId = 'tourney-test-19-reject';
    const matchId = 'match-pending-confirmation';

    const matchPendingConfirmation = {
      id: matchId,
      tournamentId,
      round: 1,
      leg: 1,
      seriesId: null,
      homeParticipantId: 'part-home',
      awayParticipantId: 'part-away',
      status: MatchStatus.PENDING_CONFIRMATION,
      isBye: false,
      homeScore: 2,
      awayScore: 1,
      homeYellowCards: 1,
      awayYellowCards: 0,
      homeRedCards: 0,
      awayRedCards: 0,
      penaltiesWinnerId: null,
      version: 2,
      submittedByParticipantId: 'part-home',
      submittedAt: new Date(),
      closedAt: null,
      homeParticipant: {
        id: 'part-home',
        playerId: 'player-local-id',
        player: { id: 'player-local-id', firstName: 'Juan', lastName: 'Local' },
      },
      awayParticipant: {
        id: 'part-away',
        playerId: 'player-away-id',
        player: { id: 'player-away-id', firstName: 'Pedro', lastName: 'Visitante' },
      },
      penaltiesWinner: null,
    };

    it('returns 401 when authentication token is missing', async () => {
      const res = await request(app).post(`/api/matches/${matchId}/reject`).send({
        expectedVersion: 2,
      });
      expect(res.status).toBe(401);
    });

    it('returns 403 Forbidden when Home player or Admin tries to reject (RF-108, RF-112)', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchPendingConfirmation as any);

      // Home player tries to reject
      const homeToken = createToken(homeUser);
      const resHome = await request(app)
        .post(`/api/matches/${matchId}/reject`)
        .set('Authorization', `Bearer ${homeToken}`)
        .send({ expectedVersion: 2 });

      expect(resHome.status).toBe(403);
      expect(resHome.body.error).toContain('solo el participante Visitante');

      // Admin tries to reject (RF-112)
      const adminToken = createToken(adminUser);
      const resAdmin = await request(app)
        .post(`/api/matches/${matchId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ expectedVersion: 2 });

      expect(resAdmin.status).toBe(403);
      expect(resAdmin.body.error).toContain('solo el participante Visitante');
    });

    it('returns 400 Bad Request when match is not waiting for confirmation (RF-111)', async () => {
      const matchAlreadyClosed = {
        ...matchPendingConfirmation,
        status: MatchStatus.CLOSED,
      };
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchAlreadyClosed as any);

      const awayToken = createToken(awayUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/reject`)
        .set('Authorization', `Bearer ${awayToken}`)
        .send({ expectedVersion: 2 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('esperando confirmación');
    });

    it('returns 400 Bad Request when expectedVersion is missing', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchPendingConfirmation as any);

      const awayToken = createToken(awayUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/reject`)
        .set('Authorization', `Bearer ${awayToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Falta expectedVersion');
    });

    it('returns 409 Conflict when expectedVersion is desynchronized (RF-109 OCC)', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchPendingConfirmation as any);

      const awayToken = createToken(awayUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/reject`)
        .set('Authorization', `Bearer ${awayToken}`)
        .send({ expectedVersion: 1 }); // Stale version (current is 2)

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Conflicto de concurrencia');
    });

    it('successfully rejects match proposal, reverts to PENDING_SUBMISSION and emits match:rejected (RF-111)', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchPendingConfirmation as any);

      const updatedReverted = {
        ...matchPendingConfirmation,
        status: MatchStatus.PENDING_SUBMISSION,
        version: 3,
      };

      vi.spyOn(prisma.match, 'updateMany').mockResolvedValue({ count: 1 });
      vi.spyOn(prisma.match, 'findUniqueOrThrow').mockResolvedValue(updatedReverted as any);

      // Connect client socket to listen for match:rejected
      const homeToken = createToken(homeUser);
      const socket = createSocketClient(homeToken, tournamentId);
      socket.connect();

      await new Promise<void>((resolve) => {
        socket.on('connect', () => {
          socket.emit('tournament:join', tournamentId, () => resolve());
        });
      });

      const socketPromise = new Promise<any>((resolve) => {
        socket.on('match:rejected', (data) => resolve(data));
      });

      const awayToken = createToken(awayUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/reject`)
        .set('Authorization', `Bearer ${awayToken}`)
        .send({ expectedVersion: 2 });

      expect(res.status).toBe(200);
      expect(res.body.match.status).toBe(MatchStatus.PENDING_SUBMISSION);
      expect(res.body.match.version).toBe(3);

      const emitted = await socketPromise;
      expect(emitted).toEqual({
        matchId,
        version: 3,
      });
    });
  });

  describe('POST /api/matches/:id/confirm (T19 · RF-108, RF-109, RF-110, RF-112, RNF-2)', () => {
    const tournamentId = 'tourney-test-19-confirm';
    const matchId = 'match-qf1-confirm';

    const matchPendingConfirmation = {
      id: matchId,
      tournamentId,
      round: 1,
      leg: 1,
      seriesId: 'QF1',
      homeParticipantId: 'part-home',
      awayParticipantId: 'part-away',
      status: MatchStatus.PENDING_CONFIRMATION,
      isBye: false,
      homeScore: 2,
      awayScore: 0,
      homeYellowCards: 1,
      awayYellowCards: 1,
      homeRedCards: 0,
      awayRedCards: 0,
      penaltiesWinnerId: null,
      version: 2,
      submittedByParticipantId: 'part-home',
      submittedAt: new Date(),
      closedAt: null,
      homeParticipant: {
        id: 'part-home',
        playerId: 'player-local-id',
        player: { id: 'player-local-id', firstName: 'Juan', lastName: 'Local' },
      },
      awayParticipant: {
        id: 'part-away',
        playerId: 'player-away-id',
        player: { id: 'player-away-id', firstName: 'Pedro', lastName: 'Visitante' },
      },
      penaltiesWinner: null,
    };

    const targetSf1Match = {
      id: 'match-sf1-target',
      tournamentId,
      round: 2,
      leg: 1,
      seriesId: 'SF1',
      homeParticipantId: 'TBD',
      awayParticipantId: 'part-semis-rival',
      status: MatchStatus.PENDING_SUBMISSION,
      isBye: false,
      homeScore: null,
      awayScore: null,
      homeYellowCards: 0,
      awayYellowCards: 0,
      homeRedCards: 0,
      awayRedCards: 0,
      penaltiesWinnerId: null,
      version: 1,
      homeParticipant: { id: 'TBD', playerId: 'tbd', player: { firstName: 'A', lastName: 'B' } },
      awayParticipant: { id: 'part-semis-rival', playerId: 'p-rival', player: { firstName: 'Rival', lastName: 'Semis' } },
    };

    const mockTournament = {
      id: tournamentId,
      participants: [
        matchPendingConfirmation.homeParticipant,
        matchPendingConfirmation.awayParticipant,
        targetSf1Match.awayParticipant,
        { id: 'part-fourth', playerId: 'p-4', player: { id: 'p-4', firstName: 'Cuarto', lastName: 'Player' } },
        { id: 'part-fifth', playerId: 'p-5', player: { id: 'p-5', firstName: 'Quinto', lastName: 'Player' } },
      ],
    };

    it('returns 401 when authentication token is missing', async () => {
      const res = await request(app).post(`/api/matches/${matchId}/confirm`).send({
        expectedVersion: 2,
      });
      expect(res.status).toBe(401);
    });

    it('returns 403 Forbidden when Home player or Admin tries to confirm (RF-108, RF-112)', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchPendingConfirmation as any);

      // Home player tries to confirm
      const homeToken = createToken(homeUser);
      const resHome = await request(app)
        .post(`/api/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${homeToken}`)
        .send({ expectedVersion: 2 });

      expect(resHome.status).toBe(403);
      expect(resHome.body.error).toContain('solo el participante Visitante');

      // Admin tries to confirm (RF-112)
      const adminToken = createToken(adminUser);
      const resAdmin = await request(app)
        .post(`/api/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ expectedVersion: 2 });

      expect(resAdmin.status).toBe(403);
      expect(resAdmin.body.error).toContain('solo el participante Visitante');
    });

    it('returns 400 Bad Request when match is not awaiting confirmation', async () => {
      const matchOpen = {
        ...matchPendingConfirmation,
        status: MatchStatus.PENDING_SUBMISSION,
      };
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchOpen as any);

      const awayToken = createToken(awayUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${awayToken}`)
        .send({ expectedVersion: 2 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('esperando confirmación');
    });

    it('returns 400 Bad Request when expectedVersion is missing', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchPendingConfirmation as any);

      const awayToken = createToken(awayUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${awayToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Falta expectedVersion');
    });

    it('returns 409 Conflict when expectedVersion is stale (RF-109 OCC)', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchPendingConfirmation as any);

      const awayToken = createToken(awayUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${awayToken}`)
        .send({ expectedVersion: 1 }); // Stale version

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Conflicto de concurrencia');
    });

    it('returns 409 Conflict when concurrent database write occurs (CAS update count === 0)', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchPendingConfirmation as any);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const txMock = {
          match: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }), // CAS conflict
          },
        };
        return callback(txMock);
      });

      const awayToken = createToken(awayUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${awayToken}`)
        .send({ expectedVersion: 2 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Conflicto de concurrencia');
    });

    it('successfully confirms match, advances winner to next series slot, recalculates standings and broadcasts match:closed (RF-108, RF-110, RF-112, RNF-2)', async () => {
      vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(matchPendingConfirmation as any);

      const closedMatch = {
        ...matchPendingConfirmation,
        status: MatchStatus.CLOSED,
        version: 3,
        closedAt: new Date(),
      };

      const advancedSf1Match = {
        ...targetSf1Match,
        homeParticipantId: 'part-home', // Winner of QF1 advanced to SF1.home
        homeParticipant: matchPendingConfirmation.homeParticipant,
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const txMock = {
          match: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findMany: vi
              .fn()
              .mockResolvedValueOnce([matchPendingConfirmation]) // initial check for series
              .mockResolvedValueOnce([targetSf1Match]) // target matches in advanceParticipantToSeries
              .mockResolvedValueOnce([closedMatch, advancedSf1Match]), // full reload after advance
            update: vi.fn().mockResolvedValue(advancedSf1Match),
          },
          tournament: {
            findUniqueOrThrow: vi.fn().mockResolvedValue(mockTournament),
          },
        };
        return callback(txMock);
      });

      // Connect client socket to listen for match:closed
      const homeToken = createToken(homeUser);
      const socket = createSocketClient(homeToken, tournamentId);
      socket.connect();

      await new Promise<void>((resolve) => {
        socket.on('connect', () => {
          socket.emit('tournament:join', tournamentId, () => resolve());
        });
      });

      const socketPromise = new Promise<any>((resolve) => {
        socket.on('match:closed', (data) => resolve(data));
      });

      const awayToken = createToken(awayUser);
      const res = await request(app)
        .post(`/api/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${awayToken}`)
        .send({ expectedVersion: 2 });

      expect(res.status).toBe(200);
      expect(res.body.match.status).toBe(MatchStatus.CLOSED);
      expect(res.body.match.version).toBe(3);
      expect(res.body.standings).toBeDefined();
      expect(res.body.standings.length).toBeGreaterThan(0);
      expect(res.body.bracket).toBeDefined();

      const emitted = await socketPromise;
      expect(emitted.matchId).toBe(matchId);
      expect(emitted.version).toBe(3);
      expect(emitted.standings).toBeDefined();
      expect(emitted.bracket).toBeDefined();
      expect(emitted.unblockedParticipants).toBeDefined();
    });
  });
});

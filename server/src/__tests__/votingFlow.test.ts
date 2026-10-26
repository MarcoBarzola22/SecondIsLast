import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createServer, type Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { Role, TournamentStatus, TournamentFormat } from '@prisma/client';
import { createApp } from '../app.js';
import { config } from '../config/env.js';
import { initSocketServer, type AppSocketServer } from '../sockets/index.js';
import { whitelistService } from '../services/whitelistService.js';
import { prisma } from '../db.js';
import {
  type VoteEndedPayload,
} from '../sockets/votingHandler.js';

describe('Multiplayer Voting & Navigation Integration Flow (T28 · RF-94, RF-97, RF-99, RF-100, RF-101, RF-102)', () => {
  let app: ReturnType<typeof createApp>;
  let httpServer: HttpServer;
  let io: AppSocketServer;
  let port: number;
  const clientSockets: ClientSocket[] = [];

  const player1 = {
    id: 'user-player-1',
    email: 'player1@test.com',
    name: 'Lionel Messi',
    role: Role.PLAYER,
    playerId: 'p-messi',
  };

  const player2 = {
    id: 'user-player-2',
    email: 'player2@test.com',
    name: 'Angel Di Maria',
    role: Role.PLAYER,
    playerId: 'p-dimaria',
  };

  const player3 = {
    id: 'user-player-3',
    email: 'player3@test.com',
    name: 'Julian Alvarez',
    role: Role.PLAYER,
    playerId: 'p-julian',
  };

  const player4 = {
    id: 'user-player-4',
    email: 'player4@test.com',
    name: 'Emiliano Martinez',
    role: Role.PLAYER,
    playerId: 'p-dibu',
  };

  const adminUser = {
    id: 'user-admin',
    email: 'admin@test.com',
    name: 'Admin Boss',
    role: Role.ADMIN,
    playerId: 'p-admin',
  };

  const allPlayers = [player1, player2, player3, player4];

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

  it('Flow: Lobby -> Votar con los 4 usuarios -> Transición automática a la siguiente vista (VOTING_THEME / equipos)', async () => {
    const tourneyId = 'tourney-test-4players';
    const participants = allPlayers.map((p, idx) => ({
      id: `part-${idx + 1}`,
      tournamentId: tourneyId,
      playerId: p.playerId,
      isPresent: true,
      player: {
        id: p.playerId,
        firstName: p.name.split(' ')[0],
        lastName: p.name.split(' ')[1] || '',
        user: { id: p.id, email: p.email },
      },
    }));

    // In-memory mock tournament store
    let currentTournamentStatus = TournamentStatus.VOTING_FORMAT;
    const tournamentVotes: Array<{ participantId: string; choice: string }> = [];

    (vi.spyOn(prisma.tournament, 'findFirst') as any).mockImplementation(async () => ({
      id: tourneyId,
      name: 'Torneo 4 Pibes',
      status: currentTournamentStatus,
      participantCount: 4,
      currentRound: 1,
      participants,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    (vi.spyOn(prisma.tournament, 'findUnique') as any).mockImplementation(async () => ({
      id: tourneyId,
      name: 'Torneo 4 Pibes',
      status: currentTournamentStatus,
      participantCount: 4,
      currentRound: 1,
      participants,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const updateTournamentSpy = (vi.spyOn(prisma.tournament, 'update') as any).mockImplementation(async (args: any) => {
      if (args.data.status) {
        currentTournamentStatus = args.data.status;
      }
      return {
        id: tourneyId,
        status: currentTournamentStatus,
        format: args.data.format || TournamentFormat.LEAGUE,
        matchFormat: args.data.matchFormat || 'SINGLE_MATCH',
        participants,
      };
    });

    (vi.spyOn(prisma.tournamentVote, 'upsert') as any).mockImplementation(async (args: any) => {
      tournamentVotes.push({
        participantId: args.create.participantId,
        choice: args.create.choice,
      });
      return args.create;
    });

    (vi.spyOn(prisma.tournamentVote, 'count') as any).mockImplementation(async () => tournamentVotes.length);
    (vi.spyOn(prisma.tournamentVote, 'findMany') as any).mockImplementation(async () => tournamentVotes);

    // 1. Connect 4 client sockets to tournament room
    const connectedSockets: ClientSocket[] = [];
    const voteEndedPromises: Promise<VoteEndedPayload>[] = [];
    const statusPromises: Promise<any>[] = [];

    for (const player of allPlayers) {
      const socket = createSocketClient(createToken(player), tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });
      connectedSockets.push(socket);

      voteEndedPromises.push(
        new Promise<VoteEndedPayload>((resolve) => {
          socket.on('vote:ended', (payload) => resolve(payload));
        })
      );

      statusPromises.push(
        new Promise<any>((resolve) => {
          socket.on('tournament:status', (payload) => {
            if (payload.status === 'VOTING_THEME') {
              resolve(payload);
            }
          });
        })
      );
    }

    // 2. Cast vote for Player 1: "league" + "SINGLE_MATCH"
    const res1 = await request(app)
      .post('/api/tournaments/vote')
      .set('Authorization', `Bearer ${createToken(player1)}`)
      .send({
        tournamentId: tourneyId,
        phase: 'FORMAT',
        choice: 'league',
        matchFormat: 'SINGLE_MATCH',
      });

    expect(res1.status).toBe(200);
    expect(res1.body.closedEarly).toBe(false);
    expect(res1.body.votesCast).toBe(1);

    // 3. Cast vote for Player 2: "LEAGUE" (testing case-insensitivity) + "TWO_LEGGED"
    const res2 = await request(app)
      .post('/api/tournaments/vote')
      .set('Authorization', `Bearer ${createToken(player2)}`)
      .send({
        tournamentId: tourneyId,
        phase: 'FORMAT',
        choice: 'LEAGUE',
        matchFormat: 'TWO_LEGGED',
      });

    expect(res2.status).toBe(200);
    expect(res2.body.closedEarly).toBe(false);
    expect(res2.body.votesCast).toBe(2);

    // 4. Cast vote for Player 3: "Random" (testing random option acceptance)
    const res3 = await request(app)
      .post('/api/tournaments/vote')
      .set('Authorization', `Bearer ${createToken(player3)}`)
      .send({
        tournamentId: tourneyId,
        phase: 'FORMAT',
        choice: 'Random',
        matchFormat: 'SINGLE_MATCH',
      });

    expect(res3.status).toBe(200);
    expect(res3.body.closedEarly).toBe(false);
    expect(res3.body.votesCast).toBe(3);

    // 5. Cast vote for Player 4 (100% quorum confirmed) -> triggers early closure & transition
    const res4 = await request(app)
      .post('/api/tournaments/vote')
      .set('Authorization', `Bearer ${createToken(player4)}`)
      .send({
        tournamentId: tourneyId,
        phase: 'FORMAT',
        choice: 'bracket',
        matchFormat: 'SINGLE_MATCH',
      });

    expect(res4.status).toBe(200);
    expect(res4.body.closedEarly).toBe(true);
    expect(res4.body.votesCast).toBe(4);
    expect(res4.body.result).toBeDefined();

    // Verify DB update persisted format and matchFormat
    expect(updateTournamentSpy).toHaveBeenCalledWith({
      where: { id: tourneyId },
      data: expect.objectContaining({
        format: 'LEAGUE',
        matchFormat: 'SINGLE_MATCH',
      }),
    });

    // 6. Verify all 4 connected client sockets received vote:ended (with format winner and modality)
    const allEndedPayloads = await Promise.all(voteEndedPromises);
    expect(allEndedPayloads).toHaveLength(4);
    for (const ended of allEndedPayloads) {
      expect(ended.phase).toBe('FORMAT');
      expect(ended.winner).toBeDefined();
    }

    // 7. Outsider attempting to advance phase is rejected with 403 Forbidden
    const outsider = {
      id: 'user-outsider',
      email: 'outsider@secondislast.com',
      name: 'Outsider',
      role: Role.PLAYER,
      playerId: 'player-outsider',
    };
    const outsiderAdvance = await request(app)
      .post('/api/tournaments/advance-phase')
      .set('Authorization', `Bearer ${createToken(outsider)}`)
      .send({ tournamentId: tourneyId });
    expect(outsiderAdvance.status).toBe(403);

    // 8. Confirmed participant (or Admin) advances phase to VOTING_THEME via POST /api/tournaments/advance-phase (T32)
    const participantAdvance = await request(app)
      .post('/api/tournaments/advance-phase')
      .set('Authorization', `Bearer ${createToken(player2)}`)
      .send({ tournamentId: tourneyId, targetStatus: 'VOTING_THEME' });
    expect(participantAdvance.status).toBe(200);
    expect(participantAdvance.body.status).toBe('VOTING_THEME');

    // 9. Verify all 4 connected sockets receive tournament:status (VOTING_THEME)
    const allStatusPayloads = await Promise.all(statusPromises);
    expect(allStatusPayloads).toHaveLength(4);
    for (const stat of allStatusPayloads) {
      expect(stat.status).toBe('VOTING_THEME');
      expect(stat.tournamentId).toBe(tourneyId);
    }
  });

  it('Auto-transitions tournament from LOBBY to VOTING_FORMAT if vote arrives and tournament has >= 4 participants', async () => {
    const tourneyId = 'tourney-auto-transition';
    const participants = allPlayers.map((p, idx) => ({
      id: `part-${idx + 1}`,
      tournamentId: tourneyId,
      playerId: p.playerId,
      isPresent: true,
      player: {
        id: p.playerId,
        firstName: p.name.split(' ')[0],
        lastName: p.name.split(' ')[1] || '',
        user: { id: p.id, email: p.email },
      },
    }));

    const mockLobbyTourney = {
      id: tourneyId,
      name: 'Torneo Lobby',
      status: TournamentStatus.LOBBY,
      participantCount: 4,
      participants,
      settings: {},
    };

    vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(mockLobbyTourney as any);
    vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(mockLobbyTourney as any);

    const updateSpy = vi.spyOn(prisma.tournament, 'update').mockResolvedValue({
      id: tourneyId,
      status: TournamentStatus.VOTING_FORMAT,
      participants,
    } as any);

    vi.spyOn(prisma.tournamentVote, 'upsert').mockResolvedValue({} as any);
    vi.spyOn(prisma.tournamentVote, 'count').mockResolvedValue(1);

    const res = await request(app)
      .post('/api/tournaments/vote')
      .set('Authorization', `Bearer ${createToken(player1)}`)
      .send({
        tournamentId: tourneyId,
        phase: 'FORMAT',
        choice: 'bracket',
      });

    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: tourneyId },
      data: { status: TournamentStatus.VOTING_FORMAT },
      include: expect.anything(),
    });
  });

  it('Silent unauthenticated initial queries: GET /api/auth/me and GET /api/tournaments/active return 200 without noisy 401', async () => {
    const meRes = await request(app).get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toBeNull();

    const activeRes = await request(app).get('/api/tournaments/active');
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.tournament).toBeDefined();
  });

  it('POST /api/tournaments/abandon resets tournament and broadcasts tournament:abandoned to all clients in any phase', async () => {
    const tourneyId = 'tourney-to-abandon';
    const participants = [
      {
        id: 'part-1',
        playerId: player1.playerId,
        isPresent: true,
      },
    ];

    vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue({
      id: tourneyId,
      status: TournamentStatus.VOTING_FORMAT,
      participants,
    } as any);

    vi.spyOn(prisma.tournament, 'update').mockResolvedValue({
      id: tourneyId,
      status: TournamentStatus.ABANDONED,
      participants,
    } as any);

    const socket = createSocketClient(createToken(player1), tourneyId);
    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
      socket.connect();
    });

    const abandonedPromise = new Promise<any>((resolve) => {
      socket.on('tournament:abandoned', (payload) => resolve(payload));
    });

    // Non-admin player cannot abandon/reset tournament (Security Anti-Troll T32)
    const forbiddenRes = await request(app)
      .post('/api/tournaments/abandon')
      .set('Authorization', `Bearer ${createToken(player1)}`)
      .send({ tournamentId: tourneyId });

    expect(forbiddenRes.status).toBe(403);

    // Admin user can abandon/reset tournament
    const res = await request(app)
      .post('/api/tournaments/abandon')
      .set('Authorization', `Bearer ${createToken(adminUser)}`)
      .send({ tournamentId: tourneyId });

    expect(res.status).toBe(200);
    expect(res.body.tournament.status).toBe(TournamentStatus.ABANDONED);

    const abandonedPayload = await abandonedPromise;
    expect(abandonedPayload.tournamentId).toBe(tourneyId);
  });
});

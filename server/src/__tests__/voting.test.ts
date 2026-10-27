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
import { tournamentService } from '../services/tournamentService.js';
import { prisma } from '../db.js';
import {
  startVotingSession,
  closeVotingSession,
  getActiveVotingSession,
  type VoteStartedPayload,
  type VoteUpdatedPayload,
  type VoteEndedPayload,
} from '../sockets/votingHandler.js';
import { computeVoteResults } from '../domain/voting.js';

describe('Live Voting API, Timer, Early Closure and Sockets (T15 · RF-99, RF-100, RF-101, RF-102)', () => {
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

  const outsiderUser = {
    id: 'user-outsider',
    email: 'outsider@secondislast.com',
    name: 'Random Guy',
    role: Role.PLAYER,
    playerId: 'player-random',
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

  describe('POST /api/tournaments/start-voting (RF-96, RF-98, RF-99)', () => {
    it('returns 401 when token is missing', async () => {
      const res = await request(app).post('/api/tournaments/start-voting');
      expect(res.status).toBe(401);
    });

    it('returns 403 when user is not whitelisted', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(false);
      const token = createToken(player1);

      const res = await request(app)
        .post('/api/tournaments/start-voting')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('returns 400 when there is no active tournament in LOBBY', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(null);
      const token = createToken(player1);

      const res = await request(app)
        .post('/api/tournaments/start-voting')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No hay ningún lobby disponible');
    });

    it('returns 400 when quorum is less than 4 participants (RF-96)', async () => {
      const mockLobby = {
        id: 'tourney-1',
        name: 'Torneo 1',
        status: TournamentStatus.LOBBY,
        participants: [
          { id: 'part-1', playerId: 'player-messi', isPresent: true },
          { id: 'part-2', playerId: 'player-dimaria', isPresent: true },
          { id: 'part-3', playerId: 'player-julian', isPresent: true },
        ],
      };

      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(mockLobby as any);
      const token = createToken(player1);

      const res = await request(app)
        .post('/api/tournaments/start-voting')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No se cumple el quórum mínimo de 4 participantes');
    });

    it('returns 403 when user is neither a confirmed participant nor ADMIN (RF-98)', async () => {
      const mockLobby = {
        id: 'tourney-1',
        name: 'Torneo 1',
        status: TournamentStatus.LOBBY,
        participants: [
          { id: 'part-1', playerId: 'player-messi', isPresent: true },
          { id: 'part-2', playerId: 'player-dimaria', isPresent: true },
          { id: 'part-3', playerId: 'player-julian', isPresent: true },
          { id: 'part-4', playerId: 'player-dibu', isPresent: true },
        ],
      };

      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(mockLobby as any);
      const token = createToken(outsiderUser);

      const res = await request(app)
        .post('/api/tournaments/start-voting')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Solo un participante confirmado o un administrador');
    });

    it('starts voting for N=4, excludes group_stage (RF-99), emits vote:started and returns 120s countdown', async () => {
      const tourneyId = 'tourney-voting-4';
      const mockLobby = {
        id: tourneyId,
        name: 'Torneo Apertura 2026',
        status: TournamentStatus.LOBBY,
        participants: [
          { id: 'part-1', playerId: 'player-messi', isPresent: true },
          { id: 'part-2', playerId: 'player-dimaria', isPresent: true },
          { id: 'part-3', playerId: 'player-julian', isPresent: true },
          { id: 'part-4', playerId: 'player-dibu', isPresent: true },
        ],
      };

      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(mockLobby as any);
      vi.spyOn(prisma.tournament, 'update').mockResolvedValue({
        ...mockLobby,
        status: TournamentStatus.VOTING_FORMAT,
      } as any);

      // Connect socket to tournament room
      const clientToken = createToken(player1);
      const socket = createSocketClient(clientToken, tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const startedPromise = new Promise<VoteStartedPayload>((resolve) => {
        socket.on('vote:started', (data: VoteStartedPayload) => {
          resolve(data);
        });
      });

      const res = await request(app)
        .post('/api/tournaments/start-voting')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(200);
      expect(res.body.phase).toBe('FORMAT');
      expect(res.body.totalVoters).toBe(4);
      expect(res.body.options).toContain('bracket');
      expect(res.body.options).toContain('league');
      expect(res.body.options).toContain('double_elimination');
      // RF-99: group_stage excluded when N != 6 and N != 9
      expect(res.body.options).not.toContain('group_stage');
      expect(res.body.expiresAt).toBeDefined();

      const socketPayload = await startedPromise;
      expect(socketPayload.phase).toBe('FORMAT');
      expect(socketPayload.options).toEqual(res.body.options);
      expect(socketPayload.totalVoters).toBe(4);
    });

    it('starts voting for N=6 and includes group_stage (RF-99)', async () => {
      const tourneyId = 'tourney-voting-6';
      const mockLobby = {
        id: tourneyId,
        name: 'Torneo Grupos 6',
        status: TournamentStatus.LOBBY,
        participants: [
          { id: 'part-1', playerId: 'player-1', isPresent: true },
          { id: 'part-2', playerId: 'player-2', isPresent: true },
          { id: 'part-3', playerId: 'player-3', isPresent: true },
          { id: 'part-4', playerId: 'player-4', isPresent: true },
          { id: 'part-5', playerId: 'player-5', isPresent: true },
          { id: 'part-6', playerId: 'player-6', isPresent: true },
        ],
      };

      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue(mockLobby as any);
      vi.spyOn(prisma.tournament, 'update').mockResolvedValue({
        ...mockLobby,
        status: TournamentStatus.VOTING_FORMAT,
      } as any);

      const token = createToken(adminUser);
      const res = await request(app)
        .post('/api/tournaments/start-voting')
        .set('Authorization', `Bearer ${token}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(200);
      expect(res.body.totalVoters).toBe(6);
      expect(res.body.options).toContain('group_stage');
      expect(res.body.options).toContain('bracket');
      expect(res.body.options).toContain('league');
    });
  });

  describe('POST /api/tournaments/vote and Early Closure (RF-99, RF-100, RF-101, RF-102)', () => {
    const tourneyId = 'tourney-voting-run';
    const participants = [
      { id: 'part-messi', playerId: 'player-messi', isPresent: true },
      { id: 'part-dimaria', playerId: 'player-dimaria', isPresent: true },
      { id: 'part-julian', playerId: 'player-julian', isPresent: true },
      { id: 'part-dibu', playerId: 'player-dibu', isPresent: true },
    ];

    beforeEach(() => {
      // Initialize voting session in memory
      startVotingSession(
        io,
        tourneyId,
        'FORMAT',
        ['bracket', 'league', 'league_playoffs', 'double_elimination', 'random'],
        4,
        60
      );
    });

    it('returns 400 when choice or phase is missing', async () => {
      const token = createToken(player1);
      const res = await request(app)
        .post('/api/tournaments/vote')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Fase y opción elegida son obligatorias');
    });

    it('returns 400 when chosen option is not in valid filtered options (RF-99)', async () => {
      const token = createToken(player1);
      const res = await request(app)
        .post('/api/tournaments/vote')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tournamentId: tourneyId,
          phase: 'FORMAT',
          choice: 'group_stage', // Excluded for N=4
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('no es válida para esta votación');
    });

    it('returns 403 when user is not a confirmed participant in this tournament', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue({
        id: tourneyId,
        status: TournamentStatus.VOTING_FORMAT,
        participants,
      } as any);

      const token = createToken(outsiderUser);
      const res = await request(app)
        .post('/api/tournaments/vote')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tournamentId: tourneyId,
          phase: 'FORMAT',
          choice: 'bracket',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Solo los participantes confirmados pueden emitir votos');
    });

    it('auto-reconstructs voting session if missing in memory and accepts random option (T29)', async () => {
      const lostTourneyId = 'tourney-lost-session';
      vi.spyOn(prisma.tournament, 'findUnique').mockResolvedValue({
        id: lostTourneyId,
        status: TournamentStatus.VOTING_FORMAT,
        participants,
      } as any);
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue({
        id: lostTourneyId,
        status: TournamentStatus.VOTING_FORMAT,
        participants,
      } as any);
      vi.spyOn(prisma.tournamentVote, 'upsert').mockResolvedValue({} as any);
      vi.spyOn(prisma.tournamentVote, 'count').mockResolvedValue(1);

      const res = await request(app)
        .post('/api/tournaments/vote')
        .set('Authorization', `Bearer ${createToken(player1)}`)
        .send({
          tournamentId: lostTourneyId,
          phase: 'FORMAT',
          choice: 'random',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(getActiveVotingSession(lostTourneyId)).not.toBeNull();
    });

    it('records a vote, emits vote:updated and keeps voting open if < 100% (RF-100)', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue({
        id: tourneyId,
        status: TournamentStatus.VOTING_FORMAT,
        participants,
      } as any);
      vi.spyOn(prisma.tournamentVote, 'upsert').mockResolvedValue({} as any);
      vi.spyOn(prisma.tournamentVote, 'count').mockResolvedValue(1);

      const socket = createSocketClient(createToken(player1), tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const updatedPromise = new Promise<VoteUpdatedPayload>((resolve) => {
        socket.on('vote:updated', (data: VoteUpdatedPayload) => resolve(data));
      });

      const res = await request(app)
        .post('/api/tournaments/vote')
        .set('Authorization', `Bearer ${createToken(player1)}`)
        .send({
          tournamentId: tourneyId,
          phase: 'FORMAT',
          choice: 'bracket',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.votesCast).toBe(1);
      expect(res.body.totalVoters).toBe(4);
      expect(res.body.closedEarly).toBe(false);

      const socketData = await updatedPromise;
      expect(socketData.votesCast).toBe(1);
      expect(socketData.totalVoters).toBe(4);
    });

    it('triggers early closure when 100% of participants vote, updates tournament and emits vote:ended (RF-100 condition 2, RF-101)', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue({
        id: tourneyId,
        status: TournamentStatus.VOTING_FORMAT,
        participants,
      } as any);
      vi.spyOn(prisma.tournamentVote, 'upsert').mockResolvedValue({} as any);
      // Simulate 4th vote cast (100% participation)
      vi.spyOn(prisma.tournamentVote, 'count').mockResolvedValue(4);

      // Return 4 votes in DB: 3 for league, 1 for bracket
      vi.spyOn(prisma.tournamentVote, 'findMany').mockResolvedValue([
        { participantId: 'part-messi', choice: 'league' },
        { participantId: 'part-dimaria', choice: 'league' },
        { participantId: 'part-julian', choice: 'league' },
        { participantId: 'part-dibu', choice: 'bracket' },
      ] as any);

      const updateSpy = vi.spyOn(prisma.tournament, 'update').mockResolvedValue({} as any);

      const socket = createSocketClient(createToken(player4), tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const endedPromise = new Promise<VoteEndedPayload>((resolve) => {
        socket.on('vote:ended', (data: VoteEndedPayload) => resolve(data));
      });

      const res = await request(app)
        .post('/api/tournaments/vote')
        .set('Authorization', `Bearer ${createToken(player4)}`)
        .send({
          tournamentId: tourneyId,
          phase: 'FORMAT',
          choice: 'bracket',
        });

      expect(res.status).toBe(200);
      expect(res.body.closedEarly).toBe(true);
      expect(res.body.result.winner).toBe('league');
      expect(res.body.result.wasDraw).toBe(false);

      // Verify Prisma tournament update with winning format and matchFormat
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: tourneyId },
        data: expect.objectContaining({ format: TournamentFormat.LEAGUE }),
      });

      const socketPayload = await endedPromise;
      expect(socketPayload.winner).toBe('league');
      expect(socketPayload.wasDraw).toBe(false);
      expect(socketPayload.voteCounts.league).toBe(3);
      expect(socketPayload.voteCounts.bracket).toBe(1);

      // In-memory session should be deleted/cleaned
      expect(getActiveVotingSession(tourneyId)).toBeNull();
    });

    it('resolves uniform tie-break when votes result in a draw (RF-101)', async () => {
      vi.spyOn(prisma.tournament, 'findFirst').mockResolvedValue({
        id: tourneyId,
        status: TournamentStatus.VOTING_FORMAT,
        participants,
      } as any);
      vi.spyOn(prisma.tournamentVote, 'upsert').mockResolvedValue({} as any);
      vi.spyOn(prisma.tournamentVote, 'count').mockResolvedValue(4);

      // Tie: 2 for bracket, 2 for league
      vi.spyOn(prisma.tournamentVote, 'findMany').mockResolvedValue([
        { participantId: 'part-messi', choice: 'bracket' },
        { participantId: 'part-dimaria', choice: 'bracket' },
        { participantId: 'part-julian', choice: 'league' },
        { participantId: 'part-dibu', choice: 'league' },
      ] as any);

      vi.spyOn(prisma.tournament, 'update').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/tournaments/vote')
        .set('Authorization', `Bearer ${createToken(player4)}`)
        .send({
          tournamentId: tourneyId,
          phase: 'FORMAT',
          choice: 'league',
        });

      expect(res.status).toBe(200);
      expect(res.body.closedEarly).toBe(true);
      expect(res.body.result.wasDraw).toBe(true);
      expect(['bracket', 'league']).toContain(res.body.result.winner);
      expect(res.body.result.tiedOptions).toEqual(['bracket', 'league']);
    });
  });

  describe('Timer Expiration and Auto-Closure (RF-100 condition 1)', () => {
    it('tallies cast votes and emits vote:ended when closeVotingSession is triggered on TIMEOUT', async () => {
      const tourneyId = 'tourney-timeout';
      startVotingSession(
        io,
        tourneyId,
        'FORMAT',
        ['bracket', 'league', 'double_elimination'],
        4,
        60
      );

      vi.spyOn(prisma.tournamentVote, 'findMany').mockResolvedValue([
        { participantId: 'part-messi', choice: 'double_elimination' },
      ] as any);
      const updateSpy = vi.spyOn(prisma.tournament, 'update').mockResolvedValue({} as any);

      const socket = createSocketClient(createToken(player1), tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const endedPromise = new Promise<VoteEndedPayload>((resolve) => {
        socket.on('vote:ended', (data: VoteEndedPayload) => resolve(data));
      });

      const result = await closeVotingSession(io, tourneyId, 'TIMEOUT');

      expect(result).not.toBeNull();
      expect(result?.winner).toBe('double_elimination');
      expect(result?.wasDraw).toBe(false);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: tourneyId },
        data: expect.objectContaining({ format: TournamentFormat.DOUBLE_ELIMINATION }),
      });

      const socketData = await endedPromise;
      expect(socketData.winner).toBe('double_elimination');
    });

    it('POST /api/tournaments/close-voting triggers idempotent manual timeout closure', async () => {
      const tourneyId = 'tourney-close-endpoint';
      startVotingSession(
        io,
        tourneyId,
        'FORMAT',
        ['bracket', 'league', 'double_elimination'],
        4,
        60
      );

      vi.spyOn(prisma.tournamentVote, 'findMany').mockResolvedValue([
        { participantId: 'part-messi', choice: 'league' },
      ] as any);
      vi.spyOn(prisma.tournament, 'update').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/tournaments/close-voting')
        .set('Authorization', `Bearer ${createToken(player1)}`)
        .send({ tournamentId: tourneyId });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result?.winner).toBe('league');

      // Calling again should return ok idempotently
      const res2 = await request(app)
        .post('/api/tournaments/close-voting')
        .set('Authorization', `Bearer ${createToken(player1)}`)
        .send({ tournamentId: tourneyId });

      expect(res2.status).toBe(200);
      expect(res2.body.ok).toBe(true);
      expect(res2.body.message).toContain('ya está cerrada');
    });
  });

  describe('WebSocket vote:sync Event', () => {
    it('returns active session data when client requests vote:sync', async () => {
      const tourneyId = 'tourney-sync';
      startVotingSession(
        io,
        tourneyId,
        'FORMAT',
        ['bracket', 'league', 'double_elimination'],
        4,
        60
      );

      vi.spyOn(prisma.tournamentVote, 'count').mockResolvedValue(2);

      const socket = createSocketClient(createToken(player1), tourneyId);
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const ackResponse = await new Promise<any>((resolve) => {
        socket.emit('vote:sync', tourneyId, (res: any) => resolve(res));
      });

      expect(ackResponse.ok).toBe(true);
      expect(ackResponse.session.phase).toBe('FORMAT');
      expect(ackResponse.session.totalVoters).toBe(4);
      expect(ackResponse.session.votesCast).toBe(2);
      expect(ackResponse.session.options).toContain('bracket');
    });

    it('returns error when requesting vote:sync on non-existent session', async () => {
      const socket = createSocketClient(createToken(player1));
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        socket.connect();
      });

      const ackResponse = await new Promise<any>((resolve) => {
        socket.emit('vote:sync', 'non-existent-tourney', (res: any) => resolve(res));
      });

      expect(ackResponse.ok).toBe(false);
      expect(ackResponse.error).toContain('No hay votación activa');
    });
  });

  describe('ASSIGNMENT_METHOD case-insensitive voting and ties (T41)', () => {
    const validAssignmentOptions = ['DIRECT_DRAW', 'DRAFT_ORDER'] as const;

    it('matches lowercase choices case-insensitively and returns canonical uppercase winner', () => {
      const votes = [
        { participantId: 'p1', choice: 'direct_draw' },
        { participantId: 'p2', choice: 'direct_draw' },
        { participantId: 'p3', choice: 'draft_order' },
      ];
      const result = computeVoteResults(votes as any, validAssignmentOptions);
      expect(result.winner).toBe('DIRECT_DRAW');
      expect(result.wasDraw).toBe(false);
      expect(result.voteCounts.DIRECT_DRAW).toBe(2);
      expect(result.voteCounts.DRAFT_ORDER).toBe(1);
      expect(result.totalValidVotes).toBe(3);
    });

    it('breaks ties uniformly between DIRECT_DRAW and DRAFT_ORDER with wasDraw: true and tiedOptions', () => {
      const tiedVotes = [
        { participantId: 'p1', choice: 'direct_draw' },
        { participantId: 'p2', choice: 'draft_order' },
      ];
      const result1 = computeVoteResults(tiedVotes as any, validAssignmentOptions, () => 0.1);
      expect(result1.winner).toBe('DIRECT_DRAW');
      expect(result1.wasDraw).toBe(true);
      expect(result1.tiedOptions).toEqual(['DIRECT_DRAW', 'DRAFT_ORDER']);

      const result2 = computeVoteResults(tiedVotes as any, validAssignmentOptions, () => 0.9);
      expect(result2.winner).toBe('DRAFT_ORDER');
      expect(result2.wasDraw).toBe(true);
      expect(result2.tiedOptions).toEqual(['DIRECT_DRAW', 'DRAFT_ORDER']);
    });

    it('handles 0 votes with wasDraw: true and uniform random selection', () => {
      const result0 = computeVoteResults([], validAssignmentOptions, () => 0.8);
      expect(result0.winner).toBe('DRAFT_ORDER');
      expect(result0.wasDraw).toBe(true);
      expect(result0.tiedOptions).toEqual(['DIRECT_DRAW', 'DRAFT_ORDER']);
      expect(result0.totalValidVotes).toBe(0);
      expect(result0.voteCounts.DIRECT_DRAW).toBe(0);
      expect(result0.voteCounts.DRAFT_ORDER).toBe(0);
    });
  });
});

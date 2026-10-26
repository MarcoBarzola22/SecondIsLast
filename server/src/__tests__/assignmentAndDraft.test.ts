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
  startVotingSession,
  closeVotingSession,
  cancelVotingSession,
  getActiveVotingSession,
} from '../sockets/votingHandler.js';
import {
  startDraftSession,
  handleDraftPick,
  handleDraftTimeout,
  clearActiveDraftSessions,
  getActiveDraftSession,
} from '../sockets/draftHandler.js';

describe('Assignment Method Voting and 30s Draft Turn Management (T33 · RF-99, RF-100, RF-103, RF-104)', () => {
  let app: ReturnType<typeof createApp>;
  let httpServer: HttpServer;
  let io: AppSocketServer;
  let port: number;
  const clientSockets: ClientSocket[] = [];

  const adminUser = {
    id: 'user-admin-t33',
    email: 'admin33@secondislast.com',
    name: 'Admin T33',
    role: Role.ADMIN,
    playerId: 'player-admin-33',
  };

  const p1 = {
    id: 'user-p1-t33',
    email: 'p1@secondislast.com',
    name: 'Jugador Uno',
    role: Role.PLAYER,
    playerId: 'player-1-33',
  };

  const p2 = {
    id: 'user-p2-t33',
    email: 'p2@secondislast.com',
    name: 'Jugador Dos',
    role: Role.PLAYER,
    playerId: 'player-2-33',
  };

  const createToken = (payload: object) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
  };

  function createSocketClient(token: string): ClientSocket {
    const socket = ioClient(`http://localhost:${port}`, {
      autoConnect: false,
      transports: ['websocket'],
      auth: { token },
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
    clearActiveDraftSessions();
    cancelVotingSession('t33-tourney-1');
    for (const s of clientSockets) {
      if (s.connected) s.disconnect();
    }
    clientSockets.length = 0;

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  describe('1. Votación Formal de Método de Asignación (60s)', () => {
    it('starts ASSIGNMENT_METHOD 60s voting session with DIRECT_DRAW and DRAFT_ORDER options', () => {
      const session = startVotingSession(
        io,
        't33-tourney-1',
        'ASSIGNMENT_METHOD',
        ['DIRECT_DRAW', 'DRAFT_ORDER'],
        2,
        60
      );

      expect(session.tournamentId).toBe('t33-tourney-1');
      expect(session.phase).toBe('ASSIGNMENT_METHOD');
      expect(session.options).toEqual(['DIRECT_DRAW', 'DRAFT_ORDER']);
      expect(session.closed).toBe(false);

      const active = getActiveVotingSession('t33-tourney-1');
      expect(active).not.toBeNull();
      expect(active?.phase).toBe('ASSIGNMENT_METHOD');
    });

    it('breaks ties uniformly at random when votes for DIRECT_DRAW and DRAFT_ORDER are equal', async () => {
      startVotingSession(
        io,
        't33-tourney-1',
        'ASSIGNMENT_METHOD',
        ['DIRECT_DRAW', 'DRAFT_ORDER'],
        2,
        60
      );

      // Mock prisma tournament for closing session
      const mockPrisma = {
        tournament: {
          findUnique: vi.fn().mockResolvedValue({
            id: 't33-tourney-1',
            status: TournamentStatus.VOTING_THEME,
            settings: {},
          }),
          update: vi.fn().mockResolvedValue({
            id: 't33-tourney-1',
            status: TournamentStatus.VOTING_THEME,
          }),
        },
        tournamentVote: {
          findMany: vi.fn().mockResolvedValue([
            { participantId: 'part-1', choice: 'direct_draw' },
            { participantId: 'part-2', choice: 'draft_order' },
          ]),
        },
      } as any;

      const result = await closeVotingSession(io, 't33-tourney-1', 'TIMEOUT', mockPrisma);

      expect(result).not.toBeNull();
      expect(['DIRECT_DRAW', 'DRAFT_ORDER']).toContain(result?.winner);
      expect(result?.wasDraw).toBe(true);
      expect(mockPrisma.tournament.update).toHaveBeenCalled();
    });
  });

  describe('2. Temporizador de 30 segundos por turno en Draft Manual', () => {
    const draftOrder = [
      { participantId: 'part-1', participantName: 'Jugador 1', order: 1 },
      { participantId: 'part-2', participantName: 'Jugador 2', order: 2 },
    ];
    const availableTeams = ['Boca Juniors', 'River Plate', 'Milan', 'Barcelona'];

    it('initializes a draft session with 30s timer and the first participant in turn', () => {
      const session = startDraftSession(
        io,
        't33-draft-tourney',
        availableTeams,
        draftOrder,
        30
      );

      expect(session.tournamentId).toBe('t33-draft-tourney');
      expect(session.currentTurnIndex).toBe(0);
      expect(session.currentParticipantId).toBe('part-1');
      expect(session.isComplete).toBe(false);
      expect(session.availableTeams).toHaveLength(4);
      expect(session.expiresAt).toBeDefined();
    });

    it('advances turn and excludes chosen team when handleDraftPick is executed', async () => {
      const mockPrisma = {
        tournamentParticipant: {
          update: vi.fn().mockResolvedValue({}),
        },
        tournament: {
          findUnique: vi.fn().mockResolvedValue({ id: 't33-draft-tourney', participants: [] }),
        },
      } as any;

      startDraftSession(
        io,
        't33-draft-tourney',
        availableTeams,
        draftOrder,
        30,
        mockPrisma
      );

      const pickResult = await handleDraftPick(
        io,
        't33-draft-tourney',
        'part-1',
        'Boca Juniors',
        30,
        mockPrisma
      );

      expect(pickResult.success).toBe(true);
      expect(pickResult.session!.chosenTeams['part-1']).toBe('Boca Juniors');
      expect(pickResult.session!.availableTeams).not.toContain('Boca Juniors');
      expect(pickResult.session!.availableTeams).toHaveLength(3);
      expect(pickResult.session!.currentTurnIndex).toBe(1);
      expect(pickResult.session!.currentParticipantId).toBe('part-2');
    });

    it('auto-assigns a random available team on 30s timeout and advances turn', async () => {
      const mockPrisma = {
        tournamentParticipant: {
          update: vi.fn().mockResolvedValue({}),
        },
        tournament: {
          findUnique: vi.fn().mockResolvedValue({ id: 't33-draft-tourney', participants: [] }),
        },
      } as any;

      startDraftSession(
        io,
        't33-draft-tourney',
        ['Boca Juniors', 'Milan'],
        draftOrder,
        30,
        mockPrisma
      );

      // Trigger timeout for part-1
      const timedOutSession = await handleDraftTimeout(
        io,
        't33-draft-tourney',
        30,
        mockPrisma
      );

      expect(timedOutSession).not.toBeNull();
      const assigned = timedOutSession!.chosenTeams['part-1'];
      expect(assigned).toBeDefined();
      expect(['Boca Juniors', 'Milan']).toContain(assigned);
      expect(timedOutSession!.availableTeams).not.toContain(assigned);
      expect(timedOutSession!.currentParticipantId).toBe('part-2');
    });
  });

  describe('3. REST endpoint POST /api/tournaments/draft/pick', () => {
    it('allows a participant to submit their draft pick via REST API', async () => {
      const { tournamentService } = await import('../services/tournamentService.js');
      vi.spyOn(tournamentService, 'validateUserIsParticipantOrAdmin').mockResolvedValue({} as any);

      startDraftSession(
        io,
        't33-draft-tourney',
        ['Boca Juniors', 'River Plate'],
        [{ participantId: p1.playerId, participantName: p1.name, order: 1 }],
        30
      );

      const token = createToken(p1);

      const res = await request(app)
        .post('/api/tournaments/draft/pick')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tournamentId: 't33-draft-tourney',
          participantId: p1.playerId,
          teamName: 'Boca Juniors',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.session.chosenTeams[p1.playerId]).toBe('Boca Juniors');
    });
  });
});

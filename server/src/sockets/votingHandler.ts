import { Socket } from 'socket.io';
import type { AppSocketServer } from './index.js';
import { prisma as defaultPrisma } from '../db.js';
import { computeVoteResults, type VoteEntry } from '../domain/voting.js';
import { TournamentFormat, TournamentStatus } from '@prisma/client';
import { tournamentService } from '../services/tournamentService.js';
import { startBracketSlotSession } from './bracketSlotHandler.js';

export type VotingPhase =
  | 'FORMAT'
  | 'PLAYOFF_SPOTS'
  | 'THEME'
  | 'ASSIGNMENT_METHOD'
  | 'BRACKET_METHOD';

export interface ActiveVotingSession {
  tournamentId: string;
  phase: VotingPhase;
  options: string[];
  expiresAt: string;
  expiresAtMs: number;
  totalVoters: number;
  timer?: NodeJS.Timeout;
  closed: boolean;
}

export interface VoteStartedPayload {
  phase: VotingPhase;
  options: string[];
  expiresAt: string;
  totalVoters: number;
}

export interface VoteUpdatedPayload {
  phase: VotingPhase;
  votesCast: number;
  totalVoters: number;
}

export interface VoteEndedPayload {
  phase: VotingPhase;
  winner: string;
  matchFormat?: string;
  wasDraw: boolean;
  tiedOptions?: string[];
  voteCounts: Record<string, number>;
}

// In-memory active voting sessions indexed by tournamentId
const activeVotingSessions = new Map<string, ActiveVotingSession>();
// In-memory pending phase transition timers: tournamentId -> timeout
const pendingPhaseTransitionTimers = new Map<string, NodeJS.Timeout>();

export function getActiveVotingSession(tournamentId: string): ActiveVotingSession | null {
  return activeVotingSessions.get(tournamentId) || null;
}

export function cancelVotingSession(tournamentId: string): void {
  const session = activeVotingSessions.get(tournamentId);
  if (session?.timer) {
    clearTimeout(session.timer);
  }
  activeVotingSessions.delete(tournamentId);

  const pendingTimer = pendingPhaseTransitionTimers.get(tournamentId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingPhaseTransitionTimers.delete(tournamentId);
  }
}

/**
 * Maps a lowercase domain tournament format string to the Prisma TournamentFormat enum.
 */
export function mapDomainFormatToPrisma(format: string): TournamentFormat {
  const normalized = format.toLowerCase();
  switch (normalized) {
    case 'bracket':
      return TournamentFormat.BRACKET;
    case 'league':
      return TournamentFormat.LEAGUE;
    case 'group_stage':
      return TournamentFormat.GROUP_STAGE;
    case 'league_playoffs':
      return TournamentFormat.LEAGUE_PLAYOFFS;
    case 'double_elimination':
      return TournamentFormat.DOUBLE_ELIMINATION;
    default:
      return TournamentFormat.BRACKET;
  }
}

/**
 * Initiates a 120-second countdown voting session for a tournament (RF-99, RF-100, RF-102).
 * Emits `vote:started` to the tournament room.
 */
export function startVotingSession(
  io: AppSocketServer | null,
  tournamentId: string,
  phase: VotingPhase,
  options: string[],
  totalVoters: number,
  durationSeconds: number = 60,
  prisma = defaultPrisma
): ActiveVotingSession {
  // Clear any existing active session timer for this tournament
  const existing = activeVotingSessions.get(tournamentId);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  const expiresAtMs = Date.now() + durationSeconds * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();

  const session: ActiveVotingSession = {
    tournamentId,
    phase,
    options,
    expiresAt,
    expiresAtMs,
    totalVoters,
    closed: false,
  };

  // Schedule auto-close on timer expiration (RF-100 condition 1)
  session.timer = setTimeout(async () => {
    try {
      await closeVotingSession(io, tournamentId, 'TIMEOUT', prisma);
    } catch (err) {
      console.error('[VotingHandler] Error closing voting on timeout:', err);
    }
  }, durationSeconds * 1000);

  activeVotingSessions.set(tournamentId, session);

  // Broadcast vote:started event
  if (io) {
    try {
      const payload: VoteStartedPayload = {
        phase,
        options,
        expiresAt,
        totalVoters,
      };
      io.to(`tournament:${tournamentId}`).emit('vote:started', payload);
    } catch (err) {
      console.warn('[VotingHandler] Error emitting vote:started:', err);
    }
  }

  return session;
}

/**
 * Broadcasts vote:updated to all clients in the tournament room.
 */
export function broadcastVoteUpdated(
  io: AppSocketServer | null,
  tournamentId: string,
  phase: VotingPhase,
  votesCast: number,
  totalVoters: number
): void {
  if (io) {
    try {
      const payload: VoteUpdatedPayload = {
        phase,
        votesCast,
        totalVoters,
      };
      io.to(`tournament:${tournamentId}`).emit('vote:updated', payload);
    } catch (err) {
      console.warn('[VotingHandler] Error emitting vote:updated:', err);
    }
  }
}

/**
 * Closes an active voting session (on timer expiration or 100% participation),
 * tallies votes, handles uniform tie-breaks (RF-101), updates the database,
 * and emits `vote:ended`.
 */
export async function closeVotingSession(
  io: AppSocketServer | null,
  tournamentId: string,
  _reason: 'TIMEOUT' | 'ALL_VOTED' | 'MANUAL',
  prisma = defaultPrisma
): Promise<VoteEndedPayload | null> {
  const session = activeVotingSessions.get(tournamentId);
  if (!session || session.closed) {
    return null;
  }

  session.closed = true;
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = undefined;
  }

  // 1. Retrieve all votes for this tournament and phase
  const votes = await prisma.tournamentVote.findMany({
    where: {
      tournamentId,
      phase: session.phase as any,
    },
  });

  const voteEntries: VoteEntry[] = votes.map((v) => ({
    participantId: v.participantId,
    choice: v.choice,
  }));

  // 2. Compute winner with domain rules (filtering invalid choices, uniform tie-break RF-101)
  const result = computeVoteResults(voteEntries, session.options);

  // 3. Persist winner in tournament record
  let resolvedWinner = result.winner;

  if (session.phase === 'FORMAT') {
    let resolvedFormat = result.winner;
    if (resolvedFormat.toLowerCase() === 'random') {
      const validWithoutRandom = session.options.filter((o) => o.toLowerCase() !== 'random');
      const randIdx = Math.floor(Math.random() * validWithoutRandom.length);
      resolvedFormat = validWithoutRandom[randIdx] || 'bracket';
    }
    resolvedWinner = resolvedFormat;

    const prismaFormat = mapDomainFormatToPrisma(resolvedFormat);

    // Tally matchFormat votes from tournament settings if present
    let settings: any = {};
    try {
      const tourney = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { settings: true },
      });
      if (tourney?.settings) {
        settings = tourney.settings;
      }
    } catch {
      // Gracefully handle unmocked or disconnected DB in unit tests
    }

    const matchFormatVotes = settings.matchFormatVotes || {};
    let twoLeggedCount = 0;
    let singleMatchCount = 0;
    for (const val of Object.values(matchFormatVotes)) {
      if (val === 'TWO_LEGGED') twoLeggedCount++;
      else singleMatchCount++;
    }
    let winnerMatchFormat = 'SINGLE_MATCH';
    if (twoLeggedCount > singleMatchCount) {
      winnerMatchFormat = 'TWO_LEGGED';
    } else if (singleMatchCount > twoLeggedCount) {
      winnerMatchFormat = 'SINGLE_MATCH';
    } else {
      winnerMatchFormat = Math.random() < 0.5 ? 'SINGLE_MATCH' : 'TWO_LEGGED';
    }

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        format: prismaFormat,
        matchFormat: winnerMatchFormat as any,
        status: TournamentStatus.VOTING_THEME,
      },
    });

    // Auto-advance to phase THEME after 8.5s (if draw/random) or 5.5s (if direct winner) (T42)
    if (io) {
      const isTieOrRandomOrZero =
        result.wasDraw ||
        result.winner.toLowerCase() === 'random' ||
        Object.values(result.voteCounts || {}).reduce((a, b) => a + b, 0) === 0;
      const waitTime = isTieOrRandomOrZero ? 8500 : 5500;

      const formatTransitionTimer = setTimeout(async () => {
        pendingPhaseTransitionTimers.delete(tournamentId);
        try {
          const fresh = await prisma.tournament.findUnique({
            where: { id: tournamentId },
            include: { participants: { where: { isPresent: true } } },
          });
          if (!fresh || fresh.status === TournamentStatus.ABANDONED) return;

          await prisma.tournament.update({
            where: { id: tournamentId },
            data: { status: TournamentStatus.VOTING_THEME },
          });

          if (prismaFormat === TournamentFormat.LEAGUE_PLAYOFFS) {
            const count = fresh.participants?.length || session.totalVoters || 4;
            const spotOptions: string[] = [];
            for (let s = 2; s <= Math.max(2, count - 1); s++) {
              spotOptions.push(String(s));
            }
            spotOptions.push('random');

            startVotingSession(
              io,
              tournamentId,
              'PLAYOFF_SPOTS',
              spotOptions,
              session.totalVoters,
              60,
              prisma
            );
          } else {
            const themeOptions = await tournamentService.getThemeVotingOptions();
            startVotingSession(
              io,
              tournamentId,
              'THEME',
              themeOptions,
              session.totalVoters,
              60,
              prisma
            );
          }
        } catch (err) {
          console.error('[VotingHandler] Error starting next voting session after FORMAT:', err);
        }
      }, waitTime);
      pendingPhaseTransitionTimers.set(tournamentId, formatTransitionTimer);
    }
  } else if (session.phase === 'PLAYOFF_SPOTS') {
    let resolvedSpots = result.winner;
    const validSpotsOptions = session.options.filter((o) => o.toLowerCase() !== 'random');
    const totalVotes = Object.values(result.voteCounts || {}).reduce((a, b) => a + b, 0);
    const isTieOrRandomOrZero =
      result.wasDraw ||
      result.winner.toLowerCase() === 'random' ||
      totalVotes === 0;

    let spotsTiedOptions = (result.tiedOptions && result.tiedOptions.length > 0)
      ? result.tiedOptions.filter((o) => o.toLowerCase() !== 'random')
      : validSpotsOptions;

    if (isTieOrRandomOrZero) {
      const candidates = spotsTiedOptions.length > 0 ? spotsTiedOptions : validSpotsOptions;
      if (resolvedSpots.toLowerCase() === 'random' || totalVotes === 0) {
        const randIdx = Math.floor(Math.random() * candidates.length);
        resolvedSpots = candidates[randIdx] || '2';
      }
    }
    resolvedWinner = resolvedSpots;

    let settings: any = {};
    try {
      const tourney = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { settings: true },
      });
      if (tourney?.settings && typeof tourney.settings === 'object') {
        settings = tourney.settings;
      }
    } catch {
      // Gracefully continue
    }
    settings.qualifyingSpots = parseInt(resolvedSpots, 10);
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { settings, status: TournamentStatus.VOTING_THEME },
    });

    if (io) {
      const waitTime = isTieOrRandomOrZero ? 8500 : 5500;
      const spotsTransitionTimer = setTimeout(async () => {
        pendingPhaseTransitionTimers.delete(tournamentId);
        try {
          const fresh = await prisma.tournament.findUnique({ where: { id: tournamentId } });
          if (!fresh || fresh.status === TournamentStatus.ABANDONED) return;

          const themeOptions = await tournamentService.getThemeVotingOptions();
          startVotingSession(
            io,
            tournamentId,
            'THEME',
            themeOptions,
            session.totalVoters,
            60,
            prisma
          );
        } catch (err) {
          console.error('[VotingHandler] Error starting THEME after PLAYOFF_SPOTS:', err);
        }
      }, waitTime);
      pendingPhaseTransitionTimers.set(tournamentId, spotsTransitionTimer);
    }
  } else if (session.phase === 'THEME') {
    let resolvedTheme = result.winner;
    const availableThemes = await tournamentService.getAllAvailableThemeNames();
    const validThemeOptions = session.options.filter((o) => o.toLowerCase() !== 'random');
    const fallbackThemes = validThemeOptions.length > 0 ? validThemeOptions : availableThemes;

    const totalVotes = Object.values(result.voteCounts || {}).reduce((a, b) => a + b, 0);
    const isTieOrRandomOrZero =
      result.wasDraw ||
      result.winner.toLowerCase() === 'random' ||
      totalVotes === 0;

    let themeTiedOptions = (result.tiedOptions && result.tiedOptions.length > 0)
      ? result.tiedOptions.filter((o) => o.toLowerCase() !== 'random')
      : fallbackThemes;

    if (isTieOrRandomOrZero) {
      const candidates = themeTiedOptions.length > 0 ? themeTiedOptions : fallbackThemes;
      if (resolvedTheme.toLowerCase() === 'random' || totalVotes === 0) {
        const randIdx = Math.floor(Math.random() * candidates.length);
        resolvedTheme = candidates[randIdx] || 'Clásicos PES 6';
      }
    }
    resolvedWinner = resolvedTheme;

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        theme: resolvedTheme,
        status: TournamentStatus.VOTING_THEME,
      },
    });

    // Auto-advance to phase ASSIGNMENT_METHOD after 8.5s (if draw/random) or 5.5s (if direct winner) (T42)
    if (io) {
      const waitTime = isTieOrRandomOrZero ? 8500 : 5500;

      const themeTransitionTimer = setTimeout(async () => {
        pendingPhaseTransitionTimers.delete(tournamentId);
        try {
          const fresh = await prisma.tournament.findUnique({ where: { id: tournamentId } });
          if (!fresh || fresh.status === TournamentStatus.ABANDONED) return;

          startVotingSession(
            io,
            tournamentId,
            'ASSIGNMENT_METHOD',
            ['DIRECT_DRAW', 'DRAFT_ORDER'],
            session.totalVoters,
            60,
            prisma
          );
          io.to(`tournament:${tournamentId}`).emit('tournament:status', {
            tournamentId,
            status: TournamentStatus.VOTING_THEME,
          });
          io.emit('tournament:status', {
            tournamentId,
            status: TournamentStatus.VOTING_THEME,
          });
        } catch (err) {
          console.error('[VotingHandler] Error starting ASSIGNMENT_METHOD voting session after THEME:', err);
        }
      }, waitTime);
      pendingPhaseTransitionTimers.set(tournamentId, themeTransitionTimer);
    }
  } else if (session.phase === 'ASSIGNMENT_METHOD') {
    let resolvedMethod = result.winner;
    if (resolvedMethod !== 'DRAFT_ORDER' && resolvedMethod !== 'DIRECT_DRAW') {
      resolvedMethod = Math.random() < 0.5 ? 'DIRECT_DRAW' : 'DRAFT_ORDER';
    }
    resolvedWinner = resolvedMethod;

    let settings: any = {};
    try {
      const tourney = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { settings: true },
      });
      if (tourney?.settings && typeof tourney.settings === 'object') {
        settings = tourney.settings;
      }
    } catch {
      // Gracefully continue
    }
    settings.assignmentMethod = resolvedMethod;
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { settings },
    });

    if (io) {
      const isTieOrZero =
        result.wasDraw ||
        Object.values(result.voteCounts || {}).reduce((a, b) => a + b, 0) === 0;
      const waitTime = isTieOrZero ? 8500 : 5500;

      const assignmentTransitionTimer = setTimeout(async () => {
        pendingPhaseTransitionTimers.delete(tournamentId);
        try {
          const fresh = await prisma.tournament.findUnique({ where: { id: tournamentId } });
          if (!fresh || fresh.status === TournamentStatus.ABANDONED) return;

          const method = resolvedMethod.toUpperCase() === 'DRAFT_ORDER' ? 'DRAFT_ORDER' : 'DIRECT_DRAW';
          await tournamentService.executeTeamDraw(
            undefined as any,
            io,
            tournamentId,
            undefined,
            1800,
            method as any
          );
        } catch (err) {
          console.error('[VotingHandler] Error auto-triggering draw after assignment vote:', err);
        }
      }, waitTime);
      pendingPhaseTransitionTimers.set(tournamentId, assignmentTransitionTimer);
    }
  } else if (session.phase === 'BRACKET_METHOD') {
    let resolvedMethod = result.winner;
    if (resolvedMethod !== 'PICK_BRACKET_SLOT' && resolvedMethod !== 'DIRECT_MATCHUP_DRAW') {
      resolvedMethod = Math.random() < 0.5 ? 'DIRECT_MATCHUP_DRAW' : 'PICK_BRACKET_SLOT';
    }
    resolvedWinner = resolvedMethod;

    let settings: any = {};
    try {
      const tourney = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { settings: true },
      });
      if (tourney?.settings && typeof tourney.settings === 'object') {
        settings = tourney.settings;
      }
    } catch {
      // Gracefully continue
    }
    settings.bracketMethod = resolvedMethod;
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { settings },
    });

    if (io) {
      const isTieOrZero =
        result.wasDraw ||
        Object.values(result.voteCounts || {}).reduce((a, b) => a + b, 0) === 0;
      const waitTime = isTieOrZero ? 8500 : 5500;

      const bracketMethodTimer = setTimeout(async () => {
        pendingPhaseTransitionTimers.delete(tournamentId);
        try {
          const fresh = await prisma.tournament.findUnique({ where: { id: tournamentId } });
          if (!fresh || fresh.status === TournamentStatus.ABANDONED) return;

          if (resolvedMethod === 'DIRECT_MATCHUP_DRAW') {
            await tournamentService.generateRelationalFixture(tournamentId, io);
          } else {
            await startBracketSlotSession(io, tournamentId, prisma);
          }
        } catch (err) {
          console.error('[VotingHandler] Error advancing after BRACKET_METHOD vote:', err);
        }
      }, waitTime);
      pendingPhaseTransitionTimers.set(tournamentId, bracketMethodTimer);
    }
  }

  // 4. Clean up in-memory session
  activeVotingSessions.delete(tournamentId);

  // 5. Broadcast vote:ended event across room and globally
  let wasDraw = result.wasDraw;
  let tiedOptions = result.tiedOptions;

  if (session.phase === 'THEME') {
    const totalVotes = Object.values(result.voteCounts || {}).reduce((a, b) => a + b, 0);
    if (result.wasDraw || result.winner.toLowerCase() === 'random' || totalVotes === 0) {
      wasDraw = true;
      const validThemeOptions = session.options.filter((o) => o.toLowerCase() !== 'random');
      const fallbackThemes = validThemeOptions.length > 0 ? validThemeOptions : await tournamentService.getAllAvailableThemeNames();
      const candidates = (result.tiedOptions && result.tiedOptions.length > 0)
        ? result.tiedOptions.filter((o) => o.toLowerCase() !== 'random')
        : fallbackThemes;
      tiedOptions = candidates.length > 0 ? candidates : fallbackThemes;
    }
  } else if (session.phase === 'FORMAT') {
    const totalVotes = Object.values(result.voteCounts || {}).reduce((a, b) => a + b, 0);
    if (result.wasDraw || result.winner.toLowerCase() === 'random' || totalVotes === 0) {
      wasDraw = true;
      const validOptions = session.options.filter((o) => o.toLowerCase() !== 'random');
      const fallbackOptions = validOptions.length > 0 ? validOptions : ['bracket', 'league', 'double_elimination'];
      const candidates = (result.tiedOptions && result.tiedOptions.length > 0)
        ? result.tiedOptions.filter((o) => o.toLowerCase() !== 'random')
        : fallbackOptions;
      tiedOptions = candidates.length > 0 ? candidates : fallbackOptions;
    }
  } else if (session.phase === 'PLAYOFF_SPOTS') {
    const totalVotes = Object.values(result.voteCounts || {}).reduce((a, b) => a + b, 0);
    if (result.wasDraw || result.winner.toLowerCase() === 'random' || totalVotes === 0) {
      wasDraw = true;
      const validOptions = session.options.filter((o) => o.toLowerCase() !== 'random');
      const candidates = (result.tiedOptions && result.tiedOptions.length > 0)
        ? result.tiedOptions.filter((o) => o.toLowerCase() !== 'random')
        : validOptions;
      tiedOptions = candidates.length > 0 ? candidates : validOptions;
    }
  } else if (session.phase === 'BRACKET_METHOD') {
    const totalVotes = Object.values(result.voteCounts || {}).reduce((a, b) => a + b, 0);
    if (result.wasDraw || totalVotes === 0) {
      wasDraw = true;
      tiedOptions = ['DIRECT_MATCHUP_DRAW', 'PICK_BRACKET_SLOT'];
    }
  }

  const payload: VoteEndedPayload = {
    phase: session.phase,
    winner: resolvedWinner,
    matchFormat: session.phase === 'FORMAT' ? (await prisma.tournament.findUnique({ where: { id: tournamentId } }))?.matchFormat || 'SINGLE_MATCH' : undefined,
    wasDraw,
    tiedOptions,
    voteCounts: result.voteCounts,
  };

  if (io) {
    try {
      io.to(`tournament:${tournamentId}`).emit('vote:ended', payload);
      io.emit('vote:ended', payload);
    } catch (err) {
      console.warn('[VotingHandler] Error emitting vote:ended:', err);
    }
  }

  return payload;
}

/**
 * Registers WebSocket handlers for voting synchronization.
 */
export function registerVotingHandlers(_io: AppSocketServer, socket: Socket): void {
  socket.on(
    'vote:sync',
    async (
      tournamentId: string,
      ack?: (res: { ok: boolean; session?: Partial<ActiveVotingSession>; error?: string }) => void
    ) => {
      try {
        const session = getActiveVotingSession(tournamentId);
        if (session && !session.closed) {
          const votesCast = await defaultPrisma.tournamentVote.count({
            where: {
              tournamentId,
              phase: session.phase as any,
            },
          });

          const data = {
            phase: session.phase,
            options: session.options,
            expiresAt: session.expiresAt,
            totalVoters: session.totalVoters,
            votesCast,
          };

          if (ack) ack({ ok: true, session: data });
          socket.emit('vote:sync:response', data);
        } else {
          if (ack) ack({ ok: false, error: 'No hay votación activa para este torneo.' });
        }
      } catch (err: any) {
        if (ack) ack({ ok: false, error: err.message || 'Error al sincronizar votación.' });
      }
    }
  );
}

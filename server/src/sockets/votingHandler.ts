import { Socket } from 'socket.io';
import type { AppSocketServer } from './index.js';
import { prisma as defaultPrisma } from '../db.js';
import { computeVoteResults, type VoteEntry } from '../domain/voting.js';
import { TournamentFormat } from '@prisma/client';

export interface ActiveVotingSession {
  tournamentId: string;
  phase: 'FORMAT' | 'THEME';
  options: string[];
  expiresAt: string;
  expiresAtMs: number;
  totalVoters: number;
  timer?: NodeJS.Timeout;
  closed: boolean;
}

export interface VoteStartedPayload {
  phase: 'FORMAT' | 'THEME';
  options: string[];
  expiresAt: string;
  totalVoters: number;
}

export interface VoteUpdatedPayload {
  phase: 'FORMAT' | 'THEME';
  votesCast: number;
  totalVoters: number;
}

export interface VoteEndedPayload {
  phase: 'FORMAT' | 'THEME';
  winner: string;
  wasDraw: boolean;
  tiedOptions?: string[];
  voteCounts: Record<string, number>;
}

// In-memory active voting sessions indexed by tournamentId
const activeVotingSessions = new Map<string, ActiveVotingSession>();

export function getActiveVotingSession(tournamentId: string): ActiveVotingSession | null {
  return activeVotingSessions.get(tournamentId) || null;
}

export function cancelVotingSession(tournamentId: string): void {
  const session = activeVotingSessions.get(tournamentId);
  if (session?.timer) {
    clearTimeout(session.timer);
  }
  activeVotingSessions.delete(tournamentId);
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
  phase: 'FORMAT' | 'THEME',
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
  phase: 'FORMAT' | 'THEME',
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
  if (session.phase === 'FORMAT') {
    let resolvedFormat = result.winner;
    if (resolvedFormat.toLowerCase() === 'random') {
      const validWithoutRandom = session.options.filter((o) => o.toLowerCase() !== 'random');
      const randIdx = Math.floor(Math.random() * validWithoutRandom.length);
      resolvedFormat = validWithoutRandom[randIdx] || 'bracket';
    }

    const prismaFormat = mapDomainFormatToPrisma(resolvedFormat);

    // Tally matchFormat votes from tournament settings if present
    const tourney = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { settings: true },
    });
    const settings = (tourney?.settings as any) || {};
    const matchFormatVotes = settings.matchFormatVotes || {};
    let twoLeggedCount = 0;
    let singleMatchCount = 0;
    for (const val of Object.values(matchFormatVotes)) {
      if (val === 'TWO_LEGGED') twoLeggedCount++;
      else singleMatchCount++;
    }
    const winnerMatchFormat = twoLeggedCount > singleMatchCount ? 'TWO_LEGGED' : 'SINGLE_MATCH';

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        format: prismaFormat,
        matchFormat: winnerMatchFormat as any,
        status: 'VOTING_THEME',
      },
    });
  } else if (session.phase === 'THEME') {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        theme: result.winner,
      },
    });
  }

  // 4. Clean up in-memory session
  activeVotingSessions.delete(tournamentId);

  // 5. Broadcast vote:ended event
  const payload: VoteEndedPayload = {
    phase: session.phase,
    winner: result.winner,
    wasDraw: result.wasDraw,
    tiedOptions: result.tiedOptions,
    voteCounts: result.voteCounts,
  };

  if (io) {
    io.to(`tournament:${tournamentId}`).emit('vote:ended', payload);
    if (session.phase === 'FORMAT') {
      io.to(`tournament:${tournamentId}`).emit('tournament:status', {
        status: 'VOTING_THEME',
        tournamentId,
      });
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

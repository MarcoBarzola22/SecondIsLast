import { Socket } from 'socket.io';
import type { AppSocketServer } from './index.js';
import { tournamentService } from '../services/tournamentService.js';
import { prisma as defaultPrisma } from '../db.js';
import { getFormatVotingOptions } from '../domain/voting.js';
import { startVotingSession } from './votingHandler.js';

export interface LobbyUpdatedPayload {
  participants: any[];
  count: number;
  canStart: boolean;
  lobbyExpiresAt?: string | null;
}

interface ActiveLobbySession {
  tournamentId: string;
  expiresAt: string;
  expiresAtMs: number;
  timer: NodeJS.Timeout;
}

const activeLobbySessions = new Map<string, ActiveLobbySession>();

export function getActiveLobbySession(tournamentId: string): ActiveLobbySession | null {
  return activeLobbySessions.get(tournamentId) || null;
}

export function cancelLobbyTimer(tournamentId: string): void {
  const existing = activeLobbySessions.get(tournamentId);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }
  activeLobbySessions.delete(tournamentId);
}

/**
 * Broadcasts the updated lobby participant list, quorum status, and 120s timer
 * to all clients connected to room `tournament:<tournamentId>` (RF-96, RF-119).
 *
 * Rules:
 * - When count >= 4: Starts a 120s countdown if not already running.
 * - When count < 4: Cancels any active timer.
 * - On timer expiration: Automatically transitions tournament to VOTING_FORMAT.
 */
export function broadcastLobbyUpdated(
  io: AppSocketServer | null,
  tournamentId: string,
  participants: any[],
  durationSeconds: number = 60
): LobbyUpdatedPayload {
  const count = participants.length;
  const canStart = count >= 4;

  let lobbyExpiresAt: string | null = null;

  if (canStart) {
    let session = activeLobbySessions.get(tournamentId);
    if (!session) {
      const expiresAtMs = Date.now() + durationSeconds * 1000;
      const expiresAt = new Date(expiresAtMs).toISOString();

      const timer = setTimeout(async () => {
        try {
          cancelLobbyTimer(tournamentId);
          // Auto-advance tournament to VOTING_FORMAT
          const tournament = await defaultPrisma.tournament.findUnique({
            where: { id: tournamentId },
            include: {
              participants: {
                where: { isPresent: true },
                include: { player: true },
              },
            },
          });

          if (
            tournament &&
            tournament.status === 'LOBBY' &&
            tournament.participants.length >= 4
          ) {
            const options = getFormatVotingOptions(tournament.participants.length);

            await defaultPrisma.tournament.update({
              where: { id: tournamentId },
              data: { status: 'VOTING_FORMAT' },
            });

            startVotingSession(
              io,
              tournamentId,
              'FORMAT',
              options,
              tournament.participants.length,
              60
            );

            if (io) {
              const statusPayload = {
                status: 'VOTING_FORMAT',
                tournamentId,
              };
              io.to(`tournament:${tournamentId}`).emit('tournament:status', statusPayload);
              io.emit('tournament:status', statusPayload);
            }
          }
        } catch (err) {
          console.error('[LobbyHandler] Error auto-transitioning lobby to voting:', err);
        }
      }, durationSeconds * 1000);

      session = {
        tournamentId,
        expiresAt,
        expiresAtMs,
        timer,
      };
      activeLobbySessions.set(tournamentId, session);
    }
    lobbyExpiresAt = session.expiresAt;
  } else {
    // If quorum lost, cancel the timer
    cancelLobbyTimer(tournamentId);
    lobbyExpiresAt = null;
  }

  const payload: LobbyUpdatedPayload = {
    participants,
    count,
    canStart,
    lobbyExpiresAt,
  };

  if (io) {
    try {
      io.to(`tournament:${tournamentId}`).emit('lobby:updated', payload);
    } catch (err) {
      console.warn('[LobbyHandler] Error emitting lobby:updated:', err);
    }
  }

  return payload;
}

/**
 * Registers socket listeners for the lobby lifecycle with comprehensive error guards.
 */
export function registerLobbyHandlers(_io: AppSocketServer, socket: Socket): void {
  // Client requests initial lobby status or re-sync for a tournament
  socket.on(
    'lobby:sync',
    async (
      tournamentId: string,
      ack?: (res: { ok: boolean; data?: LobbyUpdatedPayload; error?: string }) => void
    ) => {
      try {
        const tournament = await tournamentService.getActiveTournament();
        if (tournament && tournament.id === tournamentId) {
          const session = activeLobbySessions.get(tournamentId);
          const payload: LobbyUpdatedPayload = {
            participants: tournament.participants,
            count: tournament.participants.length,
            canStart: tournament.participants.length >= 4,
            lobbyExpiresAt: session ? session.expiresAt : null,
          };
          if (ack) ack({ ok: true, ...payload });
          socket.emit('lobby:updated', payload);
        } else {
          if (ack) ack({ ok: false, error: 'Torneo no encontrado o no activo.' });
        }
      } catch (err: any) {
        if (ack) ack({ ok: false, error: err.message || 'Error al sincronizar lobby.' });
      }
    }
  );

  // RF-94: Disconnecting socket does NOT alter or remove presence in DB.
  socket.on('disconnect', () => {
    // Intentionally no-op: Presence is persistent in database (RF-94).
  });
}

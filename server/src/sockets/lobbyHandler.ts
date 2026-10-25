import { Socket } from 'socket.io';
import type { AppSocketServer } from './index.js';
import { tournamentService } from '../services/tournamentService.js';

export interface LobbyUpdatedPayload {
  participants: any[];
  count: number;
  canStart: boolean;
}

/**
 * Broadcasts the updated lobby participant list and quorum status to all clients
 * connected to the room `tournament:<tournamentId>` (RF-96, RF-119).
 * Quorum rule (RF-96): canStart is true if and only if count >= 4.
 */
export function broadcastLobbyUpdated(
  io: AppSocketServer | null,
  tournamentId: string,
  participants: any[]
): LobbyUpdatedPayload {
  const count = participants.length;
  const canStart = count >= 4;
  const payload: LobbyUpdatedPayload = {
    participants,
    count,
    canStart,
  };

  if (io) {
    io.to(`tournament:${tournamentId}`).emit('lobby:updated', payload);
  }

  return payload;
}

/**
 * Registers socket listeners for the lobby lifecycle.
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
          const payload: LobbyUpdatedPayload = {
            participants: tournament.participants,
            count: tournament.participants.length,
            canStart: tournament.participants.length >= 4,
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

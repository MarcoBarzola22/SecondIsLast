import { Socket } from 'socket.io';
import type { AppSocketServer } from './index.js';
import { prisma as defaultPrisma } from '../db.js';
import { tournamentService } from '../services/tournamentService.js';

export interface BracketSlotDef {
  slotIndex: number;
  label: string;
  matchGroup: string;
  round: string;
  isBye?: boolean;
  participantId: string | null;
  participantName: string | null;
  teamName: string | null;
}

export interface BracketSlotTurnEntry {
  order: number;
  participantId: string;
  playerId: string;
  participantName: string;
  teamName: string;
}

export interface ActiveBracketSlotSession {
  tournamentId: string;
  format: string;
  turnOrder: BracketSlotTurnEntry[];
  currentTurnIndex: number;
  currentParticipantId: string;
  currentPlayerId: string;
  currentParticipantName: string;
  currentTeamName: string;
  slots: Record<number, BracketSlotDef>;
  expiresAt: string;
  expiresAtMs: number;
  timer?: NodeJS.Timeout;
  isComplete: boolean;
}

const activeBracketSlotSessions = new Map<string, ActiveBracketSlotSession>();

export function getActiveBracketSlotSession(tournamentId: string): ActiveBracketSlotSession | null {
  return activeBracketSlotSessions.get(tournamentId) || null;
}

export function cancelBracketSlotSession(tournamentId: string): void {
  const session = activeBracketSlotSessions.get(tournamentId);
  if (session?.timer) {
    clearTimeout(session.timer);
  }
  activeBracketSlotSessions.delete(tournamentId);
}

export function createInitialSlots(count: number, format: string = 'BRACKET'): Record<number, BracketSlotDef> {
  const slots: Record<number, BracketSlotDef> = {};
  const isDouble = format.toUpperCase() === 'DOUBLE_ELIMINATION';

  if (count === 4) {
    const r1Label = isDouble ? 'Ganadores Semi 1' : 'Llave 1 (Semifinal 1)';
    const r2Label = isDouble ? 'Ganadores Semi 2' : 'Llave 2 (Semifinal 2)';
    slots[0] = { slotIndex: 0, label: `${r1Label} - Casillero A`, matchGroup: r1Label, round: 'semifinal', participantId: null, participantName: null, teamName: null };
    slots[1] = { slotIndex: 1, label: `${r1Label} - Casillero B`, matchGroup: r1Label, round: 'semifinal', participantId: null, participantName: null, teamName: null };
    slots[2] = { slotIndex: 2, label: `${r2Label} - Casillero A`, matchGroup: r2Label, round: 'semifinal', participantId: null, participantName: null, teamName: null };
    slots[3] = { slotIndex: 3, label: `${r2Label} - Casillero B`, matchGroup: r2Label, round: 'semifinal', participantId: null, participantName: null, teamName: null };
  } else if (count === 5) {
    slots[0] = { slotIndex: 0, label: 'Cuartos 1 - Casillero A', matchGroup: 'Cuartos 1', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[1] = { slotIndex: 1, label: 'Cuartos 1 - Casillero B', matchGroup: 'Cuartos 1', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[2] = { slotIndex: 2, label: 'Pase Directo a Semi 1 (Espera al ganador de QF1)', matchGroup: 'Pase Directo Semi 1', round: 'semifinal', isBye: true, participantId: null, participantName: null, teamName: null };
    slots[3] = { slotIndex: 3, label: 'Pase Directo a Semi 2 - Casillero A', matchGroup: 'Pase Directo Semi 2', round: 'semifinal', isBye: true, participantId: null, participantName: null, teamName: null };
    slots[4] = { slotIndex: 4, label: 'Pase Directo a Semi 2 - Casillero B', matchGroup: 'Pase Directo Semi 2', round: 'semifinal', isBye: true, participantId: null, participantName: null, teamName: null };
  } else if (count === 6) {
    slots[0] = { slotIndex: 0, label: 'Cuartos 1 - Casillero A', matchGroup: 'Cuartos 1', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[1] = { slotIndex: 1, label: 'Cuartos 1 - Casillero B', matchGroup: 'Cuartos 1', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[2] = { slotIndex: 2, label: 'Cuartos 2 - Casillero A', matchGroup: 'Cuartos 2', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[3] = { slotIndex: 3, label: 'Cuartos 2 - Casillero B', matchGroup: 'Cuartos 2', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[4] = { slotIndex: 4, label: 'Pase Directo a Semi 1 (Espera al ganador de QF1)', matchGroup: 'Pase Directo Semi 1', round: 'semifinal', isBye: true, participantId: null, participantName: null, teamName: null };
    slots[5] = { slotIndex: 5, label: 'Pase Directo a Semi 2 (Espera al ganador de QF2)', matchGroup: 'Pase Directo Semi 2', round: 'semifinal', isBye: true, participantId: null, participantName: null, teamName: null };
  } else if (count === 7) {
    slots[0] = { slotIndex: 0, label: 'Cuartos 1 - Casillero A', matchGroup: 'Cuartos 1', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[1] = { slotIndex: 1, label: 'Cuartos 1 - Casillero B', matchGroup: 'Cuartos 1', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[2] = { slotIndex: 2, label: 'Cuartos 2 - Casillero A', matchGroup: 'Cuartos 2', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[3] = { slotIndex: 3, label: 'Cuartos 2 - Casillero B', matchGroup: 'Cuartos 2', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[4] = { slotIndex: 4, label: 'Cuartos 3 - Casillero A', matchGroup: 'Cuartos 3', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[5] = { slotIndex: 5, label: 'Cuartos 3 - Casillero B', matchGroup: 'Cuartos 3', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[6] = { slotIndex: 6, label: 'Pase Directo a Semi 2 (Espera al ganador de QF3)', matchGroup: 'Pase Directo Semi 2', round: 'semifinal', isBye: true, participantId: null, participantName: null, teamName: null };
  } else if (count === 8) {
    slots[0] = { slotIndex: 0, label: 'Cuartos 1 - Casillero A', matchGroup: 'Cuartos 1', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[1] = { slotIndex: 1, label: 'Cuartos 1 - Casillero B', matchGroup: 'Cuartos 1', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[2] = { slotIndex: 2, label: 'Cuartos 2 - Casillero A', matchGroup: 'Cuartos 2', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[3] = { slotIndex: 3, label: 'Cuartos 2 - Casillero B', matchGroup: 'Cuartos 2', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[4] = { slotIndex: 4, label: 'Cuartos 3 - Casillero A', matchGroup: 'Cuartos 3', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[5] = { slotIndex: 5, label: 'Cuartos 3 - Casillero B', matchGroup: 'Cuartos 3', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[6] = { slotIndex: 6, label: 'Cuartos 4 - Casillero A', matchGroup: 'Cuartos 4', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
    slots[7] = { slotIndex: 7, label: 'Cuartos 4 - Casillero B', matchGroup: 'Cuartos 4', round: 'quarterfinal', participantId: null, participantName: null, teamName: null };
  } else if (count === 9) {
    slots[0] = { slotIndex: 0, label: 'Octavos 1 - Casillero A', matchGroup: 'Octavos 1', round: 'round_of_16', participantId: null, participantName: null, teamName: null };
    slots[1] = { slotIndex: 1, label: 'Octavos 1 - Casillero B', matchGroup: 'Octavos 1', round: 'round_of_16', participantId: null, participantName: null, teamName: null };
    for (let i = 2; i < 9; i++) {
      slots[i] = { slotIndex: i, label: `Pase Directo a Cuartos ${i - 1}`, matchGroup: `Pase Directo QF`, round: 'quarterfinal', isBye: true, participantId: null, participantName: null, teamName: null };
    }
  } else if (count === 10) {
    slots[0] = { slotIndex: 0, label: 'Octavos 1 - Casillero A', matchGroup: 'Octavos 1', round: 'round_of_16', participantId: null, participantName: null, teamName: null };
    slots[1] = { slotIndex: 1, label: 'Octavos 1 - Casillero B', matchGroup: 'Octavos 1', round: 'round_of_16', participantId: null, participantName: null, teamName: null };
    slots[2] = { slotIndex: 2, label: 'Octavos 2 - Casillero A', matchGroup: 'Octavos 2', round: 'round_of_16', participantId: null, participantName: null, teamName: null };
    slots[3] = { slotIndex: 3, label: 'Octavos 2 - Casillero B', matchGroup: 'Octavos 2', round: 'round_of_16', participantId: null, participantName: null, teamName: null };
    for (let i = 4; i < 10; i++) {
      slots[i] = { slotIndex: i, label: `Pase Directo a Cuartos ${i - 3}`, matchGroup: `Pase Directo QF`, round: 'quarterfinal', isBye: true, participantId: null, participantName: null, teamName: null };
    }
  }

  return slots;
}

export async function startBracketSlotSession(
  io: AppSocketServer | null,
  tournamentId: string,
  prisma = defaultPrisma,
  durationSeconds: number = 20
): Promise<ActiveBracketSlotSession | null> {
  cancelBracketSlotSession(tournamentId);

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      participants: {
        where: { isPresent: true },
        include: { player: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!tournament || tournament.participants.length < 4) {
    return null;
  }

  // Shuffle participants to build turn order
  const shuffled = [...tournament.participants].sort(() => Math.random() - 0.5);
  const turnOrder: BracketSlotTurnEntry[] = shuffled.map((p, idx) => ({
    order: idx + 1,
    participantId: p.id,
    playerId: p.playerId,
    participantName: `${p.player.firstName} ${p.player.lastName}`.trim(),
    teamName: p.teamName || 'Equipo Asignado',
  }));

  const formatStr = tournament.format || 'BRACKET';
  const initialSlots = createInitialSlots(turnOrder.length, formatStr);
  const firstTurn = turnOrder[0]!;
  const expiresAtMs = Date.now() + durationSeconds * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();

  const session: ActiveBracketSlotSession = {
    tournamentId,
    format: formatStr,
    turnOrder,
    currentTurnIndex: 0,
    currentParticipantId: firstTurn.participantId,
    currentPlayerId: firstTurn.playerId,
    currentParticipantName: firstTurn.participantName,
    currentTeamName: firstTurn.teamName,
    slots: initialSlots,
    expiresAt,
    expiresAtMs,
    isComplete: false,
  };

  session.timer = setTimeout(async () => {
    try {
      await handleBracketSlotTimeout(io, tournamentId, durationSeconds, prisma);
    } catch (err) {
      console.error('[BracketSlotHandler] Error on slot timeout:', err);
    }
  }, durationSeconds * 1000);

  activeBracketSlotSessions.set(tournamentId, session);

  if (io) {
    const payload = {
      tournamentId,
      format: tournament.format,
      turnOrder,
      currentTurnIndex: 0,
      currentParticipantId: firstTurn.participantId,
      currentPlayerId: firstTurn.playerId,
      currentParticipantName: firstTurn.participantName,
      currentTeamName: firstTurn.teamName,
      slots: initialSlots,
      expiresAt,
      durationSeconds,
    };
    io.to(`tournament:${tournamentId}`).emit('bracket_slot:session_started', payload);
    io.emit('bracket_slot:session_started', payload);
  }

  return session;
}

export async function advanceBracketSlotTurn(
  io: AppSocketServer | null,
  session: ActiveBracketSlotSession,
  durationSeconds: number = 20,
  prisma = defaultPrisma
): Promise<ActiveBracketSlotSession> {
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = undefined;
  }

  const nextIndex = session.currentTurnIndex + 1;

  if (nextIndex >= session.turnOrder.length) {
    session.isComplete = true;

    // Ordered participant IDs based on slotIndex: 0, 1, 2, ..., N-1
    const orderedParticipantIds = Object.keys(session.slots)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => session.slots[k]?.participantId)
      .filter(Boolean) as string[];

    if (io) {
      io.to(`tournament:${session.tournamentId}`).emit('bracket_slot:completed', {
        tournamentId: session.tournamentId,
        slots: session.slots,
      });
      io.emit('bracket_slot:completed', {
        tournamentId: session.tournamentId,
        slots: session.slots,
      });
    }

    try {
      await tournamentService.generateRelationalFixture(
        session.tournamentId,
        io,
        orderedParticipantIds
      );
    } catch (err) {
      console.error('[BracketSlotHandler] Error generating fixture after slots complete:', err);
    }

    return session;
  }

  // Next turn
  session.currentTurnIndex = nextIndex;
  const nextTurn = session.turnOrder[nextIndex]!;
  session.currentParticipantId = nextTurn.participantId;
  session.currentPlayerId = nextTurn.playerId;
  session.currentParticipantName = nextTurn.participantName;
  session.currentTeamName = nextTurn.teamName;

  const expiresAtMs = Date.now() + durationSeconds * 1000;
  session.expiresAtMs = expiresAtMs;
  session.expiresAt = new Date(expiresAtMs).toISOString();

  session.timer = setTimeout(async () => {
    try {
      await handleBracketSlotTimeout(io, session.tournamentId, durationSeconds, prisma);
    } catch (err) {
      console.error('[BracketSlotHandler] Error on slot timeout:', err);
    }
  }, durationSeconds * 1000);

  if (io) {
    const payload = {
      tournamentId: session.tournamentId,
      currentTurnIndex: nextIndex,
      currentParticipantId: nextTurn.participantId,
      currentPlayerId: nextTurn.playerId,
      currentParticipantName: nextTurn.participantName,
      currentTeamName: nextTurn.teamName,
      slots: session.slots,
      expiresAt: session.expiresAt,
    };
    io.to(`tournament:${session.tournamentId}`).emit('bracket_slot:updated', payload);
    io.emit('bracket_slot:updated', payload);
  }

  return session;
}

export async function handleBracketSlotTimeout(
  io: AppSocketServer | null,
  tournamentId: string,
  durationSeconds: number = 20,
  prisma = defaultPrisma
): Promise<void> {
  const session = activeBracketSlotSessions.get(tournamentId);
  if (!session || session.isComplete) return;

  const currentTurn = session.turnOrder[session.currentTurnIndex];
  if (!currentTurn) return;

  // Find all free slots
  const freeSlots = Object.values(session.slots).filter((s) => !s.participantId);
  if (freeSlots.length > 0) {
    const randomSlot = freeSlots[Math.floor(Math.random() * freeSlots.length)]!;
    session.slots[randomSlot.slotIndex] = {
      ...randomSlot,
      participantId: currentTurn.participantId,
      participantName: currentTurn.participantName,
      teamName: currentTurn.teamName,
    };
  }

  await advanceBracketSlotTurn(io, session, durationSeconds, prisma);
}

export async function handleBracketSlotPick(
  io: AppSocketServer | null,
  tournamentId: string,
  participantId: string,
  slotIndex: number,
  durationSeconds: number = 20,
  prisma = defaultPrisma
): Promise<{ ok: boolean; message?: string; session?: ActiveBracketSlotSession }> {
  const session = activeBracketSlotSessions.get(tournamentId);
  if (!session) {
    return { ok: false, message: 'No hay ninguna sesión de elección de casillero activa.' };
  }
  if (session.isComplete) {
    return { ok: false, message: 'La elección de casilleros ya ha finalizado.' };
  }

  const currentTurn = session.turnOrder[session.currentTurnIndex];
  if (!currentTurn || currentTurn.participantId !== participantId) {
    return { ok: false, message: 'No es tu turno de elegir casillero en la llave.' };
  }

  const slot = session.slots[slotIndex];
  if (!slot) {
    return { ok: false, message: 'El casillero seleccionado no existe.' };
  }
  if (slot.participantId) {
    return { ok: false, message: 'Ese casillero ya fue ocupado por otro jugador.' };
  }

  // Assign slot
  session.slots[slotIndex] = {
    ...slot,
    participantId: currentTurn.participantId,
    participantName: currentTurn.participantName,
    teamName: currentTurn.teamName,
  };

  const updatedSession = await advanceBracketSlotTurn(io, session, durationSeconds, prisma);
  return { ok: true, session: updatedSession };
}

export function registerBracketSlotHandlers(io: AppSocketServer, socket: Socket): void {
  socket.on('bracket_slot:sync', (tournamentId: string, callback?: (res: any) => void) => {
    const session = getActiveBracketSlotSession(tournamentId);
    if (!session) {
      if (typeof callback === 'function') callback({ ok: false });
      return;
    }
    const payload = {
      ok: true,
      tournamentId: session.tournamentId,
      format: session.format,
      turnOrder: session.turnOrder,
      currentTurnIndex: session.currentTurnIndex,
      currentParticipantId: session.currentParticipantId,
      currentPlayerId: session.currentPlayerId,
      currentParticipantName: session.currentParticipantName,
      currentTeamName: session.currentTeamName,
      slots: session.slots,
      expiresAt: session.expiresAt,
      isComplete: session.isComplete,
    };
    if (typeof callback === 'function') callback(payload);
    else socket.emit('bracket_slot:sync_response', payload);
  });

  socket.on('bracket_slot:pick', async (data: { tournamentId: string; slotIndex: number }, callback?: (res: any) => void) => {
    try {
      const socketUser = (socket as any).data?.user;
      const tournamentId = data.tournamentId;
      const slotIndex = data.slotIndex;

      const session = getActiveBracketSlotSession(tournamentId);
      if (!session) {
        if (typeof callback === 'function') callback({ ok: false, message: 'Sesión no activa' });
        return;
      }

      // Resolve participant from socketUser
      const userPlayerId = socketUser?.playerId || socketUser?.player?.id;
      const currentTurn = session.turnOrder[session.currentTurnIndex];
      const isCurrentPlayer = currentTurn && (currentTurn.playerId === userPlayerId || currentTurn.participantId === socketUser?.id);

      const participantId = isCurrentPlayer ? currentTurn.participantId : '';
      const result = await handleBracketSlotPick(io, tournamentId, participantId, slotIndex);
      if (typeof callback === 'function') callback(result);
    } catch (err: any) {
      if (typeof callback === 'function') callback({ ok: false, message: err.message });
    }
  });
}

import { Socket } from 'socket.io';
import type { AppSocketServer } from './index.js';
import { prisma as defaultPrisma } from '../db.js';
import { tournamentService } from '../services/tournamentService.js';
import { DEFAULT_THEME_TEAMS } from '../domain/teams.js';

export interface DraftOrderEntry {
  participantId: string;
  playerId?: string;
  participantName: string;
  order: number;
}

export interface ActiveDraftSession {
  tournamentId: string;
  theme: string;
  availableTeams: string[];
  chosenTeams: Record<string, string>; // participantId/playerId -> teamName
  draftOrder: DraftOrderEntry[];
  currentTurnIndex: number;
  currentParticipantId: string;
  currentPlayerId?: string;
  currentParticipantName: string;
  expiresAt: string;
  expiresAtMs: number;
  timer?: NodeJS.Timeout;
  isComplete: boolean;
}

export interface DraftTurnUpdatedPayload {
  tournamentId: string;
  currentTurnIndex: number;
  currentParticipantId: string;
  currentPlayerId?: string;
  currentParticipantName: string;
  draftOrder: DraftOrderEntry[];
  expiresAt: string;
  availableTeams: string[];
  chosenTeams: Record<string, string>;
  chosenTeamsByPlayerId?: Record<string, string>;
  chosenTeamsByParticipantName?: Record<string, string>;
  isComplete: boolean;
}

export function buildDraftPayloadExtras(session: ActiveDraftSession) {
  const chosenTeamsByPlayerId: Record<string, string> = {};
  const chosenTeamsByParticipantName: Record<string, string> = {};

  for (const entry of session.draftOrder) {
    const team = session.chosenTeams[entry.participantId] || (entry.playerId ? session.chosenTeams[entry.playerId] : undefined);
    if (team) {
      if (entry.playerId) {
        chosenTeamsByPlayerId[entry.playerId] = team;
      }
      chosenTeamsByParticipantName[team] = entry.participantName;
    }
  }

  return { chosenTeamsByPlayerId, chosenTeamsByParticipantName };
}

export interface DraftCompletedPayload {
  tournamentId: string;
  chosenTeams: Record<string, string>;
  chosenTeamsByPlayerId?: Record<string, string>;
  chosenTeamsByParticipantName?: Record<string, string>;
}

// In-memory active draft sessions indexed by tournamentId
const activeDraftSessions = new Map<string, ActiveDraftSession>();

export function getActiveDraftSession(tournamentId: string): ActiveDraftSession | null {
  return activeDraftSessions.get(tournamentId) || null;
}

export function clearActiveDraftSessions(): void {
  for (const session of activeDraftSessions.values()) {
    if (session.timer) {
      clearTimeout(session.timer);
    }
  }
  activeDraftSessions.clear();
}

/**
 * Starts or resets a 30-second turn draft session for a tournament.
 */
export function startDraftSession(
  io: AppSocketServer | null,
  tournamentId: string,
  availableTeams: string[],
  draftOrder: DraftOrderEntry[],
  durationSeconds: number = 20,
  prisma = defaultPrisma
): ActiveDraftSession {
  const existing = activeDraftSessions.get(tournamentId);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  const sortedOrder = [...draftOrder].sort((a, b) => a.order - b.order);
  const currentParticipant = sortedOrder[0];
  const expiresAtMs = Date.now() + durationSeconds * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();

  const session: ActiveDraftSession = {
    tournamentId,
    theme: '',
    availableTeams: [...availableTeams],
    chosenTeams: {},
    draftOrder: sortedOrder,
    currentTurnIndex: 0,
    currentParticipantId: currentParticipant?.participantId || '',
    currentPlayerId: currentParticipant?.playerId || '',
    currentParticipantName: currentParticipant?.participantName || '',
    expiresAt,
    expiresAtMs,
    isComplete: false,
  };

  session.timer = setTimeout(async () => {
    try {
      await handleDraftTimeout(io, tournamentId, durationSeconds, prisma);
    } catch (err) {
      console.error('[DraftHandler] Error handling draft timeout:', err);
    }
  }, durationSeconds * 1000);

  activeDraftSessions.set(tournamentId, session);

  if (io) {
    const { chosenTeamsByPlayerId, chosenTeamsByParticipantName } = buildDraftPayloadExtras(session);
    const payload: DraftTurnUpdatedPayload = {
      tournamentId,
      currentTurnIndex: 0,
      currentParticipantId: session.currentParticipantId,
      currentPlayerId: session.currentPlayerId,
      currentParticipantName: session.currentParticipantName,
      draftOrder: session.draftOrder,
      expiresAt,
      availableTeams: session.availableTeams,
      chosenTeams: session.chosenTeams,
      chosenTeamsByPlayerId,
      chosenTeamsByParticipantName,
      isComplete: false,
    };
    io.to(`tournament:${tournamentId}`).emit('draft:turn_updated', payload);
    io.emit('draft:turn_updated', payload);
  }

  return session;
}

/**
 * Automatically assigns a random remaining team when the 20-second timer expires.
 */
export async function handleDraftTimeout(
  io: AppSocketServer | null,
  tournamentId: string,
  durationSeconds: number = 20,
  prisma = defaultPrisma
): Promise<ActiveDraftSession | null> {
  const session = activeDraftSessions.get(tournamentId);
  if (!session || session.isComplete) {
    return null;
  }

  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = undefined;
  }

  // Pick random team from available
  const currentEntry = session.draftOrder[session.currentTurnIndex];
  const actualParticipantId = currentEntry?.participantId || session.currentParticipantId;
  const actualPlayerId = currentEntry?.playerId;

  let assignedTeam = 'Equipo Asignado';
  if (session.availableTeams.length > 0) {
    const randIdx = Math.floor(Math.random() * session.availableTeams.length);
    assignedTeam = session.availableTeams[randIdx];
    session.availableTeams.splice(randIdx, 1);
  }

  session.chosenTeams[actualParticipantId] = assignedTeam;
  if (actualPlayerId) {
    session.chosenTeams[actualPlayerId] = assignedTeam;
  }

  // Persist to DB
  try {
    await prisma.tournamentParticipant.update({
      where: { id: actualParticipantId },
      data: { teamName: assignedTeam },
    });
  } catch (err) {
    console.error('[DraftHandler] Failed to persist timeout team pick:', err);
  }

  // Advance turn
  return advanceDraftTurn(io, session, durationSeconds, prisma);
}

/**
 * Handles a player's deliberate pick during their active turn.
 */
export async function handleDraftPick(
  io: AppSocketServer | null,
  tournamentId: string,
  participantId: string,
  teamName: string,
  durationSeconds: number = 20,
  prisma = defaultPrisma
): Promise<{ success: boolean; session?: ActiveDraftSession; error?: string }> {
  const session = activeDraftSessions.get(tournamentId);
  if (!session || session.isComplete) {
    return { success: false, error: 'La sesión de draft no está activa.' };
  }

  const currentEntry = session.draftOrder[session.currentTurnIndex];
  const isMatch =
    session.currentParticipantId === participantId ||
    (currentEntry && (currentEntry.participantId === participantId || currentEntry.playerId === participantId));

  if (!isMatch) {
    return { success: false, error: 'No es tu turno para elegir equipo.' };
  }

  const teamIdx = session.availableTeams.findIndex(
    (t) => t.trim().toLowerCase() === teamName.trim().toLowerCase()
  );
  if (teamIdx === -1) {
    return { success: false, error: 'Ese equipo ya no está disponible.' };
  }

  const exactTeamName = session.availableTeams[teamIdx];
  session.availableTeams.splice(teamIdx, 1);

  const actualParticipantId = currentEntry?.participantId || session.currentParticipantId;
  const actualPlayerId = currentEntry?.playerId;
  session.chosenTeams[actualParticipantId] = exactTeamName;
  if (actualPlayerId) {
    session.chosenTeams[actualPlayerId] = exactTeamName;
  }

  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = undefined;
  }

  // Persist to DB
  try {
    await prisma.tournamentParticipant.update({
      where: { id: actualParticipantId },
      data: { teamName: exactTeamName },
    });
  } catch (err) {
    console.error('[DraftHandler] Failed to persist team pick:', err);
  }

  // Advance turn
  await advanceDraftTurn(io, session, durationSeconds, prisma);

  return { success: true, session };
}

/**
 * Advances turn to next player or completes draft and generates fixture.
 */
async function advanceDraftTurn(
  io: AppSocketServer | null,
  session: ActiveDraftSession,
  durationSeconds: number = 20,
  prisma = defaultPrisma
): Promise<ActiveDraftSession> {
  const nextIndex = session.currentTurnIndex + 1;

  if (nextIndex >= session.draftOrder.length) {
    // Draft completed!
    session.isComplete = true;
    session.timer = undefined;

    if (io) {
      const { chosenTeamsByPlayerId, chosenTeamsByParticipantName } = buildDraftPayloadExtras(session);
      const completedPayload: DraftCompletedPayload = {
        tournamentId: session.tournamentId,
        chosenTeams: session.chosenTeams,
        chosenTeamsByPlayerId,
        chosenTeamsByParticipantName,
      };
      io.to(`tournament:${session.tournamentId}`).emit('draft:completed', completedPayload);
      io.emit('draft:completed', completedPayload);
    }

    // Auto-generate fixture
    try {
      await tournamentService.generateRelationalFixture(session.tournamentId, io);
    } catch (err) {
      console.error('[DraftHandler] Error generating fixture after draft complete:', err);
    }

    return session;
  }

  // Setup next turn
  session.currentTurnIndex = nextIndex;
  const nextParticipant = session.draftOrder[nextIndex];
  session.currentParticipantId = nextParticipant.participantId;
  session.currentPlayerId = nextParticipant.playerId;
  session.currentParticipantName = nextParticipant.participantName;

  const expiresAtMs = Date.now() + durationSeconds * 1000;
  session.expiresAt = new Date(expiresAtMs).toISOString();
  session.expiresAtMs = expiresAtMs;

  session.timer = setTimeout(async () => {
    try {
      await handleDraftTimeout(io, session.tournamentId, durationSeconds, prisma);
    } catch (err) {
      console.error('[DraftHandler] Error handling draft timeout:', err);
    }
  }, durationSeconds * 1000);

  if (io) {
    const { chosenTeamsByPlayerId, chosenTeamsByParticipantName } = buildDraftPayloadExtras(session);
    const payload: DraftTurnUpdatedPayload = {
      tournamentId: session.tournamentId,
      currentTurnIndex: session.currentTurnIndex,
      currentParticipantId: session.currentParticipantId,
      currentPlayerId: session.currentPlayerId,
      currentParticipantName: session.currentParticipantName,
      draftOrder: session.draftOrder,
      expiresAt: session.expiresAt,
      availableTeams: session.availableTeams,
      chosenTeams: session.chosenTeams,
      chosenTeamsByPlayerId,
      chosenTeamsByParticipantName,
      isComplete: false,
    };
    io.to(`tournament:${session.tournamentId}`).emit('draft:turn_updated', payload);
    io.emit('draft:turn_updated', payload);
  }

  return session;
}

/**
 * Gets or recovers active draft session from database state.
 */
export async function getOrRecoverDraftSession(
  io: AppSocketServer | null,
  tournamentId: string,
  prisma = defaultPrisma
): Promise<ActiveDraftSession | null> {
  const existing = activeDraftSessions.get(tournamentId);
  if (existing) {
    return existing;
  }

  const tourney = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      participants: {
        where: { isPresent: true },
        include: { player: true },
        orderBy: { seed: 'asc' },
      },
    },
  });

  if (!tourney || tourney.participants.length < 4) {
    return null;
  }

  const theme = tourney.theme || 'Apertura 2006';
  const defaultTeams = DEFAULT_THEME_TEAMS[theme] || DEFAULT_THEME_TEAMS['Apertura 2006'] || [];

  const draftOrder: DraftOrderEntry[] = tourney.participants
    .map((p, idx) => ({
      participantId: p.id,
      playerId: p.playerId,
      participantName: `${p.player.firstName} ${p.player.lastName}`.trim(),
      order: p.seed ?? idx + 1,
    }))
    .sort((a, b) => a.order - b.order);

  const chosenTeams: Record<string, string> = {};
  const chosenSet = new Set<string>();

  for (const p of tourney.participants) {
    if (p.teamName) {
      chosenTeams[p.id] = p.teamName;
      if (p.playerId) {
        chosenTeams[p.playerId] = p.teamName;
      }
      chosenSet.add(p.teamName.toLowerCase());
    }
  }

  const availableTeams = defaultTeams.filter((t) => !chosenSet.has(t.toLowerCase()));

  // Find first unassigned
  const firstUnassignedIdx = tourney.participants.findIndex((p) => !p.teamName);
  const isComplete = firstUnassignedIdx === -1;
  const currentTurnIndex = isComplete ? tourney.participants.length : firstUnassignedIdx;
  const currentParticipant = draftOrder[currentTurnIndex] || draftOrder[0];

  const durationSeconds = 20;
  const expiresAtMs = Date.now() + durationSeconds * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();

  const session: ActiveDraftSession = {
    tournamentId,
    theme,
    availableTeams,
    chosenTeams,
    draftOrder,
    currentTurnIndex,
    currentParticipantId: currentParticipant?.participantId || '',
    currentPlayerId: currentParticipant?.playerId || '',
    currentParticipantName: currentParticipant?.participantName || '',
    expiresAt,
    expiresAtMs,
    isComplete,
  };

  if (!isComplete) {
    session.timer = setTimeout(async () => {
      try {
        await handleDraftTimeout(io, tournamentId, durationSeconds, prisma);
      } catch (err) {
        console.error('[DraftHandler] Error handling recovered timeout:', err);
      }
    }, durationSeconds * 1000);
  }

  activeDraftSessions.set(tournamentId, session);
  return session;
}

/**
 * Registers WebSocket handlers for synchronized draft.
 */
export function registerDraftHandlers(io: AppSocketServer, socket: Socket): void {
  socket.on(
    'draft:sync',
    async (
      tournamentId: string,
      ack?: (res: { ok: boolean; session?: any; error?: string }) => void
    ) => {
      try {
        const session = await getOrRecoverDraftSession(io, tournamentId);
        if (session) {
          const { chosenTeamsByPlayerId, chosenTeamsByParticipantName } = buildDraftPayloadExtras(session);
          const data = {
            tournamentId: session.tournamentId,
            currentTurnIndex: session.currentTurnIndex,
            currentParticipantId: session.currentParticipantId,
            currentParticipantName: session.currentParticipantName,
            expiresAt: session.expiresAt,
            availableTeams: session.availableTeams,
            chosenTeams: session.chosenTeams,
            chosenTeamsByPlayerId,
            chosenTeamsByParticipantName,
            draftOrder: session.draftOrder,
            isComplete: session.isComplete,
          };
          if (ack) ack({ ok: true, session: data });
          socket.emit('draft:sync:response', data);
        } else {
          if (ack) ack({ ok: false, error: 'No hay sesión de draft activa.' });
        }
      } catch (err: any) {
        if (ack) ack({ ok: false, error: err.message || 'Error al sincronizar draft.' });
      }
    }
  );

  socket.on(
    'draft:pick',
    async (
      payload: { tournamentId: string; participantId: string; teamName: string },
      ack?: (res: { ok: boolean; session?: any; error?: string }) => void
    ) => {
      try {
        const result = await handleDraftPick(
          io,
          payload.tournamentId,
          payload.participantId,
          payload.teamName
        );
        if (result.success && result.session) {
          const { chosenTeamsByPlayerId, chosenTeamsByParticipantName } = buildDraftPayloadExtras(result.session);
          const data = {
            tournamentId: result.session.tournamentId,
            currentTurnIndex: result.session.currentTurnIndex,
            currentParticipantId: result.session.currentParticipantId,
            currentParticipantName: result.session.currentParticipantName,
            expiresAt: result.session.expiresAt,
            availableTeams: result.session.availableTeams,
            chosenTeams: result.session.chosenTeams,
            chosenTeamsByPlayerId,
            chosenTeamsByParticipantName,
            isComplete: result.session.isComplete,
          };
          if (ack) ack({ ok: true, session: data });
        } else {
          if (ack) ack({ ok: false, error: result.error || 'Error al elegir equipo.' });
        }
      } catch (err: any) {
        if (ack) ack({ ok: false, error: err.message || 'Error al procesar elección de equipo.' });
      }
    }
  );
}

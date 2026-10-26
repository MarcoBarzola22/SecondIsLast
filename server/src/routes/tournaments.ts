import { Router, Request, Response } from 'express';
import { authMiddleware, optionalAuthMiddleware, requireAdmin } from '../middleware/authMiddleware.js';
import { whitelistMiddleware } from '../middleware/whitelistMiddleware.js';
import {
  tournamentService,
  ConflictError,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../services/tournamentService.js';
import { broadcastLobbyUpdated, cancelLobbyTimer, getActiveLobbySession } from '../sockets/lobbyHandler.js';
import {
  startVotingSession,
  broadcastVoteUpdated,
  closeVotingSession,
  getActiveVotingSession,
  cancelVotingSession,
} from '../sockets/votingHandler.js';
import { handleDraftPick } from '../sockets/draftHandler.js';
import { getSocketServer } from '../sockets/index.js';
import { Role, TournamentStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { getFormatVotingOptions } from '../domain/voting.js';

const router = Router();

function getIO(req: Request) {
  return req.app.get('io') || getSocketServer();
}

/**
 * GET /api/tournaments/active
 * Retrieves the currently active tournament (LOBBY, VOTING_FORMAT, VOTING_THEME, IN_PROGRESS)
 * or null if no tournament is in progress (RF-97).
 * Uses optionalAuthMiddleware so initial unauthenticated queries return 200 without noisy 401s.
 */
router.get('/active', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const tournament = await tournamentService.getActiveTournament();
    if (!tournament) {
      res.status(200).json({ tournament: null });
      return;
    }
    const lobbySession = getActiveLobbySession(tournament.id);
    const lobbyExpiresAt = lobbySession?.expiresAt || null;
    const votingSession = getActiveVotingSession(tournament.id);
    const votingSessionData =
      votingSession && !votingSession.closed
        ? {
            phase: votingSession.phase,
            options: votingSession.options,
            expiresAt: votingSession.expiresAt,
            totalVoters: votingSession.totalVoters,
          }
        : null;

    let myVote: string | null = null;
    let myMatchFormat: string | null = null;
    const user = req.user;
    if (user && tournament.participants) {
      const userParticipant = tournament.participants.find(
        (p: any) =>
          p.userId === user.id ||
          (user.playerId && p.playerId === user.playerId) ||
          (p.player && user.playerId && p.player.id === user.playerId) ||
          (p.player?.user?.id === user.id) ||
          (p.player?.user?.email?.toLowerCase() === user.email?.toLowerCase())
      );
      if (userParticipant) {
        const activePhase = (votingSessionData?.phase ||
          (tournament.status === 'VOTING_FORMAT' ? 'FORMAT' : 'THEME')) as any;
        try {
          const existingVote = await prisma.tournamentVote.findFirst({
            where: {
              tournamentId: tournament.id,
              participantId: userParticipant.id,
              phase: activePhase,
            },
          });
          if (existingVote) {
            myVote = existingVote.choice;
          }
        } catch {
          // Gracefully continue if DB query fails or in unit tests
        }
        const settings = (tournament.settings as any) || {};
        if (settings.matchFormatVotes && settings.matchFormatVotes[userParticipant.id]) {
          myMatchFormat = settings.matchFormatVotes[userParticipant.id];
        }
      }
    }

    const tourneySettings = (tournament.settings as any) || {};
    const assignmentMethod = tourneySettings.assignmentMethod || null;

    res.status(200).json({
      tournament: {
        ...tournament,
        lobbyExpiresAt,
        votingSession: votingSessionData,
        myVote,
        myMatchFormat,
        assignmentMethod,
      },
      lobbyExpiresAt,
      votingSession: votingSessionData,
      myVote,
      myMatchFormat,
      assignmentMethod,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error interno al consultar el torneo activo.' });
  }
});

// Enforce authentication and whitelist membership on tournament mutation endpoints (RNF-4, RF-89)
router.use(authMiddleware);
router.use(whitelistMiddleware);

/**
 * POST /api/tournaments/lobby
 * Creates a new tournament in LOBBY status (RF-98).
 * Fails with 409 Conflict if an active tournament already exists (RF-97).
 */
router.post('/lobby', async (req: Request, res: Response) => {
  try {
    const { name } = req.body || {};
    const tournament = await tournamentService.createLobby(name);
    res.status(201).json({ tournament });
  } catch (error: any) {
    if (error instanceof ConflictError || error.statusCode === 409 || error.message?.includes('activo')) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al crear el lobby del torneo.' });
  }
});

/**
 * POST /api/tournaments/abandon
 * Abandons the currently active tournament (LOBBY, VOTING_FORMAT, VOTING_THEME, IN_PROGRESS).
 * Allowed for Admin or confirmed participants (T30).
 * Clears active timers/sessions in memory and broadcasts tournament:abandoned and tournament:status (ABANDONED).
 */
router.post('/abandon', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== Role.ADMIN && (user.role as any) !== 'ADMIN') {
      res.status(403).json({ error: 'Solo el administrador puede reiniciar o abandonar el torneo globalmente.' });
      return;
    }

    const { tournamentId } = req.body || {};
    const result = await tournamentService.abandonTournament(user, tournamentId);
    const tournament = (result as any).tournament || result;

    // Cancel lobby and voting in-memory sessions/timers
    cancelLobbyTimer(tournament.id);
    cancelVotingSession(tournament.id);

    // Broadcast WebSocket events to all clients
    const io = getIO(req);
    if (io) {
      io.to(`tournament:${tournament.id}`).emit('tournament:abandoned', {
        tournamentId: tournament.id,
        abandonedBy: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
      });
      io.to(`tournament:${tournament.id}`).emit('tournament:status', {
        tournamentId: tournament.id,
        status: 'ABANDONED',
      });
      io.emit('tournament:abandoned', {
        tournamentId: tournament.id,
        abandonedBy: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
      });
      io.emit('tournament:status', {
        tournamentId: tournament.id,
        status: 'ABANDONED',
      });
    }

    res.status(200).json({ ok: true, tournament });
  } catch (error: any) {
    if (error instanceof ForbiddenError || error.statusCode === 403) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof NotFoundError || error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Error interno al abandonar el torneo.' });
  }
});

/**
 * POST /api/tournaments/lobby/presence
 * Confirms presence of the authenticated user in the lobby (RF-93, RF-94).
 * Broadcasts lobby:updated event with quorum check (RF-96: canStart is true iff count >= 4).
 */
router.post('/lobby/presence', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { tournamentId } = req.body || {};
    const result = await tournamentService.confirmPresence(user, tournamentId);

    const io = getIO(req);
    broadcastLobbyUpdated(io, result.tournament.id, result.participants);

    res.status(200).json({
      tournament: result.tournament,
      participant: result.participant,
      participants: result.participants,
      count: result.count,
      canStart: result.canStart,
    });
  } catch (error: any) {
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al confirmar presencia en el lobby.' });
  }
});

/**
 * DELETE /api/tournaments/lobby/presence
 * Allows the authenticated user to voluntarily cancel their presence in the lobby (RF-95).
 * Broadcasts lobby:updated event.
 */
router.delete('/lobby/presence', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { tournamentId } = req.body || {};
    const result = await tournamentService.cancelPresence(user, tournamentId);

    const io = getIO(req);
    broadcastLobbyUpdated(io, result.tournament.id, result.participants);

    res.status(200).json({
      message: 'Presencia cancelada correctamente.',
      participants: result.participants,
      count: result.count,
      canStart: result.canStart,
    });
  } catch (error: any) {
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al cancelar presencia en el lobby.' });
  }
});

/**
 * DELETE /api/tournaments/lobby/participants/:id
 * Allows an Administrator to expel any participant from the lobby (RF-95).
 * Rejects non-admin users with 403 Forbidden.
 * Broadcasts lobby:updated event.
 */
router.delete('/lobby/participants/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const rawId = req.params.id;
    const participantId = Array.isArray(rawId) ? rawId[0] : rawId;
    const { tournamentId } = req.body || {};

    const result = await tournamentService.removeParticipant(participantId, user, tournamentId);

    const io = getIO(req);
    broadcastLobbyUpdated(io, result.tournament.id, result.participants);

    res.status(200).json({
      message: 'Participante removido del lobby.',
      removedParticipantId: result.removedParticipantId,
      participants: result.participants,
      count: result.count,
      canStart: result.canStart,
    });
  } catch (error: any) {
    if (error instanceof ForbiddenError || error.statusCode === 403) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof NotFoundError || error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al expulsar participante del lobby.' });
  }
});

/**
 * POST /api/tournaments/start-voting
 * Starts format voting with 120s countdown timer and emits vote:started (RF-96, RF-98, RF-99).
 */
router.post('/start-voting', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { tournamentId } = req.body || {};

    const result = await tournamentService.startFormatVoting(user, tournamentId);
    const io = getIO(req);

    cancelLobbyTimer(result.tournament.id);

    // Start 60s countdown session and broadcast vote:started
    const session = startVotingSession(
      io,
      result.tournament.id,
      result.phase,
      result.options,
      result.totalVoters,
      60
    );

    if (io) {
      io.to(`tournament:${result.tournament.id}`).emit('tournament:status', {
        status: 'VOTING_FORMAT',
        tournamentId: result.tournament.id,
      });
    }

    res.status(200).json({
      tournament: result.tournament,
      phase: result.phase,
      options: result.options,
      expiresAt: session.expiresAt,
      totalVoters: result.totalVoters,
    });
  } catch (error: any) {
    if (error instanceof ForbiddenError || error.statusCode === 403) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al iniciar la votación de formato.' });
  }
});

/**
 * POST /api/tournaments/vote
 * Casts a vote in the active voting session (RF-99, RF-100, RF-101, RF-102).
 * Emits vote:updated and closes early if 100% of participants voted (RF-100).
 */
router.post('/vote', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { phase, choice, matchFormat, tournamentId } = req.body || {};

    if (!phase || !choice || typeof choice !== 'string') {
      res.status(400).json({ error: 'Fase y opción elegida son obligatorias.' });
      return;
    }

    const votePhase = phase.toUpperCase() as 'FORMAT' | 'THEME' | 'ASSIGNMENT_METHOD';
    if (votePhase !== 'FORMAT' && votePhase !== 'THEME' && votePhase !== 'ASSIGNMENT_METHOD') {
      res.status(400).json({ error: 'Fase de votación no válida.' });
      return;
    }

    let targetTourneyId = tournamentId;
    if (!targetTourneyId) {
      const activeTourney = await tournamentService.getActiveTournament();
      targetTourneyId = activeTourney?.id;
    }

    if (!targetTourneyId) {
      res.status(400).json({ error: 'No se encontró un torneo activo en votación.' });
      return;
    }

    let session = getActiveVotingSession(targetTourneyId);
    if (!session || session.closed || session.phase !== votePhase) {
      // Auto-reconstruct active voting session if lost in memory or if lobby auto-transitioned
      let tourneyInDb: any = null;
      try {
        tourneyInDb = await prisma.tournament.findUnique({
          where: { id: targetTourneyId },
          include: {
            participants: {
              where: { isPresent: true },
            },
          },
        });
      } catch {
        tourneyInDb = await tournamentService.getActiveTournament();
      }

      // If tournament is in LOBBY with >= 4 participants, auto-transition to VOTING_FORMAT (Item 3)
      if (tourneyInDb && tourneyInDb.status === 'LOBBY' && tourneyInDb.participants.length >= 4) {
        try {
          tourneyInDb = await prisma.tournament.update({
            where: { id: targetTourneyId },
            data: { status: 'VOTING_FORMAT' },
            include: {
              participants: {
                where: { isPresent: true },
              },
            },
          });
        } catch {
          // Gracefully continue
        }
      }

      const isValidStatus =
        tourneyInDb &&
        ((votePhase === 'FORMAT' && (tourneyInDb.status === 'VOTING_FORMAT' || tourneyInDb.status === 'LOBBY')) ||
          (votePhase === 'THEME' && tourneyInDb.status === 'VOTING_THEME') ||
          (votePhase === 'ASSIGNMENT_METHOD' &&
            (tourneyInDb.status === 'VOTING_THEME' || tourneyInDb.status === 'IN_PROGRESS' || tourneyInDb.status === 'VOTING_FORMAT')));

      if (isValidStatus) {
        const io = getIO(req);
        const options =
          votePhase === 'FORMAT'
            ? getFormatVotingOptions(tourneyInDb.participants.length)
            : votePhase === 'THEME'
            ? ['clasicos', 'selecciones', 'champions', 'libertadores']
            : ['DIRECT_DRAW', 'DRAFT_ORDER'];

        session = startVotingSession(
          io,
          targetTourneyId,
          votePhase,
          options,
          tourneyInDb.participants.length,
          60
        );
      } else {
        res.status(400).json({ error: 'La sesión de votación ha finalizado o no es válida.' });
        return;
      }
    }

    // Validate choice is one of the valid options (RF-99), case-insensitive check and allow 'random' (Item 3)
    const cleanChoice = choice.trim().toLowerCase();
    const isChoiceValid =
      cleanChoice === 'random' ||
      session.options.some((opt) => opt.toLowerCase() === cleanChoice);

    if (!isChoiceValid) {
      res.status(400).json({ error: `La opción "${choice}" no es válida para esta votación.` });
      return;
    }

    const normalizedChoice =
      cleanChoice === 'random'
        ? 'random'
        : (session.options.find((opt) => opt.toLowerCase() === cleanChoice) || cleanChoice);

    const voteResult = await tournamentService.castVote(
      user,
      votePhase,
      normalizedChoice,
      matchFormat,
      targetTourneyId
    );

    const io = getIO(req);
    broadcastVoteUpdated(io, targetTourneyId, votePhase, voteResult.votesCast, session.totalVoters);

    // RF-100 condition 2: Close early if 100% of participants voted
    if (voteResult.votesCast >= session.totalVoters) {
      const endedResult = await closeVotingSession(io, targetTourneyId, 'ALL_VOTED');
      res.status(200).json({
        success: true,
        votesCast: voteResult.votesCast,
        totalVoters: session.totalVoters,
        closedEarly: true,
        result: endedResult,
      });
      return;
    }

    res.status(200).json({
      success: true,
      votesCast: voteResult.votesCast,
      totalVoters: session.totalVoters,
      closedEarly: false,
    });
  } catch (error: any) {
    if (error instanceof ForbiddenError || error.statusCode === 403) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al registrar el voto.' });
  }
});

/**
 * POST /api/tournaments/close-voting
 * Idempotently closes active voting session on countdown expiration (T29 fallback).
 */
router.post('/close-voting', async (req: Request, res: Response) => {
  try {
    const { tournamentId } = req.body || {};
    let targetTourneyId = tournamentId;
    if (!targetTourneyId) {
      const active = await tournamentService.getActiveTournament();
      targetTourneyId = active?.id;
    }

    if (!targetTourneyId) {
      res.status(200).json({ ok: true, message: 'No hay torneo activo para cerrar votación.' });
      return;
    }

    const io = getIO(req);
    const session = getActiveVotingSession(targetTourneyId);
    if (!session || session.closed) {
      res.status(200).json({ ok: true, message: 'La sesión de votación ya está cerrada.' });
      return;
    }

    const result = await closeVotingSession(io, targetTourneyId, 'TIMEOUT');
    res.status(200).json({
      ok: true,
      message: 'Votación cerrada exitosamente.',
      result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al cerrar la sesión de votación.' });
  }
});

/**
 * POST /api/tournaments/start-voting
 * Initiates or returns an active 60s voting session (FORMAT, THEME or ASSIGNMENT_METHOD) (T33).
 */
router.post('/start-voting', async (req: Request, res: Response) => {
  try {
    const { tournamentId, phase = 'ASSIGNMENT_METHOD' } = req.body || {};
    let targetTourneyId = tournamentId;
    if (!targetTourneyId) {
      const active = await tournamentService.getActiveTournament();
      targetTourneyId = active?.id;
    }

    if (!targetTourneyId) {
      res.status(400).json({ error: 'No se encontró un torneo activo para iniciar votación.' });
      return;
    }

    const io = getIO(req);
    let session = getActiveVotingSession(targetTourneyId);
    if (!session || session.closed || session.phase !== phase) {
      const tourney = await prisma.tournament.findUnique({
        where: { id: targetTourneyId },
        include: {
          participants: {
            where: { isPresent: true },
          },
        },
      });

      if (!tourney) {
        res.status(404).json({ error: 'Torneo no encontrado.' });
        return;
      }

      const options =
        phase === 'FORMAT'
          ? getFormatVotingOptions(tourney.participants.length)
          : phase === 'THEME'
          ? ['clasicos', 'selecciones', 'champions', 'libertadores']
          : ['DIRECT_DRAW', 'DRAFT_ORDER'];

      session = startVotingSession(
        io,
        targetTourneyId,
        phase,
        options,
        tourney.participants.length,
        60
      );
    }

    res.status(200).json({
      ok: true,
      session: {
        phase: session.phase,
        options: session.options,
        expiresAt: session.expiresAt,
        totalVoters: session.totalVoters,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al iniciar la sesión de votación.' });
  }
});

/**
 * POST /api/tournaments/draft/pick
 * Allows a participant to choose an available team during their turn (T33).
 */
router.post('/draft/pick', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { tournamentId, participantId, teamName } = req.body || {};
    let targetTourneyId = tournamentId;
    if (!targetTourneyId) {
      const active = await tournamentService.getActiveTournament();
      targetTourneyId = active?.id;
    }

    if (!targetTourneyId || !participantId || !teamName) {
      res.status(400).json({ error: 'tournamentId, participantId y teamName son requeridos.' });
      return;
    }

    // Validate that user is either this participant or admin
    await tournamentService.validateUserIsParticipantOrAdmin(user, targetTourneyId);

    const io = getIO(req);
    const result = await handleDraftPick(io, targetTourneyId, participantId, teamName);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(200).json({
      ok: true,
      session: result.session,
    });
  } catch (error: any) {
    if (error instanceof ForbiddenError || error.statusCode === 403) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof NotFoundError || error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Error al elegir equipo en el draft.' });
  }
});

/**
 * GET /api/tournaments/teams
 * Previews available teams for a theme (RF-103).
 */
router.get('/teams', async (req: Request, res: Response) => {
  try {
    const theme = req.query.theme as string | undefined;
    const tournamentId = req.query.tournamentId as string | undefined;

    const result = await tournamentService.getThemeTeams(theme, tournamentId);
    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al consultar equipos de la temática.' });
  }
});

/**
 * POST /api/tournaments/teams
 * Allows an Administrator to preload/update teams for a theme (RF-103).
 */
router.post('/teams', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { theme, teams } = req.body || {};

    if (!theme || !Array.isArray(teams)) {
      res.status(400).json({ error: 'Temática y listado de equipos son obligatorios.' });
      return;
    }

    const result = await tournamentService.saveThemeTeams(user, theme, teams);
    res.status(200).json({
      message: 'Equipos precargados exitosamente.',
      ...result,
    });
  } catch (error: any) {
    if (error instanceof ForbiddenError || error.statusCode === 403) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al precargar equipos por temática.' });
  }
});

/**
 * POST /api/tournaments/theme
 * Sets or updates the theme for an active tournament.
 */
router.post('/theme', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { theme, tournamentId } = req.body || {};

    const updated = await tournamentService.setTournamentTheme(user, theme, tournamentId);
    res.status(200).json({
      message: 'Temática configurada exitosamente.',
      tournament: updated,
    });
  } catch (error: any) {
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al configurar temática.' });
  }
});

/**
 * POST /api/tournaments/draw-teams
 * Executes synchronized team draw and broadcasts draw:animated (RF-103, RF-104, T31).
 */
router.post('/draw-teams', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { tournamentId, customTeams, intervalMs, assignmentMethod = 'DIRECT_DRAW' } = req.body || {};
    const io = getIO(req);

    const result = await tournamentService.executeTeamDraw(
      user,
      io,
      tournamentId,
      customTeams,
      intervalMs,
      assignmentMethod
    );

    res.status(200).json({
      message: 'Sorteo de equipos iniciado.',
      tournamentId: result.tournament.id,
      plan: result.plan,
    });
  } catch (error: any) {
    if (error instanceof ForbiddenError || error.statusCode === 403) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof NotFoundError || error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('[draw-teams error]:', error);
    res.status(500).json({ error: error.message || 'Error interno al ejecutar el sorteo de equipos.' });
  }
});

/**
 * POST /api/tournaments/advance-phase
 * Advances the tournament phase (e.g. from VOTING_FORMAT to VOTING_THEME).
 * Usable by any confirmed participant or ADMIN (T32: Autonomía total).
 */
router.post('/advance-phase', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { tournamentId, targetStatus = TournamentStatus.VOTING_THEME } = req.body || {};
    const io = getIO(req);

    const tournament = await tournamentService.advancePhase(user, tournamentId, targetStatus, io);

    res.status(200).json({
      ok: true,
      status: tournament.status,
      tournament,
    });
  } catch (error: any) {
    if (error instanceof ForbiddenError || error.statusCode === 403) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof NotFoundError || error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('[advance-phase error]:', error);
    res.status(500).json({ error: error.message || 'Error interno al avanzar de fase.' });
  }
});

/**
 * POST /api/tournaments/fixture
 * Generates and persists the relational fixture with auto-liquidated Byes (RF-113, RNF-2).
 * Emits fixture:ready via WebSockets.
 */
router.post('/fixture', async (req: Request, res: Response) => {
  try {
    const { tournamentId } = req.body || {};
    let targetTourneyId = tournamentId;

    if (!targetTourneyId) {
      const active = await tournamentService.getActiveTournament();
      targetTourneyId = active?.id;
    }

    if (!targetTourneyId) {
      res.status(400).json({ error: 'No se encontró un torneo activo para generar fixture.' });
      return;
    }

    const user = req.user!;
    await tournamentService.validateUserIsParticipantOrAdmin(user, targetTourneyId);

    const io = getIO(req);
    const result = await tournamentService.generateRelationalFixture(targetTourneyId, io);

    res.status(200).json({
      message: 'Fixture generado exitosamente.',
      tournament: result.tournament,
      matches: result.matches,
      byesCount: result.byesCount,
      totalMatches: result.totalMatches,
    });
  } catch (error: any) {
    if (error instanceof ForbiddenError || error.statusCode === 403) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof NotFoundError || error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Error interno al generar fixture.' });
  }
});

/**
 * POST /api/tournaments/participants/:id/walkover
 * Declares walkover (abandonment) for a participant (RF-116, RF-117).
 * Restricts to the participant themselves (auto-declaration) or ADMIN (administrative).
 * Overwrites all matches to 0-3 defeats, sets status to CLOSED without handshake,
 * frees up opponents, and broadcasts walkover:applied via WebSockets.
 */
router.post('/participants/:id/walkover', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const io = getIO(req);

    const result = await tournamentService.applyWalkover(id, user, io);

    res.status(200).json({
      message: 'Abandono (Walkover) registrado exitosamente.',
      tournament: result.tournament,
      participant: result.participant,
      matches: result.matches,
      standings: result.standings,
      unblockedParticipants: result.unblockedParticipants,
    });
  } catch (error: any) {
    if (error instanceof NotFoundError || error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof ForbiddenError || error.statusCode === 403) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('[walkover error]:', error);
    res.status(500).json({ error: error.message || 'Error interno al registrar walkover.' });
  }
});

export default router;

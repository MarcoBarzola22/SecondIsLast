import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { whitelistMiddleware } from '../middleware/whitelistMiddleware.js';
import {
  matchService,
  ConflictError,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../services/matchService.js';
import { getSocketServer } from '../sockets/index.js';

const router = Router();

// Enforce authentication and whitelist membership on all match endpoints (RNF-4, RF-89)
router.use(authMiddleware);
router.use(whitelistMiddleware);

function getIO(req: Request) {
  return req.app.get('io') || getSocketServer();
}

/**
 * GET /api/matches/:id
 * Retrieves a match with its participant and player details.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const matchId = String(req.params.id);
    const match = await matchService.getMatchById(matchId);
    if (!match) {
      res.status(404).json({ error: 'Partido no encontrado.' });
      return;
    }
    res.status(200).json({ match });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener el partido.' });
  }
});

/**
 * POST /api/matches/:id/submit
 * Submits a match result exclusively by the Home participant (RF-105, RF-106, RF-107).
 * Validates sequential lock (RF-114), OCC expectedVersion (RF-109), and emits match:submitted.
 */
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const matchId = String(req.params.id);
    const user = req.user!;
    const io = getIO(req);
    const {
      homeScore,
      awayScore,
      homeYellowCards = 0,
      awayYellowCards = 0,
      homeRedCards = 0,
      awayRedCards = 0,
      penaltiesWinnerId = null,
      expectedVersion,
    } = req.body || {};

    if (expectedVersion === undefined || expectedVersion === null) {
      res.status(400).json({
        error: 'Falta expectedVersion para el control de concurrencia optimista.',
      });
      return;
    }

    if (homeScore === undefined || awayScore === undefined) {
      res.status(400).json({
        error: 'homeScore y awayScore son obligatorios.',
      });
      return;
    }

    const updatedMatch = await matchService.submitMatch(
      matchId,
      user,
      {
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
        homeYellowCards: Number(homeYellowCards),
        awayYellowCards: Number(awayYellowCards),
        homeRedCards: Number(homeRedCards),
        awayRedCards: Number(awayRedCards),
        penaltiesWinnerId,
        expectedVersion: Number(expectedVersion),
      },
      io
    );

    res.status(200).json({ match: updatedMatch });
  } catch (error: any) {
    if (error instanceof ConflictError || error.statusCode === 409) {
      res.status(409).json({ error: error.message });
      return;
    }
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
    res.status(500).json({
      error: error.message || 'Error interno al cargar el resultado del partido.',
    });
  }
});

/**
 * POST /api/matches/:id/confirm
 * Confirms a match result proposal exclusively by the Away participant (RF-108, RF-109, RF-110, RF-112).
 * Verifies expectedVersion OCC (409 on mismatch), transitions to CLOSED in a Prisma transaction,
 * recalculates standings/bracket advancement, and broadcasts match:closed.
 */
router.post('/:id/confirm', async (req: Request, res: Response) => {
  try {
    const matchId = String(req.params.id);
    const user = req.user!;
    const io = getIO(req);
    const { expectedVersion } = req.body || {};

    if (expectedVersion === undefined || expectedVersion === null) {
      res.status(400).json({
        error: 'Falta expectedVersion para el control de concurrencia optimista.',
      });
      return;
    }

    const result = await matchService.confirmMatch(
      matchId,
      user,
      Number(expectedVersion),
      io
    );

    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof ConflictError || error.statusCode === 409) {
      res.status(409).json({ error: error.message });
      return;
    }
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
    res.status(500).json({
      error: error.message || 'Error interno al confirmar el resultado del partido.',
    });
  }
});

/**
 * POST /api/matches/:id/reject
 * Rejects a match result proposal exclusively by the Away participant (RF-108, RF-109, RF-111, RF-112).
 * Verifies expectedVersion OCC (409 on mismatch), reverts to PENDING_SUBMISSION,
 * increments version, and broadcasts match:rejected.
 */
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const matchId = String(req.params.id);
    const user = req.user!;
    const io = getIO(req);
    const { expectedVersion } = req.body || {};

    if (expectedVersion === undefined || expectedVersion === null) {
      res.status(400).json({
        error: 'Falta expectedVersion para el control de concurrencia optimista.',
      });
      return;
    }

    const updatedMatch = await matchService.rejectMatch(
      matchId,
      user,
      Number(expectedVersion),
      io
    );

    res.status(200).json({ match: updatedMatch });
  } catch (error: any) {
    if (error instanceof ConflictError || error.statusCode === 409) {
      res.status(409).json({ error: error.message });
      return;
    }
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
    res.status(500).json({
      error: error.message || 'Error interno al rechazar el resultado del partido.',
    });
  }
});

export default router;

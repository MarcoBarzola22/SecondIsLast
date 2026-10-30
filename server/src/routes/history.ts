import { Router, Request, Response } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/authMiddleware.js';
import { whitelistMiddleware } from '../middleware/whitelistMiddleware.js';
import { historyService } from '../services/historyService.js';
import { getSocketServer } from '../sockets/index.js';
import { BadRequestError, NotFoundError } from '../errors.js';

const router = Router();

// Enforce authentication and whitelist membership (RNF-4, RF-89)
router.use(authMiddleware);
router.use(whitelistMiddleware);

function getIO(req: Request) {
  return req.app.get('io') || getSocketServer();
}

/**
 * GET /api/history/players
 * Retrieves all registered players from PostgreSQL (T47).
 */
router.get('/players', async (_req: Request, res: Response) => {
  try {
    const players = await historyService.getAllPlayers();
    res.status(200).json({ players });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener jugadores.' });
  }
});

/**
 * GET /api/history/profiles/:playerId
 * Retrieves full career profile and statistics for a given player (T47).
 */
router.get('/profiles/:playerId', async (req: Request, res: Response) => {
  try {
    const playerId = Array.isArray(req.params.playerId) ? req.params.playerId[0] : (req.params.playerId as string);
    const profile = await historyService.getPlayerProfile(playerId);
    res.status(200).json(profile);
  } catch (error: any) {
    if (error instanceof NotFoundError || error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Error al obtener perfil del jugador.' });
  }
});

/**
 * DELETE /api/history/reset
 * Resets all historical stats and completed tournaments (Admin only, T47).
 */
router.delete('/reset', requireAdmin, async (_req: Request, res: Response) => {
  try {
    await historyService.resetHistory();
    res.status(200).json({ message: 'Historial reseteado exitosamente.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al resetear el historial.' });
  }
});

/**
 * GET /api/history/stats
 * Retrieves all historical cumulative stats from PostgreSQL (RF-34, RF-110).
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await historyService.getHistoricalStats();
    res.status(200).json({ stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener estadísticas históricas.' });
  }
});

/**
 * GET /api/history/annual
 * Retrieves annual ranking entries for a given year, all years, or current year (RF-78, RF-110, T47).
 */
router.get('/annual', async (req: Request, res: Response) => {
  try {
    const yearQuery = req.query.year;
    if (yearQuery === 'all' || yearQuery === 'historico') {
      const allTimeRanking = await historyService.getAllTimeAnnualRanking();
      res.status(200).json({ year: 'all', entries: allTimeRanking, ranking: allTimeRanking });
      return;
    }

    const yearParam = yearQuery ? parseInt(yearQuery as string, 10) : undefined;
    const targetYear = yearParam ?? new Date().getFullYear();
    const ranking = await historyService.getAnnualRanking(yearParam);
    res.status(200).json({ year: targetYear, entries: ranking, ranking });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener el ranking anual.' });
  }
});

/**
 * GET /api/history/h2h
 * Retrieves Head-to-Head records (RF-76, RF-110).
 */
router.get('/h2h', async (req: Request, res: Response) => {
  try {
    const { playerA, playerB } = req.query;
    const records = await historyService.getHeadToHead(
      typeof playerA === 'string' ? playerA : undefined,
      typeof playerB === 'string' ? playerB : undefined
    );
    res.status(200).json({ records, h2h: records });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al consultar historial Head-to-Head.' });
  }
});

/**
 * GET /api/history/tournaments
 * Retrieves list of completed tournaments with podium and winner (Principle 5).
 */
router.get('/tournaments', async (_req: Request, res: Response) => {
  try {
    const tournaments = await historyService.getCompletedTournaments();
    res.status(200).json({ tournaments });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener torneos finalizados.' });
  }
});

/**
 * POST /api/history/tournaments/:id/finish
 * Finalizes the tournament, updates PostgreSQL HistoricalStats, H2H, and AnnualRanking,
 * and emits tournament:finished via WebSockets (RF-110).
 */
router.post('/tournaments/:id/finish', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const io = getIO(req);

    const result = await historyService.finalizeTournament(id, io);

    res.status(200).json({
      message: 'Torneo finalizado exitosamente.',
      tournament: result.tournament,
      podium: result.podium,
      pointsDistribution: result.pointsDistribution,
    });
  } catch (error: any) {
    if (error instanceof NotFoundError || error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Error al finalizar el torneo.' });
  }
});

export default router;

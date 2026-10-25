import { Router, Request, Response } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/authMiddleware.js';
import { whitelistMiddleware } from '../middleware/whitelistMiddleware.js';
import { migrationService } from '../services/migrationService.js';

const router = Router();

// All admin routes strictly require authentication, whitelist membership, and ADMIN role
router.use(authMiddleware);
router.use(whitelistMiddleware);
router.use(requireAdmin);

/**
 * POST /api/admin/migrate-local-data
 * Receives AppData JSON (schemaVersion: 2) and idempotently migrates
 * Player, HistoricalStats, HeadToHeadRecord, and AnnualRankingEntry to PostgreSQL.
 */
router.post('/migrate-local-data', async (req: Request, res: Response) => {
  try {
    const rawPayload = req.body?.appData || req.body;
    const result = await migrationService.migrateLocalData(rawPayload);
    res.status(200).json(result);
  } catch (error: any) {
    const statusCode = error.statusCode || 400;
    res.status(statusCode).json({
      error: error.message || 'Error al ejecutar la migración de datos locales.',
    });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { whitelistMiddleware } from '../middleware/whitelistMiddleware.js';
import { OFFICIAL_HOUSE_RULES } from '../domain/houseRules.js';

const router = Router();

// Enforce authentication and whitelist membership (RNF-4, RF-89, RF-118)
router.use(authMiddleware);
router.use(whitelistMiddleware);

/**
 * GET /api/rules
 * Retrieves the official house rules consensuated by the group (RF-118).
 * Read-only static document in Rioplatense Spanish.
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    document: OFFICIAL_HOUSE_RULES,
    rules: OFFICIAL_HOUSE_RULES.rules,
  });
});

export default router;

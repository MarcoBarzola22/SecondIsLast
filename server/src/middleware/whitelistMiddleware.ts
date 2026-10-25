import { Request, Response, NextFunction } from 'express';
import { whitelistService } from '../services/whitelistService.js';

/**
 * Whitelist verification middleware implementing RF-89.
 * Denies access with HTTP 403 and exact Rioplatense message if user email is not whitelisted.
 */
export async function whitelistMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const email = req.user?.email;

  if (!email) {
    res.status(401).json({ error: 'No autorizado. Iniciá sesión para continuar.' });
    return;
  }

  const isWhitelisted = await whitelistService.isEmailWhitelisted(email);

  if (!isWhitelisted) {
    res.status(403).json({
      error: 'No estás en la lista blanca de la juntada. Pedile al admin que te habilite',
    });
    return;
  }

  next();
}

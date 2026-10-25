import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { whitelistService } from '../services/whitelistService.js';
import { authMiddleware, requireAdmin } from '../middleware/authMiddleware.js';
import { whitelistMiddleware } from '../middleware/whitelistMiddleware.js';

const router = Router();

// All whitelist management routes require authentication, whitelist membership, and ADMIN role
router.use(authMiddleware);
router.use(whitelistMiddleware);
router.use(requireAdmin);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/whitelist - List all whitelist entries
router.get('/', async (_req: Request, res: Response) => {
  try {
    const entries = await whitelistService.listEntries();
    res.status(200).json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Error interno al consultar la lista blanca.' });
  }
});

// POST /api/whitelist - Add new email to whitelist
router.post('/', async (req: Request, res: Response) => {
  const { email, role, playerId } = req.body;

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    res.status(400).json({ error: 'El correo electrónico proporcionado no es válido.' });
    return;
  }

  const assignedRole = role === Role.ADMIN ? Role.ADMIN : Role.PLAYER;

  try {
    const entry = await whitelistService.addEntry({
      email: email.trim().toLowerCase(),
      role: assignedRole,
      playerId: playerId || null,
    });
    res.status(201).json(entry);
  } catch (error: any) {
    if (error.message?.includes('ya está registrado')) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al agregar el correo a la lista blanca.' });
  }
});

// DELETE /api/whitelist/:id - Remove email from whitelist
router.delete('/:id', async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id) {
    res.status(400).json({ error: 'ID de entrada de lista blanca requerido.' });
    return;
  }

  try {
    const deleted = await whitelistService.removeEntry(id);
    res.status(200).json({
      message: 'Correo eliminado de la lista blanca exitosamente.',
      deleted,
    });
  } catch (error: any) {
    if (error.message?.includes('no existe')) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno al eliminar el correo de la lista blanca.' });
  }
});

export default router;

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../config/env.js';
import { AuthUser } from '../types/auth.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;

  // 1. Check Bearer Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. Check cookies
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    res.status(401).json({ error: 'No autorizado. Iniciá sesión para continuar.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a iniciar sesión.' });
  }
}

export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = decoded;
  } catch {
    // Continue silently without authenticated user
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== Role.ADMIN) {
    res.status(403).json({ error: 'Acceso restringido. Solo los administradores pueden realizar esta acción.' });
    return;
  }
  next();
}

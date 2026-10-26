import { Router, Request, Response, CookieOptions } from 'express';
import { config } from '../config/env.js';
import { getGoogleAuthUrl, getGoogleUserFromCode } from '../auth/google.js';
import { userService } from '../services/userService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { whitelistMiddleware } from '../middleware/whitelistMiddleware.js';

const router = Router();

export const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

// GET /api/auth/google - Initiate Google OAuth 2.0 flow (RF-88)
router.get('/google', (_req: Request, res: Response) => {
  const url = getGoogleAuthUrl();
  res.redirect(url);
});

// GET /api/auth/google/callback - Handle Google OAuth callback & set httpOnly cookie (RF-88, RF-89)
router.get('/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;

  if (!code) {
    res.status(400).json({ error: 'Código de autorización no provisto por Google.' });
    return;
  }

  try {
    const googleUser = await getGoogleUserFromCode(code);
    const { user, token } = await userService.authenticateWithWhitelist({
      email: googleUser.email,
      name: googleUser.name,
      googleId: googleUser.sub,
    });

    res.cookie('token', token, COOKIE_OPTIONS);

    // If client expects JSON response (e.g., in integration tests)
    if (req.headers.accept?.includes('application/json')) {
      res.status(200).json({ user, token });
      return;
    }

    res.redirect(config.frontendUrl);
  } catch (error: any) {
    if (error.message?.includes('No estás en la lista blanca')) {
      if (req.headers.accept?.includes('application/json')) {
        res.status(403).json({ error: error.message });
        return;
      }
      res.redirect(`${config.frontendUrl}/login?error=${encodeURIComponent(error.message)}`);
      return;
    }
    res.status(500).json({ error: error.message || 'Error en autenticación con Google.' });
  }
});

// GET /api/auth/me - Return authenticated user profile (RF-88, RF-89)
router.get('/me', authMiddleware, whitelistMiddleware, async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado. Iniciá sesión para continuar.' });
    return;
  }

  try {
    const freshUser = await userService.findById(req.user.id);
    if (!freshUser) {
      res.status(200).json(req.user);
      return;
    }
    res.status(200).json(freshUser);
  } catch {
    res.status(200).json(req.user);
  }
});

// POST /api/auth/logout - Invalidate session by clearing httpOnly cookie
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
});

// GET /api/auth/dev-login - Development login via query param (?email=...)
router.get('/dev-login', async (req: Request, res: Response) => {
  if (config.nodeEnv !== 'development' && config.nodeEnv !== 'test') {
    res.status(404).json({ error: 'Ruta de desarrollo no disponible en producción.' });
    return;
  }

  const email = (req.query.email as string) || '';
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !EMAIL_REGEX.test(email.trim())) {
    res.status(400).json({ error: 'El correo electrónico proporcionado no es válido.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const namePrefix = normalizedEmail.split('@')[0];
    const derivedName = namePrefix.charAt(0).toUpperCase() + namePrefix.slice(1);

    const { user, token } = await userService.authenticateWithWhitelist({
      email: normalizedEmail,
      name: `Jugador ${derivedName}`,
      googleId: `dev-login-${normalizedEmail}`,
    });

    res.cookie('token', token, COOKIE_OPTIONS);

    if (req.headers.accept?.includes('application/json')) {
      res.status(200).json({ user, token });
      return;
    }

    res.redirect(config.frontendUrl);
  } catch (error: any) {
    if (error.message?.includes('No estás en la lista blanca')) {
      if (req.headers.accept?.includes('application/json')) {
        res.status(403).json({ error: error.message });
        return;
      }
      res.redirect(`${config.frontendUrl}?error=${encodeURIComponent(error.message)}`);
      return;
    }
    res.status(500).json({ error: 'Error interno en inicio de sesión de desarrollo.' });
  }
});

// POST /api/auth/dev-login - Development & testing multi-user login (RF-89 enforced)
router.post('/dev-login', async (req: Request, res: Response) => {
  if (config.nodeEnv !== 'development' && config.nodeEnv !== 'test') {
    res.status(404).json({ error: 'Ruta de desarrollo no disponible en producción.' });
    return;
  }

  const { email } = req.body;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    res.status(400).json({ error: 'El correo electrónico proporcionado no es válido.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const namePrefix = normalizedEmail.split('@')[0];
    const derivedName = namePrefix.charAt(0).toUpperCase() + namePrefix.slice(1);

    const { user, token } = await userService.authenticateWithWhitelist({
      email: normalizedEmail,
      name: `Jugador ${derivedName}`,
      googleId: `dev-login-${normalizedEmail}`,
    });

    res.cookie('token', token, COOKIE_OPTIONS);
    res.status(200).json({ user, token });
  } catch (error: any) {
    if (error.message?.includes('No estás en la lista blanca')) {
      res.status(403).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno en inicio de sesión de desarrollo.' });
  }
});

export default router;

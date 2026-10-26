import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../app.js';
import { config } from '../config/env.js';
import * as googleAuth from '../auth/google.js';
import { userService } from '../services/userService.js';
import { whitelistService } from '../services/whitelistService.js';

describe('Auth Integration Tests (RF-88, RNF-4)', () => {
  let app: ReturnType<typeof createApp>;

  const mockWhitelistedUser = {
    id: 'user-whitelisted-1',
    email: 'messi@secondislast.com',
    name: 'Lionel Messi',
    role: Role.PLAYER,
    playerId: 'player-messi',
    googleId: 'google-sub-10',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  describe('GET /api/auth/google', () => {
    it('should redirect to Google OAuth consent screen with proper params', async () => {
      const res = await request(app).get('/api/auth/google');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(res.headers.location).toContain(`client_id=${config.googleClientId}`);
      expect(res.headers.location).toContain(encodeURIComponent(config.googleCallbackUrl));
    });
  });

  describe('GET /api/auth/google/callback', () => {
    it('should return 400 if code is missing', async () => {
      const res = await request(app).get('/api/auth/google/callback');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Código de autorización no provisto');
    });

    it('should authenticate whitelisted user, set httpOnly cookie, and redirect to frontend', async () => {
      vi.spyOn(googleAuth, 'getGoogleUserFromCode').mockResolvedValue({
        sub: 'google-sub-10',
        email: 'messi@secondislast.com',
        name: 'Lionel Messi',
      });

      vi.spyOn(userService, 'authenticateWithWhitelist').mockResolvedValue({
        user: mockWhitelistedUser as any,
        token: 'mock-jwt-token-for-messi',
      });

      const res = await request(app).get('/api/auth/google/callback?code=valid-oauth-code');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(config.frontendUrl);

      // Verify httpOnly cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('token=mock-jwt-token-for-messi');
      expect(cookies[0]).toContain('HttpOnly');
    });

    it('should return 403 or redirect with error when email is not in whitelist', async () => {
      vi.spyOn(googleAuth, 'getGoogleUserFromCode').mockResolvedValue({
        sub: 'google-sub-outsider',
        email: 'desconocido@segundoesultimo.com',
        name: 'Desconocido',
      });

      vi.spyOn(userService, 'authenticateWithWhitelist').mockRejectedValue(
        new Error('No estás en la lista blanca de la juntada. Pedile al admin que te habilite')
      );

      const res = await request(app)
        .get('/api/auth/google/callback?code=valid-oauth-code')
        .set('Accept', 'application/json');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe(
        'No estás en la lista blanca de la juntada. Pedile al admin que te habilite'
      );
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('POST /api/auth/dev-login', () => {
    it('should login whitelisted user, return 200, and set httpOnly cookie in development/test', async () => {
      vi.spyOn(whitelistService, 'getByEmail').mockResolvedValue({
        id: 'wl-1',
        email: 'maradona@secondislast.com',
        role: Role.ADMIN,
        playerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(userService, 'authenticateWithWhitelist').mockResolvedValue({
        user: {
          id: 'user-diego',
          email: 'maradona@secondislast.com',
          name: 'Jugador Maradona',
          role: Role.ADMIN,
          playerId: null,
          googleId: 'dev-login-maradona@secondislast.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        token: 'jwt-diego-token',
      });

      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({ email: 'maradona@secondislast.com' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('maradona@secondislast.com');
      expect(res.body.token).toBe('jwt-diego-token');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('token=jwt-diego-token');
      expect(cookies[0]).toContain('HttpOnly');
    });

    it('should reject dev-login if user email is not in whitelist (RF-89)', async () => {
      vi.spyOn(userService, 'authenticateWithWhitelist').mockRejectedValue(
        new Error('No estás en la lista blanca de la juntada. Pedile al admin que te habilite')
      );

      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({ email: 'no-invitado@example.com' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe(
        'No estás en la lista blanca de la juntada. Pedile al admin que te habilite'
      );
    });

    it('should reject dev-login with 400 if email is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({ email: 'email_invalido' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('no es válido');
    });

    it('should return 404 for dev-login if running in production', async () => {
      const originalEnv = config.nodeEnv;
      (config as any).nodeEnv = 'production';

      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({ email: 'admin@secondislast.com' });

      expect(res.status).toBe(404);
      (config as any).nodeEnv = originalEnv;
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 200 with user null without noisy 401 when no token is present', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });

    it('should return user profile when authenticated via cookie', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      vi.spyOn(userService, 'findById').mockResolvedValue(mockWhitelistedUser as any);

      const token = userService.signUserToken(mockWhitelistedUser as any);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`token=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(mockWhitelistedUser.email);
      expect(res.body.name).toBe(mockWhitelistedUser.name);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear the token cookie and return success message', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('cerrada exitosamente');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      // Clearing cookie sets it to empty or expired date
      expect(cookies[0]).toMatch(/token=;.*(Expires=|Max-Age=0)/);
    });
  });

  describe('RF-90: Historical Player Profile Linking', () => {
    it('should link user to existing historical Player when whitelist entry has playerId', async () => {
      const mockPlayer = {
        id: 'player-historical-1',
        firstName: 'Diego',
        lastName: 'Maradona',
      };

      vi.spyOn(whitelistService, 'getByEmail').mockResolvedValue({
        id: 'wl-maradona',
        email: 'diego@secondislast.com',
        role: Role.PLAYER,
        playerId: 'player-historical-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: 'user-diego-1',
            email: 'diego@secondislast.com',
            name: 'Diego Armando',
            googleId: 'google-sub-diego',
            role: Role.PLAYER,
            playerId: 'player-historical-1',
            player: mockPlayer,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      };

      const customUserService = new (userService.constructor as any)(mockPrisma);
      const { user, token } = await customUserService.authenticateWithWhitelist({
        email: 'diego@secondislast.com',
        name: 'Diego Armando',
        googleId: 'google-sub-diego',
      });

      expect(user.playerId).toBe('player-historical-1');
      expect(user.player).toEqual(mockPlayer);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          playerId: 'player-historical-1',
        }),
        include: { player: true },
      });
      expect(token).toBeDefined();
    });
  });
});

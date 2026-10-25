import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { createApp } from '../app.js';
import { config } from '../config/env.js';
import { whitelistService } from '../services/whitelistService.js';

describe('Whitelist & Auth Middlewares Integration Tests (RF-89, RF-91, RNF-4)', () => {
  let app: ReturnType<typeof createApp>;

  const adminUser = {
    id: 'user-admin',
    email: 'admin@secondislast.com',
    role: Role.ADMIN,
    playerId: null,
  };

  const playerWhitelisted = {
    id: 'user-player',
    email: 'player@secondislast.com',
    role: Role.PLAYER,
    playerId: null,
  };

  const playerNotWhitelisted = {
    id: 'user-outsider',
    email: 'outsider@secondislast.com',
    role: Role.PLAYER,
    playerId: null,
  };

  const createToken = (payload: object) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  describe('RF-89: Whitelist Middleware & 403 Response', () => {
    it('should reject with 401 if no authentication token is provided', async () => {
      const res = await request(app).get('/api/whitelist');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject with 403 and the exact rioplatense message when email is not in whitelist', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(false);

      const token = createToken(playerNotWhitelisted);
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: 'No estás en la lista blanca de la juntada. Pedile al admin que te habilite',
      });
    });

    it('should allow access when user is whitelisted', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);

      const token = createToken(playerWhitelisted);
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(playerWhitelisted.email);
    });
  });

  describe('RF-91: Admin Whitelist Management Endpoints', () => {
    it('should deny non-admin users from listing or managing whitelist', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);

      const token = createToken(playerWhitelisted);

      const getRes = await request(app)
        .get('/api/whitelist')
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.status).toBe(403);

      const postRes = await request(app)
        .post('/api/whitelist')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'new@secondislast.com' });
      expect(postRes.status).toBe(403);

      const deleteRes = await request(app)
        .delete('/api/whitelist/entry-1')
        .set('Authorization', `Bearer ${token}`);
      expect(deleteRes.status).toBe(403);
    });

    it('GET /api/whitelist should return the whitelist entries for admin', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          email: 'admin@secondislast.com',
          role: Role.ADMIN,
          playerId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'entry-2',
          email: 'player@secondislast.com',
          role: Role.PLAYER,
          playerId: 'player-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      vi.spyOn(whitelistService, 'listEntries').mockResolvedValue(mockEntries as any);

      const token = createToken(adminUser);
      const res = await request(app)
        .get('/api/whitelist')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].email).toBe('admin@secondislast.com');
    });

    it('POST /api/whitelist should add a new email and return 201', async () => {
      const newEntry = {
        id: 'entry-new',
        email: 'nuevo@secondislast.com',
        role: Role.PLAYER,
        playerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      vi.spyOn(whitelistService, 'addEntry').mockResolvedValue(newEntry as any);

      const token = createToken(adminUser);
      const res = await request(app)
        .post('/api/whitelist')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: '  Nuevo@SecondIsLast.com  ', role: Role.PLAYER });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('nuevo@secondislast.com');
      expect(whitelistService.addEntry).toHaveBeenCalledWith({
        email: 'nuevo@secondislast.com',
        role: Role.PLAYER,
        playerId: null,
      });
    });

    it('POST /api/whitelist should reject invalid emails with 400', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);

      const token = createToken(adminUser);
      const res = await request(app)
        .post('/api/whitelist')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'email-invalido-sin-arroba' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/whitelist should return 409 if email already exists', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      vi.spyOn(whitelistService, 'addEntry').mockRejectedValue(
        new Error('Este correo ya está registrado en la lista blanca.')
      );

      const token = createToken(adminUser);
      const res = await request(app)
        .post('/api/whitelist')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'repetido@secondislast.com' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('ya está registrado');
    });

    it('DELETE /api/whitelist/:id should remove an entry', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      vi.spyOn(whitelistService, 'removeEntry').mockResolvedValue({
        id: 'entry-1',
        email: 'borrar@secondislast.com',
        role: Role.PLAYER,
        playerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = createToken(adminUser);
      const res = await request(app)
        .delete('/api/whitelist/entry-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(whitelistService.removeEntry).toHaveBeenCalledWith('entry-1');
    });

    it('DELETE /api/whitelist/:id should return 404 if entry does not exist', async () => {
      vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
      vi.spyOn(whitelistService, 'removeEntry').mockRejectedValue(
        new Error('La entrada de lista blanca no existe.')
      );

      const token = createToken(adminUser);
      const res = await request(app)
        .delete('/api/whitelist/entry-inexistente')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });
});

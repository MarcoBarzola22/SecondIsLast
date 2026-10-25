import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { createApp } from '../app.js';
import { config } from '../config/env.js';
import { whitelistService } from '../services/whitelistService.js';
import { prisma } from '../db.js';

describe('Admin Migration API (T26 · POST /api/admin/migrate-local-data)', () => {
  let app: ReturnType<typeof createApp>;

  const adminUser = {
    id: 'user-admin-1',
    email: 'admin@secondislast.com',
    name: 'Admin Juntada',
    role: Role.ADMIN,
    playerId: 'p-admin',
  };

  const regularPlayerUser = {
    id: 'user-player-1',
    email: 'player@secondislast.com',
    name: 'Pablo Aimar',
    role: Role.PLAYER,
    playerId: 'p-aimar',
  };

  const createToken = (payload: object) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
  };

  const sampleAppData = {
    schemaVersion: 2,
    players: [
      { id: 'p1', firstName: 'Juan Román', lastName: 'Riquelme', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p2', firstName: 'Martín', lastName: 'Palermo', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p3', firstName: 'Carlos', lastName: 'Tevez', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    stats: {
      p1: {
        playerId: 'p1',
        pts: 25,
        pj: 10,
        pg: 8,
        pp: 1,
        gf: 22,
        gc: 8,
        tj: 1,
        yellowCards: 1,
        redCards: 0,
        podiums: 3,
      },
      p2: {
        playerId: 'p2',
        pts: 18,
        pj: 10,
        pg: 5,
        pp: 2,
        gf: 19,
        gc: 12,
        tj: 3,
        yellowCards: 2,
        redCards: 1,
        podiums: 2,
      },
    },
    headToHead: {
      p1_p2: {
        playerA: 'p1',
        playerB: 'p2',
        played: 4,
        winsA: 3,
        draws: 1,
        winsB: 0,
        goalsA: 9,
        goalsB: 3,
      },
    },
    annualRankings: {
      '2026': {
        p1: {
          playerId: 'p1',
          pts: 30,
          tournamentsPlayed: 3,
          championships: 2,
          runnerUps: 1,
          thirdPlaces: 0,
          podiums: 3,
          yellowCards: 1,
          redCards: 0,
        },
        p2: {
          playerId: 'p2',
          pts: 15,
          tournamentsPlayed: 3,
          championships: 1,
          runnerUps: 0,
          thirdPlaces: 1,
          podiums: 2,
          yellowCards: 2,
          redCards: 1,
        },
      },
    },
  };

  // Simulated in-memory database storage to verify transactional idempotency
  let playersMap: Map<string, any>;
  let statsMap: Map<string, any>;
  let h2hMap: Map<string, any>;
  let annualMap: Map<string, any>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);

    playersMap = new Map();
    statsMap = new Map();
    h2hMap = new Map();
    annualMap = new Map();

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      return callback({
        player: {
          findUnique: vi.fn().mockImplementation(async ({ where }) => {
            if (where.firstName_lastName) {
              const key = `${where.firstName_lastName.firstName.toLowerCase()}_${where.firstName_lastName.lastName.toLowerCase()}`;
              return playersMap.get(key) || null;
            }
            return null;
          }),
          create: vi.fn().mockImplementation(async ({ data }) => {
            const id = data.id || `p-uuid-${playersMap.size + 1}`;
            const key = `${data.firstName.toLowerCase()}_${data.lastName.toLowerCase()}`;
            const created = { ...data, id };
            playersMap.set(key, created);
            return created;
          }),
        },
        historicalStats: {
          upsert: vi.fn().mockImplementation(async ({ where, create, update }) => {
            const key = where.playerId;
            const existing = statsMap.get(key);
            if (existing) {
              const updated = { ...existing, ...update };
              statsMap.set(key, updated);
              return updated;
            } else {
              const created = { id: `stat-${statsMap.size + 1}`, ...create };
              statsMap.set(key, created);
              return created;
            }
          }),
        },
        headToHeadRecord: {
          upsert: vi.fn().mockImplementation(async ({ where, create, update }) => {
            const key = `${where.playerAId_playerBId.playerAId}_${where.playerAId_playerBId.playerBId}`;
            const existing = h2hMap.get(key);
            if (existing) {
              const updated = { ...existing, ...update };
              h2hMap.set(key, updated);
              return updated;
            } else {
              const created = { id: `h2h-${h2hMap.size + 1}`, ...create };
              h2hMap.set(key, created);
              return created;
            }
          }),
        },
        annualRankingEntry: {
          upsert: vi.fn().mockImplementation(async ({ where, create, update }) => {
            const key = `${where.year_playerId.year}_${where.year_playerId.playerId}`;
            const existing = annualMap.get(key);
            if (existing) {
              const updated = { ...existing, ...update };
              annualMap.set(key, updated);
              return updated;
            } else {
              const created = { id: `annual-${annualMap.size + 1}`, ...create };
              annualMap.set(key, created);
              return created;
            }
          }),
        },
      });
    });

    app = createApp();
  });

  it('rejects unauthenticated requests with 401 Unauthorized (RNF-4)', async () => {
    const res = await request(app)
      .post('/api/admin/migrate-local-data')
      .send(sampleAppData);

    expect(res.status).toBe(401);
  });

  it('rejects non-admin players with 403 Forbidden', async () => {
    const token = createToken(regularPlayerUser);

    const res = await request(app)
      .post('/api/admin/migrate-local-data')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleAppData);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  it('rejects payload with invalid schemaVersion with 400 Bad Request', async () => {
    const token = createToken(adminUser);

    const res = await request(app)
      .post('/api/admin/migrate-local-data')
      .set('Authorization', `Bearer ${token}`)
      .send({ schemaVersion: 99, players: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/schemaVersion/i);
  });

  it('rejects payload missing players array with 400 Bad Request', async () => {
    const token = createToken(adminUser);

    const res = await request(app)
      .post('/api/admin/migrate-local-data')
      .set('Authorization', `Bearer ${token}`)
      .send({ schemaVersion: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/players/i);
  });

  it('successfully executes idempotent migration and does not duplicate records on subsequent runs', async () => {
    const token = createToken(adminUser);

    // Initial Migration Run
    const res1 = await request(app)
      .post('/api/admin/migrate-local-data')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleAppData);

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.migrated.playersCount).toBe(3);
    expect(res1.body.migrated.statsCount).toBe(2);
    expect(res1.body.migrated.h2hCount).toBe(1);
    expect(res1.body.migrated.annualRankingsCount).toBe(2);

    // Verify records exist in simulated PostgreSQL state
    expect(playersMap.size).toBe(3);
    expect(statsMap.size).toBe(2);
    expect(h2hMap.size).toBe(1);
    expect(annualMap.size).toBe(2);

    const riquelmeKey = 'juan román_riquelme';
    expect(playersMap.has(riquelmeKey)).toBe(true);
    const riquelme = playersMap.get(riquelmeKey);
    const riquelmeStats = statsMap.get(riquelme.id);
    expect(riquelmeStats).toBeDefined();
    expect(riquelmeStats.matchesPlayed).toBe(10);
    expect(riquelmeStats.matchesWon).toBe(8);
    expect(riquelmeStats.goalsFor).toBe(22);

    const palermoKey = 'martín_palermo';
    expect(playersMap.has(palermoKey)).toBe(true);
    const palermo = playersMap.get(palermoKey);
    const idA = riquelme.id < palermo.id ? riquelme.id : palermo.id;
    const idB = riquelme.id < palermo.id ? palermo.id : riquelme.id;
    const h2h = h2hMap.get(`${idA}_${idB}`);
    expect(h2h).toBeDefined();
    expect(h2h.matchesPlayed).toBe(4);

    const annualRiquelme = annualMap.get(`2026_${riquelme.id}`);
    expect(annualRiquelme).toBeDefined();
    expect(annualRiquelme.points).toBe(30);

    const totalPlayersCount1 = playersMap.size;
    const totalStatsCount1 = statsMap.size;
    const totalH2HCount1 = h2hMap.size;
    const totalAnnualCount1 = annualMap.size;

    // Second Migration Run (Idempotency Test)
    const res2 = await request(app)
      .post('/api/admin/migrate-local-data')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleAppData);

    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);

    const totalPlayersCount2 = playersMap.size;
    const totalStatsCount2 = statsMap.size;
    const totalH2HCount2 = h2hMap.size;
    const totalAnnualCount2 = annualMap.size;

    // Exact count verification proving 0 duplicate rows were created
    expect(totalPlayersCount2).toBe(totalPlayersCount1);
    expect(totalStatsCount2).toBe(totalStatsCount1);
    expect(totalH2HCount2).toBe(totalH2HCount1);
    expect(totalAnnualCount2).toBe(totalAnnualCount1);
  });
});

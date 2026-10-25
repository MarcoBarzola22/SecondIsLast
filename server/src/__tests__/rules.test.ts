import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { createApp } from '../app.js';
import { config } from '../config/env.js';
import { whitelistService } from '../services/whitelistService.js';
import { OFFICIAL_HOUSE_RULES } from '../domain/houseRules.js';

describe('Official House Rules API (T25 · RF-118, RNF-4)', () => {
  let app: ReturnType<typeof createApp>;

  const authenticatedUser = {
    id: 'user-player-1',
    email: 'player@secondislast.com',
    name: 'Lautaro Martínez',
    role: Role.PLAYER,
    playerId: 'p1',
  };

  const createToken = (payload: object) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  it('rejects unauthenticated requests with 401 Unauthorized (RNF-4)', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(401);
  });

  it('rejects non-whitelisted users with 403 Forbidden (RNF-4)', async () => {
    vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(false);
    const token = createToken(authenticatedUser);

    const res = await request(app)
      .get('/api/rules')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/lista blanca|whitelist/i);
  });

  it('returns 200 OK and the complete official rules document for authenticated whitelisted users (RF-118)', async () => {
    vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
    const token = createToken(authenticatedUser);

    const res = await request(app)
      .get('/api/rules')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.document).toBeDefined();
    expect(res.body.rules).toBeInstanceOf(Array);
    expect(res.body.rules.length).toBe(8);

    const rules = res.body.rules;

    // 1. Quórum de 4 (RF-96)
    const quorumRule = rules.find((r: any) => r.id === 'quorum');
    expect(quorumRule).toBeDefined();
    expect(quorumRule.articleNumber).toBe(1);
    expect(quorumRule.rfReference).toContain('RF-96');
    expect(quorumRule.description).toMatch(/4/);
    expect(quorumRule.description).toMatch(/lobby/i);

    // 2. Votaciones y desempates al azar (RF-99 to RF-102)
    const votingRule = rules.find((r: any) => r.id === 'voting');
    expect(votingRule).toBeDefined();
    expect(votingRule.articleNumber).toBe(2);
    expect(votingRule.rfReference).toMatch(/RF-99|RF-101/);
    expect(votingRule.description).toMatch(/azar|moneda/i);

    // 3. Handshake Local-Visitante (RF-105 to RF-109)
    const handshakeRule = rules.find((r: any) => r.id === 'handshake');
    expect(handshakeRule).toBeDefined();
    expect(handshakeRule.articleNumber).toBe(3);
    expect(handshakeRule.rfReference).toContain('RF-108');
    expect(handshakeRule.description).toMatch(/local/i);
    expect(handshakeRule.description).toMatch(/visitante/i);

    // 4. Prohibición al Admin de tocar resultados (RF-112)
    const antiTamperRule = rules.find((r: any) => r.id === 'anti_tamper');
    expect(antiTamperRule).toBeDefined();
    expect(antiTamperRule.articleNumber).toBe(4);
    expect(antiTamperRule.rfReference).toContain('RF-112');
    expect(antiTamperRule.description).toMatch(/admin/i);

    // 5. Cola secuencial por jugador y desacoplamiento de fecha (RF-113 to RF-115)
    const queueRule = rules.find((r: any) => r.id === 'sequential_queue');
    expect(queueRule).toBeDefined();
    expect(queueRule.articleNumber).toBe(5);
    expect(queueRule.rfReference).toContain('RF-114');
    expect(queueRule.description).toMatch(/secuencial/i);

    // 6. Desempate olímpico/Fair Play (PTS, DG, H2H, PG, TR, TA) (RF-32, RF-34)
    const tiebreakerRule = rules.find((r: any) => r.id === 'tiebreakers');
    expect(tiebreakerRule).toBeDefined();
    expect(tiebreakerRule.articleNumber).toBe(6);
    expect(tiebreakerRule.rfReference).toContain('RF-32');
    expect(tiebreakerRule.keyPoints.some((p: string) => p.includes('PTS'))).toBe(true);
    expect(tiebreakerRule.keyPoints.some((p: string) => p.includes('DG'))).toBe(true);
    expect(tiebreakerRule.keyPoints.some((p: string) => p.includes('H2H'))).toBe(true);
    expect(tiebreakerRule.keyPoints.some((p: string) => p.includes('PG'))).toBe(true);
    expect(tiebreakerRule.keyPoints.some((p: string) => p.includes('TR'))).toBe(true);
    expect(tiebreakerRule.keyPoints.some((p: string) => p.includes('TA'))).toBe(true);

    // 7. Walkover 0-3 (RF-116, RF-117)
    const walkoverRule = rules.find((r: any) => r.id === 'walkover');
    expect(walkoverRule).toBeDefined();
    expect(walkoverRule.articleNumber).toBe(7);
    expect(walkoverRule.rfReference).toContain('RF-116');
    expect(walkoverRule.description).toMatch(/0-3/);

    // 8. Escala de puntos enteros del Ranking Anual (N / 4) (RF-78, RF-84)
    const rankingRule = rules.find((r: any) => r.id === 'annual_ranking');
    expect(rankingRule).toBeDefined();
    expect(rankingRule.articleNumber).toBe(8);
    expect(rankingRule.rfReference).toContain('RF-78');
    expect(rankingRule.description).toMatch(/N \/ 4/);
  });

  it('contains authentic Rioplatense Spanish copywriting with quotes and preambles', async () => {
    vi.spyOn(whitelistService, 'isEmailWhitelisted').mockResolvedValue(true);
    const token = createToken(authenticatedUser);

    const res = await request(app)
      .get('/api/rules')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.document.preamble).toMatch(/juntada|pibes|pelota/i);
    expect(res.body.rules.every((r: any) => typeof r.quote === 'string' && r.quote.length > 0)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { OFFICIAL_HOUSE_RULES } from '../houseRules';
import { saveOfflineRules, loadOfflineRules, clearOfflineCache } from '../../cache/offlineStore';

describe('House Rules Domain & Offline Cache (T25 · RF-118, RF-120)', () => {
  it('contains exactly 8 official house rules articles covering all mandated topics', () => {
    expect(OFFICIAL_HOUSE_RULES.rules).toHaveLength(8);
    const articleNumbers = OFFICIAL_HOUSE_RULES.rules.map((r) => r.articleNumber);
    expect(articleNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('specifies quórum of 4 players in Article 1 (RF-96)', () => {
    const r1 = OFFICIAL_HOUSE_RULES.rules[0];
    expect(r1.id).toBe('quorum');
    expect(r1.rfReference).toContain('RF-96');
    expect(r1.title).toMatch(/quórum/i);
    expect(r1.keyPoints.some((p) => p.includes('Mínimo 4 jugadores'))).toBe(true);
  });

  it('specifies democratic voting and 50/50 uniform tiebreaker in Article 2 (RF-99 to RF-102)', () => {
    const r2 = OFFICIAL_HOUSE_RULES.rules[1];
    expect(r2.id).toBe('voting');
    expect(r2.rfReference).toContain('RF-99');
    expect(r2.keyPoints.some((p) => p.includes('50/50'))).toBe(true);
  });

  it('specifies Local-Away handshake in Article 3 (RF-105 to RF-109)', () => {
    const r3 = OFFICIAL_HOUSE_RULES.rules[2];
    expect(r3.id).toBe('handshake');
    expect(r3.rfReference).toContain('RF-108');
    expect(r3.keyPoints.some((p) => p.includes('Solo el Local'))).toBe(true);
    expect(r3.keyPoints.some((p) => p.includes('Solo el Visitante'))).toBe(true);
  });

  it('specifies strict prohibition of Admin editing scores in Article 4 (RF-112)', () => {
    const r4 = OFFICIAL_HOUSE_RULES.rules[3];
    expect(r4.id).toBe('anti_tamper');
    expect(r4.rfReference).toContain('RF-112');
    expect(r4.keyPoints.some((p) => p.includes('ADMIN'))).toBe(true);
    expect(r4.summary + ' ' + r4.description).toMatch(/inviolabilidad|innegociable/i);
  });

  it('specifies player sequential queue and global round decoupling in Article 5 (RF-113 to RF-115)', () => {
    const r5 = OFFICIAL_HOUSE_RULES.rules[4];
    expect(r5.id).toBe('sequential_queue');
    expect(r5.rfReference).toContain('RF-114');
    expect(r5.keyPoints.some((p) => p.includes('CLOSED'))).toBe(true);
    expect(r5.description).toMatch(/secuencial/i);
  });

  it('specifies all 6 Olympic and Fair Play tiebreakers in exact order in Article 6 (RF-32, RF-34)', () => {
    const r6 = OFFICIAL_HOUSE_RULES.rules[5];
    expect(r6.id).toBe('tiebreakers');
    expect(r6.rfReference).toContain('RF-32');
    const points = r6.keyPoints;
    expect(points[0]).toContain('PTS');
    expect(points[1]).toContain('DG');
    expect(points[2]).toContain('H2H');
    expect(points[3]).toContain('PG');
    expect(points[4]).toContain('TR');
    expect(points[5]).toContain('TA');
  });

  it('specifies Walkover 0-3 and instant opponent unlock in Article 7 (RF-116, RF-117)', () => {
    const r7 = OFFICIAL_HOUSE_RULES.rules[6];
    expect(r7.id).toBe('walkover');
    expect(r7.rfReference).toContain('RF-116');
    expect(r7.description).toMatch(/0-3/);
    expect(r7.keyPoints.some((p) => p.includes('0-3'))).toBe(true);
  });

  it('specifies Annual Ranking integer points scaled by N / 4 in Article 8 (RF-78, RF-84)', () => {
    const r8 = OFFICIAL_HOUSE_RULES.rules[7];
    expect(r8.id).toBe('annual_ranking');
    expect(r8.rfReference).toContain('RF-78');
    expect(r8.keyPoints.some((p) => p.includes('N / 4'))).toBe(true);
  });

  it('is phrased in authentic Rioplatense Spanish ("vos", "pibes", "juntada")', () => {
    const text = JSON.stringify(OFFICIAL_HOUSE_RULES);
    expect(text).toMatch(/juntada/i);
    expect(text).toMatch(/pibes/i);
    expect(text).toMatch(/vos|jugá|cargá|acordate/i);
  });

  it('supports caching and loading via offlineStore (RF-120)', () => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
      length: 0,
      key: () => null,
    } as unknown as Storage;

    saveOfflineRules(OFFICIAL_HOUSE_RULES, mockStorage);
    const loaded = loadOfflineRules(mockStorage);
    expect(loaded).toBeDefined();
    expect(loaded.rules).toHaveLength(8);
    expect(loaded.title).toBe(OFFICIAL_HOUSE_RULES.title);

    clearOfflineCache(mockStorage);
    expect(loadOfflineRules(mockStorage)).toBeNull();
  });
});

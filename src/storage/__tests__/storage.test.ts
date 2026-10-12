import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyAppData, SCHEMA_VERSION } from '../schema';
import { loadAppData, saveAppData, STORAGE_KEY } from '../storage';

describe('storage adapter (Principle 5, Principle 6, RF-4, RF-39, RF-41, RF-42)', () => {
  let mockStore: Record<string, string> = {};

  const mockStorage: Storage = {
    getItem: vi.fn((key: string) => mockStore[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockStore[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStore[key];
    }),
    clear: vi.fn(() => {
      mockStore = {};
    }),
    key: vi.fn(() => null),
    length: 0,
  };

  beforeEach(() => {
    mockStore = {};
    vi.clearAllMocks();
  });

  it('returns default empty state when storage is empty', () => {
    const data = loadAppData(mockStorage);
    expect(data).toEqual(createEmptyAppData());
  });

  it('saves and loads valid AppData correctly (RF-4, RF-39)', () => {
    const data = createEmptyAppData();
    data.players.push({
      id: 'p1',
      firstName: 'Marco',
      lastName: 'Barzola',
      createdAt: '2026-10-09',
    });

    const saved = saveAppData(data, mockStorage);
    expect(saved).toBe(true);

    const loaded = loadAppData(mockStorage);
    expect(loaded).toEqual(data);
  });

  it('catches corrupt JSON and falls back safely to empty state (RF-41)', () => {
    mockStore[STORAGE_KEY] = 'INVALID_JSON{{{';
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const loaded = loadAppData(mockStorage);
    expect(loaded).toEqual(createEmptyAppData());
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('catches schema version mismatch and falls back safely (RF-41)', () => {
    mockStore[STORAGE_KEY] = JSON.stringify({
      schemaVersion: 999, // Unknown version
      players: [],
      stats: {},
      activeTournament: null,
      history: [],
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const loaded = loadAppData(mockStorage);
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.players).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('catches quota error during save without throwing (RF-42)', () => {
    const quotaStorage: Storage = {
      ...mockStorage,
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError');
      }),
    };
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const success = saveAppData(createEmptyAppData(), quotaStorage);
    expect(success).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('transparently migrates schemaVersion: 1 to schemaVersion: 2 with safe defaults (RF-80)', () => {
    const legacyV1 = {
      schemaVersion: 1,
      players: [
        { id: 'p1', firstName: 'Lionel', lastName: 'Messi', createdAt: '2026-01-01' },
      ],
      stats: {
        p1: { playerId: 'p1', pts: 10, pj: 3, pg: 3, pp: 0, gf: 9, gc: 1, tj: 1 },
      },
      activeTournament: null,
      history: [
        {
          id: 'hist-1',
          finishedAt: '2026-02-01T12:00:00Z',
          theme: 'Champions',
          participants: [{ playerId: 'p1', team: 'Barca' }],
          podium: { champion: 'p1', runnerUp: 'p2', third: 'p3', fourth: 'p4' },
        },
      ],
      customThemes: ['Anime'],
    };

    mockStore[STORAGE_KEY] = JSON.stringify(legacyV1);

    const loaded = loadAppData(mockStorage);

    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.players).toHaveLength(1);
    expect(loaded.players[0].id).toBe('p1');
    expect(loaded.stats['p1'].pts).toBe(10);
    expect(loaded.history).toHaveLength(1);
    expect(loaded.customThemes).toEqual(['Anime']);
    expect(loaded.headToHead).toEqual({});
    expect(loaded.annualRankings).toEqual({});

    // Verify auto-saved back to storage as v2
    const rawStored = JSON.parse(mockStore[STORAGE_KEY]);
    expect(rawStored.schemaVersion).toBe(2);
  });
});

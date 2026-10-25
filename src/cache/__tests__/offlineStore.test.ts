import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveOfflineSnapshot,
  loadOfflineSnapshot,
  saveOfflineTournament,
  loadOfflineTournament,
  clearOfflineCache,
  isOfflineCacheAvailable,
  OFFLINE_CACHE_KEY,
} from '../offlineStore';

describe('offlineStore (T24 · RF-120, RNF-3)', () => {
  let mockStorage: Record<string, string>;
  let customStorage: Storage;

  beforeEach(() => {
    mockStorage = {};
    customStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      key: (_index: number) => null,
      length: Object.keys(mockStorage).length,
    };
  });

  it('saves and loads offline snapshot under second-is-last:cloud-cache', () => {
    const tournament = {
      id: 'tourney-test-1',
      name: 'Torneo Offline',
      status: 'IN_PROGRESS',
      format: 'bracket',
    };

    saveOfflineSnapshot({ activeTournament: tournament }, customStorage);

    expect(isOfflineCacheAvailable(customStorage)).toBe(true);
    const loaded = loadOfflineSnapshot(customStorage);
    expect(loaded).not.toBeNull();
    expect(loaded?.activeTournament.id).toBe('tourney-test-1');
    expect(loaded?.activeTournament.name).toBe('Torneo Offline');
    expect(loaded?.timestamp).toBeDefined();
  });

  it('saves and loads active tournament directly', () => {
    const tournament = {
      id: 'tourney-quick-save',
      phase: 'bracket',
      participantIds: ['p1', 'p2', 'p3', 'p4'],
    };

    saveOfflineTournament(tournament, customStorage);
    const loaded = loadOfflineTournament(customStorage);

    expect(loaded).toEqual(tournament);
  });

  it('merges updates on partial snapshots', () => {
    saveOfflineSnapshot({ serverStats: [{ playerId: 'p1', points: 10 }] }, customStorage);
    saveOfflineSnapshot({ serverAnnual: [{ playerId: 'p1', points: 10 }] }, customStorage);

    const loaded = loadOfflineSnapshot(customStorage);
    expect(loaded?.serverStats).toEqual([{ playerId: 'p1', points: 10 }]);
    expect(loaded?.serverAnnual).toEqual([{ playerId: 'p1', points: 10 }]);
  });

  it('clears offline cache correctly', () => {
    saveOfflineTournament({ id: 'to-delete' }, customStorage);
    expect(isOfflineCacheAvailable(customStorage)).toBe(true);

    clearOfflineCache(customStorage);
    expect(isOfflineCacheAvailable(customStorage)).toBe(false);
    expect(loadOfflineSnapshot(customStorage)).toBeNull();
  });

  it('gracefully handles empty storage or invalid JSON', () => {
    expect(loadOfflineSnapshot(customStorage)).toBeNull();

    mockStorage[OFFLINE_CACHE_KEY] = 'invalid-json{{{';
    expect(loadOfflineSnapshot(customStorage)).toBeNull();
  });

  it('gracefully handles missing storage without throwing', () => {
    expect(() => saveOfflineSnapshot({ activeTournament: null }, undefined)).not.toThrow();
    expect(loadOfflineSnapshot(undefined)).toBeNull();
    expect(() => clearOfflineCache(undefined)).not.toThrow();
    expect(isOfflineCacheAvailable(undefined)).toBe(false);
  });
});

/**
 * Offline Store (T24 · RF-120, RNF-3)
 * Persists the latest received cloud tournament state, matches, standings and history in localStorage
 * under 'second-is-last:cloud-cache' to ensure seamless read-only navigation when disconnected.
 */

export const OFFLINE_CACHE_KEY = 'second-is-last:cloud-cache';

export interface OfflineCacheData {
  timestamp: string; // ISO 8601
  activeTournament?: any | null;
  serverStats?: any[] | null;
  serverAnnual?: any[] | null;
  serverH2H?: any[] | null;
  matches?: any[] | null;
  bracket?: any[] | null;
  standings?: any[] | null;
  rules?: any | null;
  version?: number;
}

/**
 * Saves a partial or full snapshot of the cloud state to offline cache.
 */
export function saveOfflineSnapshot(
  data: Partial<OfflineCacheData>,
  storage?: Storage
): void {
  try {
    const targetStorage =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!targetStorage) return;

    const existing = loadOfflineSnapshot(targetStorage) || {
      timestamp: new Date().toISOString(),
    };

    const updated: OfflineCacheData = {
      ...existing,
      ...data,
      timestamp: new Date().toISOString(),
    };

    targetStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[OfflineStore] Error saving offline snapshot:', err);
  }
}

/**
 * Loads the cached cloud snapshot from storage.
 */
export function loadOfflineSnapshot(storage?: Storage): OfflineCacheData | null {
  try {
    const targetStorage =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!targetStorage) return null;

    const raw = targetStorage.getItem(OFFLINE_CACHE_KEY);
    if (!raw) return null;

    return JSON.parse(raw) as OfflineCacheData;
  } catch (err) {
    console.warn('[OfflineStore] Error loading offline snapshot:', err);
    return null;
  }
}

/**
 * Helper to quickly cache active tournament state.
 */
export function saveOfflineTournament(tournament: any, storage?: Storage): void {
  saveOfflineSnapshot({ activeTournament: tournament }, storage);
}

/**
 * Helper to retrieve the cached active tournament.
 */
export function loadOfflineTournament(storage?: Storage): any | null {
  const snapshot = loadOfflineSnapshot(storage);
  return snapshot?.activeTournament ?? null;
}

/**
 * Helper to cache the official house rules.
 */
export function saveOfflineRules(rules: any, storage?: Storage): void {
  saveOfflineSnapshot({ rules }, storage);
}

/**
 * Helper to retrieve the cached house rules.
 */
export function loadOfflineRules(storage?: Storage): any | null {
  const snapshot = loadOfflineSnapshot(storage);
  return snapshot?.rules ?? null;
}

/**
 * Clears the offline cache.
 */
export function clearOfflineCache(storage?: Storage): void {
  try {
    const targetStorage =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!targetStorage) return;
    targetStorage.removeItem(OFFLINE_CACHE_KEY);
  } catch (err) {
    console.warn('[OfflineStore] Error clearing offline cache:', err);
  }
}

/**
 * Checks whether offline cache exists and has data.
 */
export function isOfflineCacheAvailable(storage?: Storage): boolean {
  return loadOfflineSnapshot(storage) !== null;
}

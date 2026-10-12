import {
  createEmptyAppData,
  migrateAppData,
  type AppData,
} from './schema';

export const STORAGE_KEY = 'second-is-last:data';

/**
 * Loads and validates application state from local storage (RF-4, RF-40, RF-41, RF-80).
 * If storage is empty, corrupted, or schema is unknown, falls back cleanly to empty AppData without throwing (Principle 5).
 * Automatically migrates older schema versions (v1 to v2) transparently (RF-80).
 */
export function loadAppData(
  storage?: Storage
): AppData {
  try {
    const targetStorage =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);

    if (!targetStorage) {
      return createEmptyAppData();
    }

    const raw = targetStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyAppData();
    }

    const parsed = JSON.parse(raw);
    const migrated = migrateAppData(parsed);

    if (!migrated) {
      console.error(
        '[Storage] Invalid or incompatible AppData structure. Falling back to default empty state.',
        parsed
      );
      return createEmptyAppData();
    }

    if (migrated.activeTournament) {
      migrated.activeTournament.tournamentType =
        migrated.activeTournament.tournamentType ?? 'bracket';
      migrated.activeTournament.matchFormat =
        migrated.activeTournament.matchFormat ?? 'two_legged';
      migrated.activeTournament.leagueMatches =
        migrated.activeTournament.leagueMatches ?? [];
    }

    migrated.customThemes = Array.isArray(migrated.customThemes)
      ? migrated.customThemes
      : [];

    migrated.headToHead =
      migrated.headToHead && typeof migrated.headToHead === 'object'
        ? migrated.headToHead
        : {};

    migrated.annualRankings =
      migrated.annualRankings && typeof migrated.annualRankings === 'object'
        ? migrated.annualRankings
        : {};

    // Auto-save migrated v2 schema back to storage if it was upgraded from v1
    if (parsed.schemaVersion === 1) {
      saveAppData(migrated, targetStorage);
    }

    return migrated;

  } catch (error) {
    console.error(
      '[Storage] Failed to read or parse localStorage data. Falling back to default empty state.',
      error
    );
    return createEmptyAppData();
  }
}

/**
 * Atomically saves application state to local storage (RF-39, RF-42).
 * Catches any storage error (e.g. quota exceeded) and logs to console without throwing or disrupting the UI.
 * Returns true if saved successfully, false otherwise.
 */
export function saveAppData(
  data: AppData,
  storage?: Storage
): boolean {
  try {
    const targetStorage =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);

    if (!targetStorage) {
      return false;
    }

    const serialized = JSON.stringify(data);
    targetStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.error(
      '[Storage] Failed to save AppData to localStorage.',
      error
    );
    return false;
  }
}

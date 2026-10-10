import {
  createEmptyAppData,
  isAppData,
  type AppData,
} from './schema';

export const STORAGE_KEY = 'second-is-last:data';

/**
 * Loads and validates application state from local storage (RF-4, RF-40, RF-41).
 * If storage is empty, corrupted, or schema is unknown, falls back cleanly to empty AppData without throwing (Principle 5).
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
    if (!isAppData(parsed)) {
      console.error(
        '[Storage] Invalid or incompatible AppData structure. Falling back to default empty state.',
        parsed
      );
      return createEmptyAppData();
    }

    if (parsed.activeTournament) {
      parsed.activeTournament.tournamentType =
        parsed.activeTournament.tournamentType ?? 'bracket';
      parsed.activeTournament.matchFormat =
        parsed.activeTournament.matchFormat ?? 'two_legged';
      parsed.activeTournament.leagueMatches =
        parsed.activeTournament.leagueMatches ?? [];
    }

    parsed.customThemes = Array.isArray(parsed.customThemes)
      ? parsed.customThemes
      : [];

    return parsed;

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

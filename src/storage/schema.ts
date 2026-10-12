import type {
  ActiveTournament,
  AnnualRankingEntry,
  HeadToHeadRecord,
  Player,
  PlayerId,
  PlayerStats,
  TournamentSummary,
} from '../domain/types';

export const SCHEMA_VERSION = 2 as const;

export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION;
  players: Player[];
  stats: Record<PlayerId, PlayerStats>;
  activeTournament: ActiveTournament | null;
  history: TournamentSummary[];
  customThemes?: string[];
  headToHead?: Record<string, HeadToHeadRecord>;
  annualRankings?: Record<string, Record<PlayerId, AnnualRankingEntry>>;
}

/**
 * Creates a fresh, empty AppData state adhering to SCHEMA_VERSION (RF-41).
 */
export function createEmptyAppData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    players: [],
    stats: {},
    activeTournament: null,
    history: [],
    customThemes: [],
    headToHead: {},
    annualRankings: {},
  };
}

/**
 * Type guard verifying if an unknown value satisfies the AppData schema (RF-41).
 */
export function isAppData(value: unknown): value is AppData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (obj['schemaVersion'] !== SCHEMA_VERSION) {
    return false;
  }

  if (!Array.isArray(obj['players'])) {
    return false;
  }

  if (typeof obj['stats'] !== 'object' || obj['stats'] === null) {
    return false;
  }

  if (
    obj['activeTournament'] !== null &&
    (typeof obj['activeTournament'] !== 'object' || Array.isArray(obj['activeTournament']))
  ) {
    return false;
  }

  if (!Array.isArray(obj['history'])) {
    return false;
  }

  if (
    obj['customThemes'] !== undefined &&
    (!Array.isArray(obj['customThemes']) ||
      !obj['customThemes'].every((t) => typeof t === 'string'))
  ) {
    return false;
  }

  if (
    obj['headToHead'] !== undefined &&
    (typeof obj['headToHead'] !== 'object' || obj['headToHead'] === null)
  ) {
    return false;
  }

  if (
    obj['annualRankings'] !== undefined &&
    (typeof obj['annualRankings'] !== 'object' || obj['annualRankings'] === null)
  ) {
    return false;
  }

  return true;
}

/**
 * Transparently migrates previous schema versions (v1) to current schemaVersion: 2 (RF-80).
 * Safe defaults are provided for new structures (headToHead, annualRankings) without losing existing data.
 */
export function migrateAppData(value: unknown): AppData | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const obj = value as Record<string, unknown>;
  const version = obj['schemaVersion'];

  // Current version: Validate directly or ensure safe defaults
  if (version === 2) {
    if (
      !Array.isArray(obj['players']) ||
      typeof obj['stats'] !== 'object' ||
      obj['stats'] === null ||
      !Array.isArray(obj['history'])
    ) {
      return null;
    }

    return {
      schemaVersion: 2,
      players: obj['players'] as Player[],
      stats: obj['stats'] as Record<PlayerId, PlayerStats>,
      activeTournament: (obj['activeTournament'] as ActiveTournament) ?? null,
      history: obj['history'] as TournamentSummary[],
      customThemes: Array.isArray(obj['customThemes']) ? (obj['customThemes'] as string[]) : [],
      headToHead:
        typeof obj['headToHead'] === 'object' && obj['headToHead'] !== null
          ? (obj['headToHead'] as Record<string, HeadToHeadRecord>)
          : {},
      annualRankings:
        typeof obj['annualRankings'] === 'object' && obj['annualRankings'] !== null
          ? (obj['annualRankings'] as Record<string, Record<PlayerId, AnnualRankingEntry>>)
          : {},
    };
  }

  // Version 1: Upgrade to version 2 (RF-80)
  if (version === 1) {
    if (
      !Array.isArray(obj['players']) ||
      typeof obj['stats'] !== 'object' ||
      obj['stats'] === null ||
      !Array.isArray(obj['history'])
    ) {
      return null;
    }

    return {
      schemaVersion: 2,
      players: obj['players'] as Player[],
      stats: obj['stats'] as Record<PlayerId, PlayerStats>,
      activeTournament: (obj['activeTournament'] as ActiveTournament) ?? null,
      history: obj['history'] as TournamentSummary[],
      customThemes: Array.isArray(obj['customThemes']) ? (obj['customThemes'] as string[]) : [],
      headToHead:
        typeof obj['headToHead'] === 'object' && obj['headToHead'] !== null
          ? (obj['headToHead'] as Record<string, HeadToHeadRecord>)
          : {},
      annualRankings:
        typeof obj['annualRankings'] === 'object' && obj['annualRankings'] !== null
          ? (obj['annualRankings'] as Record<string, Record<PlayerId, AnnualRankingEntry>>)
          : {},
    };
  }

  // Unsupported or unknown future schema version
  return null;
}

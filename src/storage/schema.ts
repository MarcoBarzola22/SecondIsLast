import type {
  ActiveTournament,
  Player,
  PlayerId,
  PlayerStats,
  TournamentSummary,
} from '../domain/types';

export const SCHEMA_VERSION = 1 as const;

export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION;
  players: Player[];
  stats: Record<PlayerId, PlayerStats>;
  activeTournament: ActiveTournament | null;
  history: TournamentSummary[];
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

  return true;
}

import type { PlayerId } from './types';
import { shuffle, type RngFn } from './random';

/**
 * Creates the randomized draft pick order using Fisher-Yates (RF-11).
 */
export function createDraftOrder(
  participantIds: readonly PlayerId[],
  rng: RngFn = Math.random
): PlayerId[] {
  return shuffle(participantIds, rng);
}

/**
 * Identifies the participant whose turn it is to pick a team.
 * Returns null if all participants already have a team assigned (RF-12, RF-15).
 */
export function getCurrentDrafter(
  draftOrder: readonly PlayerId[],
  assignedTeams: Record<PlayerId, string>
): PlayerId | null {
  for (const id of draftOrder) {
    const team = assignedTeams[id];
    if (!team || team.trim().length === 0) {
      return id;
    }
  }
  return null;
}

/**
 * Normalizes a team name for duplicate detection (case- and whitespace-insensitive).
 */
export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface TeamValidationResult {
  isValid: boolean;
  errorMessage: string | null;
  sanitizedTeamName: string;
}

/**
 * Validates a team name input:
 * - Must not be empty or whitespace only (RF-13, RF-14).
 * - Must not have been chosen by another participant in the same tournament (RF-14).
 */
export function validateTeamName(
  teamName: string,
  assignedTeams: Record<PlayerId, string>,
  currentDrafterId?: PlayerId
): TeamValidationResult {
  const sanitized = teamName.trim().replace(/\s+/g, ' ');

  if (sanitized.length === 0) {
    return {
      isValid: false,
      errorMessage: 'El nombre del equipo es obligatorio.',
      sanitizedTeamName: sanitized,
    };
  }

  const normalized = normalizeTeamName(sanitized);

  for (const [playerId, existingTeam] of Object.entries(assignedTeams)) {
    if (currentDrafterId && playerId === currentDrafterId) {
      continue;
    }
    if (normalizeTeamName(existingTeam) === normalized) {
      return {
        isValid: false,
        errorMessage: 'Ese equipo ya fue elegido por otro participante.',
        sanitizedTeamName: sanitized,
      };
    }
  }

  return {
    isValid: true,
    errorMessage: null,
    sanitizedTeamName: sanitized,
  };
}

/**
 * Checks whether all participants have chosen their teams (RF-16).
 */
export function isDraftComplete(
  participantIds: readonly PlayerId[],
  assignedTeams: Record<PlayerId, string>
): boolean {
  if (participantIds.length === 0) {
    return false;
  }
  return participantIds.every((id) => {
    const team = assignedTeams[id];
    return typeof team === 'string' && team.trim().length > 0;
  });
}

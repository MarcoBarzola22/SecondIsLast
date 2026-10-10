import type { Player } from './types';

/**
 * Normalizes a string for case-, accent-, and whitespace-insensitive comparison.
 * Collapses consecutive whitespace, removes diacritics, and lowercases.
 */
export function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Cleans a name by trimming edges and collapsing internal consecutive whitespace.
 */
export function sanitizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export interface PlayerValidationResult {
  isValid: boolean;
  errorMessage: string | null;
  sanitizedFirstName: string;
  sanitizedLastName: string;
}

/**
 * Validates player first name and last name.
 * Both fields are required and must not be empty or whitespace-only (RF-1, RF-2).
 */
export function validatePlayerInput(
  firstName: string,
  lastName: string
): PlayerValidationResult {
  const sanitizedFirst = sanitizeName(firstName);
  const sanitizedLast = sanitizeName(lastName);

  if (sanitizedFirst.length === 0 || sanitizedLast.length === 0) {
    return {
      isValid: false,
      errorMessage: 'El nombre y el apellido son obligatorios.',
      sanitizedFirstName: sanitizedFirst,
      sanitizedLastName: sanitizedLast,
    };
  }

  return {
    isValid: true,
    errorMessage: null,
    sanitizedFirstName: sanitizedFirst,
    sanitizedLastName: sanitizedLast,
  };
}

/**
 * Checks whether a player with the same first and last name already exists.
 * Comparison is case-insensitive, accent-insensitive, and ignores extra whitespace (RF-3).
 */
export function isDuplicatePlayer(
  candidate: { firstName: string; lastName: string },
  existingPlayers: readonly Player[],
  excludePlayerId?: string
): boolean {
  const targetFirst = normalizeName(candidate.firstName);
  const targetLast = normalizeName(candidate.lastName);

  return existingPlayers.some((p) => {
    if (excludePlayerId && p.id === excludePlayerId) {
      return false;
    }
    return (
      normalizeName(p.firstName) === targetFirst &&
      normalizeName(p.lastName) === targetLast
    );
  });
}

/**
 * Formats player name as "Apellido, Nombre" (RF-35).
 */
export function formatPlayerName(
  player: Pick<Player, 'firstName' | 'lastName'>
): string {
  const last = sanitizeName(player.lastName);
  const first = sanitizeName(player.firstName);
  return `${last}, ${first}`;
}

/**
 * Removes a player by ID from a list of players (RF-46).
 * Pure function: returns a new array without mutating the input.
 */
export function removePlayer(
  players: readonly Player[],
  playerId: string
): Player[] {
  return players.filter((p) => p.id !== playerId);
}


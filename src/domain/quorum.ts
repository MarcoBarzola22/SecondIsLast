/**
 * Quorum and Lobby business domain rules (RF-96, RF-98).
 * Pure functions with zero external dependencies.
 */

export const MINIMUM_LOBBY_QUORUM = 4;

/**
 * Checks whether the confirmed participants meet the minimum quorum requirement (RF-96).
 * Quorum is met if and only if N >= 4.
 */
export function isQuorumReached(participantCount: number): boolean {
  return participantCount >= MINIMUM_LOBBY_QUORUM;
}

/**
 * Calculates how many players are still needed to reach the quorum.
 */
export function getMissingPlayersForQuorum(participantCount: number): number {
  return Math.max(0, MINIMUM_LOBBY_QUORUM - participantCount);
}

/**
 * Validates whether the active user is authorized to trigger the format voting phase (RF-98).
 * Requirements:
 * 1. Quorum is reached (N >= 4).
 * 2. User is confirmed as a participant in the lobby.
 */
export function canInitiateTournament(participantCount: number, isUserConfirmed: boolean): boolean {
  return isQuorumReached(participantCount) && isUserConfirmed;
}

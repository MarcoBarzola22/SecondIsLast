export type MatchStatus =
  | 'PENDING_SUBMISSION'
  | 'PENDING_CONFIRMATION'
  | 'CLOSED';

export interface MatchForLock {
  id: string;
  round?: number;
  leg?: number;
  homeParticipantId?: string | null;
  awayParticipantId?: string | null;
  playerA?: string | null;
  playerB?: string | null;
  status: MatchStatus | string;
  isBye?: boolean;
}

export interface LockEvaluationResult {
  canPlay: boolean;
  reason?: string;
  blockingMatches: MatchForLock[];
}

/**
 * Extracts the home participant identifier from either homeParticipantId or playerA.
 */
function getHomeParticipant(match: MatchForLock): string | null {
  return match.homeParticipantId ?? match.playerA ?? null;
}

/**
 * Extracts the away participant identifier from either awayParticipantId or playerB.
 */
function getAwayParticipant(match: MatchForLock): string | null {
  return match.awayParticipantId ?? match.playerB ?? null;
}

/**
 * Checks whether a given match involves the specified participant.
 */
function isMatchInvolvingParticipant(
  match: MatchForLock,
  participantId: string
): boolean {
  return (
    getHomeParticipant(match) === participantId ||
    getAwayParticipant(match) === participantId
  );
}

/**
 * Checks if match occurred before targetMatch in round sequence or leg sequence.
 */
function isPriorMatch(match: MatchForLock, targetMatch: MatchForLock): boolean {
  const matchRound = match.round ?? 1;
  const targetRound = targetMatch.round ?? 1;
  if (matchRound < targetRound) {
    return true;
  }
  if (matchRound === targetRound) {
    const matchLeg = match.leg ?? 1;
    const targetLeg = targetMatch.leg ?? 1;
    return matchLeg < targetLeg;
  }
  return false;
}

/**
 * Finds all matches from earlier rounds/legs involving the participant that are not CLOSED (RF-114).
 */
export function getParticipantBlockingMatches(
  allMatches: readonly MatchForLock[],
  targetMatch: MatchForLock,
  participantId: string
): MatchForLock[] {
  return allMatches.filter((m) => {
    if (m.id === targetMatch.id) return false;
    if (!isMatchInvolvingParticipant(m, participantId)) return false;
    if (!isPriorMatch(m, targetMatch)) return false;
    return m.status !== 'CLOSED';
  });
}

/**
 * Evaluates whether a specific participant is unlocked to play the target match (RF-114).
 * A player is blocked if they have any prior match in a state other than CLOSED.
 */
export function canParticipantPlayMatch(
  allMatches: readonly MatchForLock[],
  targetMatch: MatchForLock,
  participantId: string
): boolean {
  if (targetMatch.status === 'CLOSED' || targetMatch.isBye) {
    return false;
  }

  if (!isMatchInvolvingParticipant(targetMatch, participantId)) {
    return false;
  }

  const blocking = getParticipantBlockingMatches(
    allMatches,
    targetMatch,
    participantId
  );

  return blocking.length === 0;
}

/**
 * Validates whether targetMatch can be played according to sequential locking rules (RF-114, RF-115).
 * - Neither the Local nor the Away player may have unclosed matches in previous rounds/legs.
 * - Matches between other players do NOT block this match (RF-115 Desacoplamiento de Fecha Global).
 * - If specificParticipantId is supplied, evaluates only for that participant.
 */
export function canPlayerPlayMatch(
  allMatches: readonly MatchForLock[],
  targetMatch: MatchForLock,
  specificParticipantId?: string
): boolean {
  if (targetMatch.status === 'CLOSED' || targetMatch.isBye) {
    return false;
  }

  if (specificParticipantId) {
    return canParticipantPlayMatch(
      allMatches,
      targetMatch,
      specificParticipantId
    );
  }

  const homeId = getHomeParticipant(targetMatch);
  if (!homeId) {
    return false;
  }

  if (!canParticipantPlayMatch(allMatches, targetMatch, homeId)) {
    return false;
  }

  const awayId = getAwayParticipant(targetMatch);
  if (awayId && !canParticipantPlayMatch(allMatches, targetMatch, awayId)) {
    return false;
  }

  return true;
}

/**
 * Returns full lock evaluation with list of blocking matches and diagnostic reason.
 */
export function getMatchLockStatus(
  allMatches: readonly MatchForLock[],
  targetMatch: MatchForLock,
  specificParticipantId?: string
): LockEvaluationResult {
  if (targetMatch.status === 'CLOSED') {
    return {
      canPlay: false,
      reason: 'El partido ya se encuentra cerrado.',
      blockingMatches: [],
    };
  }

  if (targetMatch.isBye) {
    return {
      canPlay: false,
      reason: 'El cruce es un Pase Directo (Bye) auto-liquidado.',
      blockingMatches: [],
    };
  }

  const blockingMatches: MatchForLock[] = [];

  if (specificParticipantId) {
    blockingMatches.push(
      ...getParticipantBlockingMatches(
        allMatches,
        targetMatch,
        specificParticipantId
      )
    );
  } else {
    const homeId = getHomeParticipant(targetMatch);
    if (homeId) {
      blockingMatches.push(
        ...getParticipantBlockingMatches(allMatches, targetMatch, homeId)
      );
    }

    const awayId = getAwayParticipant(targetMatch);
    if (awayId) {
      const awayBlocking = getParticipantBlockingMatches(
        allMatches,
        targetMatch,
        awayId
      );
      for (const m of awayBlocking) {
        if (!blockingMatches.some((b) => b.id === m.id)) {
          blockingMatches.push(m);
        }
      }
    }
  }

  if (blockingMatches.length > 0) {
    return {
      canPlay: false,
      reason: `Bloqueado: existen ${blockingMatches.length} partido(s) previo(s) pendientes de cierre.`,
      blockingMatches,
    };
  }

  return {
    canPlay: true,
    blockingMatches: [],
  };
}

/**
 * Formats user-friendly Spanish diagnosis message explaining who must close their prior match (RF-114).
 */
export function formatSequentialLockMessage(
  nameA: string,
  nameB: string,
  blockingA: readonly MatchForLock[],
  blockingB: readonly MatchForLock[],
  targetRound: number
): string | null {
  if (blockingA.length > 0 && blockingB.length > 0) {
    return `Bloqueado: ${nameA} y ${nameB} deben cerrar sus partidos de fechas anteriores primero.`;
  }
  if (blockingA.length > 0) {
    const priorRound = blockingA[0].round ?? (targetRound - 1);
    return `Bloqueado: ${nameA} debe cerrar su partido de la Fecha ${priorRound} primero.`;
  }
  if (blockingB.length > 0) {
    const priorRound = blockingB[0].round ?? (targetRound - 1);
    return `Bloqueado: ${nameB} debe cerrar su partido de la Fecha ${priorRound} primero.`;
  }
  return null;
}

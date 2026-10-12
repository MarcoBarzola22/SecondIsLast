import type {
  LeagueMatch,
  LeagueStandingRow,
  PlayerId,
} from './types';

export interface PlayerQualificationDetails {
  playerId: PlayerId;
  isQualified: boolean;
  isEliminated: boolean;
  isChampionSecured: boolean;
  currentPoints: number;
  maxPoints: number;
  remainingMatchesCount: number;
}

export interface MatchScenarioGuidance {
  guidanceA: string | null;
  guidanceB: string | null;
}

/**
 * Calculates remaining matches count and maximum reachable points for each player.
 */
export function getRemainingMatchCounts(
  standings: readonly LeagueStandingRow[],
  remainingMatches: readonly LeagueMatch[]
): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = {};
  for (const row of standings) {
    counts[row.playerId] = 0;
  }

  for (const m of remainingMatches) {
    if (!m.confirmed) {
      if (counts[m.playerA] !== undefined) counts[m.playerA]++;
      if (counts[m.playerB] !== undefined) counts[m.playerB]++;
    }
  }

  return counts;
}

/**
 * Returns the maximum possible points a player can achieve.
 */
export function getMaxPossiblePoints(
  playerId: PlayerId,
  standings: readonly LeagueStandingRow[],
  remainingMatches: readonly LeagueMatch[]
): number {
  const row = standings.find((s) => s.playerId === playerId);
  if (!row) return 0;

  const matchCounts = getRemainingMatchCounts(standings, remainingMatches);
  const remaining = matchCounts[playerId] ?? 0;
  return row.pts + remaining * 3;
}

/**
 * Determines whether a participant is mathematically guaranteed to finish in the top K (qualifying spots)
 * regardless of the outcomes of all remaining matches (RF-74).
 *
 * A participant P is guaranteed to qualify if even in their worst-case scenario (0 additional points),
 * the number of rival participants who could possibly reach or surpass P's current points is strictly less than K.
 */
export function isPlayerMathematicallyQualified(
  playerId: PlayerId,
  standings: readonly LeagueStandingRow[],
  remainingMatches: readonly LeagueMatch[],
  qualifyingSpots: number
): boolean {
  const targetRow = standings.find((s) => s.playerId === playerId);
  if (!targetRow) return false;

  const currentPoints = targetRow.pts;
  const matchCounts = getRemainingMatchCounts(standings, remainingMatches);

  // Evaluate rivals (all players other than target player)
  const rivals = standings.filter((s) => s.playerId !== playerId);

  // Identify rivals whose independent maximum possible points can reach or exceed target player's points
  const threateningRivals = rivals.filter((r) => {
    const rMax = r.pts + (matchCounts[r.playerId] ?? 0) * 3;
    return rMax >= currentPoints;
  });

  // If the number of threatening rivals is strictly less than qualifyingSpots,
  // it is mathematically impossible for K rivals to finish ahead of P.
  if (threateningRivals.length < qualifyingSpots) {
    return true;
  }

  // Head-to-Head mutual collision check:
  // If rivals in threateningRivals play against each other, both cannot get 3 points from the same match.
  // We check if any outcome exists where at least K rivals reach >= currentPoints.
  const threateningIds = new Set(threateningRivals.map((r) => r.playerId));
  const unconfirmedThreatMatches = remainingMatches.filter(
    (m) =>
      !m.confirmed &&
      (threateningIds.has(m.playerA) || threateningIds.has(m.playerB))
  );

  // For small match sets (<= 8 matches), execute an exhaustive outcome simulation
  if (unconfirmedThreatMatches.length <= 8 && unconfirmedThreatMatches.length > 0) {
    const canKRivalsReachCurrentPoints = checkAnyOutcomeWhereKRivalsReachThreshold(
      standings,
      unconfirmedThreatMatches,
      threateningIds,
      currentPoints,
      qualifyingSpots
    );
    return !canKRivalsReachCurrentPoints;
  }

  return false;
}

/**
 * Helper that simulates all 3^M outcomes of remaining threat matches to verify
 * if at least K rivals can simultaneously reach the threshold.
 */
function checkAnyOutcomeWhereKRivalsReachThreshold(
  standings: readonly LeagueStandingRow[],
  matches: readonly LeagueMatch[],
  threateningIds: Set<PlayerId>,
  threshold: number,
  k: number
): boolean {
  const currentPts: Record<PlayerId, number> = {};
  for (const s of standings) {
    currentPts[s.playerId] = s.pts;
  }

  function simulate(matchIndex: number, ptsMap: Record<PlayerId, number>): boolean {
    if (matchIndex === matches.length) {
      let count = 0;
      for (const id of threateningIds) {
        if ((ptsMap[id] ?? 0) >= threshold) {
          count++;
          if (count >= k) return true;
        }
      }
      return false;
    }

    const match = matches[matchIndex]!;
    const pA = match.playerA;
    const pB = match.playerB;

    // Outcome 1: A wins (+3 to A, 0 to B)
    if (
      simulate(matchIndex + 1, {
        ...ptsMap,
        [pA]: (ptsMap[pA] ?? 0) + 3,
      })
    ) {
      return true;
    }

    // Outcome 2: Draw (+1 to A, +1 to B)
    if (
      simulate(matchIndex + 1, {
        ...ptsMap,
        [pA]: (ptsMap[pA] ?? 0) + 1,
        [pB]: (ptsMap[pB] ?? 0) + 1,
      })
    ) {
      return true;
    }

    // Outcome 3: B wins (0 to A, +3 to B)
    if (
      simulate(matchIndex + 1, {
        ...ptsMap,
        [pB]: (ptsMap[pB] ?? 0) + 3,
      })
    ) {
      return true;
    }

    return false;
  }

  return simulate(0, currentPts);
}

/**
 * Determines whether a player is mathematically eliminated from qualifying spots (RF-74, RF-83).
 * A player is eliminated if:
 * 1. The tournament regular phase is completely finished and they finished outside top qualifying spots, OR
 * 2. The number of rivals whose minimum guaranteed points (current points) strictly exceed target's maximum
 *    reachable points is greater than or equal to qualifyingSpots.
 */
export function isPlayerMathematicallyEliminated(
  playerId: PlayerId,
  standings: readonly LeagueStandingRow[],
  remainingMatches: readonly LeagueMatch[],
  qualifyingSpots: number
): boolean {
  const targetRow = standings.find((s) => s.playerId === playerId);
  if (!targetRow) return false;

  // If no unconfirmed matches remain at all in the tournament, final standing dictates qualification
  const hasAnyUnconfirmedMatch = remainingMatches.some((m) => !m.confirmed);
  if (!hasAnyUnconfirmedMatch && standings.length > 0) {
    const targetIndex = standings.findIndex((s) => s.playerId === playerId);
    return targetIndex >= qualifyingSpots;
  }

  const targetMax = getMaxPossiblePoints(playerId, standings, remainingMatches);
  const rivals = standings.filter((s) => s.playerId !== playerId);

  // Count rivals whose guaranteed minimum points (current points) already strictly exceed target's maximum points
  const rivalsAlreadyAhead = rivals.filter((r) => r.pts > targetMax);

  return rivalsAlreadyAhead.length >= qualifyingSpots;
}

/**
 * Calculates mathematical elimination status for all players in the standings (RF-83).
 * Returns a Record mapping each PlayerId to a boolean indicating whether they are mathematically eliminated.
 */
export function calculateMathematicalElimination(
  standings: readonly LeagueStandingRow[],
  remainingMatches: readonly LeagueMatch[],
  qualifyingSpots?: number
): Record<PlayerId, boolean> {
  const spots =
    qualifyingSpots !== undefined
      ? qualifyingSpots
      : standings.length <= 4
      ? 2
      : standings.length >= 10
      ? 8
      : 4;

  const result: Record<PlayerId, boolean> = {};
  for (const row of standings) {
    result[row.playerId] = isPlayerMathematicallyEliminated(
      row.playerId,
      standings,
      remainingMatches,
      spots
    );
  }

  return result;
}

/**
 * Calculates mathematical qualification status for all players in the standings (RF-74).
 * Returns a Record mapping each PlayerId to a boolean indicating whether they are mathematically qualified.
 */
export function calculateMathematicalQualification(
  standings: readonly LeagueStandingRow[],
  remainingMatches: readonly LeagueMatch[],
  qualifyingSpots?: number
): Record<PlayerId, boolean> {
  const spots =
    qualifyingSpots !== undefined
      ? qualifyingSpots
      : standings.length <= 4
      ? 2
      : standings.length >= 10
      ? 8
      : 4;

  const result: Record<PlayerId, boolean> = {};
  for (const row of standings) {
    result[row.playerId] = isPlayerMathematicallyQualified(
      row.playerId,
      standings,
      remainingMatches,
      spots
    );
  }

  return result;
}

/**
 * Returns detailed qualification information for each player.
 */
export function getDetailedQualificationStatus(
  standings: readonly LeagueStandingRow[],
  remainingMatches: readonly LeagueMatch[],
  qualifyingSpots?: number
): Record<PlayerId, PlayerQualificationDetails> {
  const spots =
    qualifyingSpots !== undefined
      ? qualifyingSpots
      : standings.length <= 4
      ? 2
      : standings.length >= 10
      ? 8
      : 4;

  const matchCounts = getRemainingMatchCounts(standings, remainingMatches);
  const result: Record<PlayerId, PlayerQualificationDetails> = {};

  for (const row of standings) {
    const isQualified = isPlayerMathematicallyQualified(
      row.playerId,
      standings,
      remainingMatches,
      spots
    );
    const isEliminated = isPlayerMathematicallyEliminated(
      row.playerId,
      standings,
      remainingMatches,
      spots
    );
    const isChampionSecured = isPlayerMathematicallyQualified(
      row.playerId,
      standings,
      remainingMatches,
      1
    );
    const remaining = matchCounts[row.playerId] ?? 0;

    result[row.playerId] = {
      playerId: row.playerId,
      isQualified,
      isEliminated,
      isChampionSecured,
      currentPoints: row.pts,
      maxPoints: row.pts + remaining * 3,
      remainingMatchesCount: remaining,
    };
  }

  return result;
}

/**
 * Simulates a single match outcome on the standings table.
 */
function simulateMatchOutcome(
  standings: readonly LeagueStandingRow[],
  match: LeagueMatch,
  goalsA: number,
  goalsB: number
): LeagueStandingRow[] {
  return standings.map((row) => {
    if (row.playerId !== match.playerA && row.playerId !== match.playerB) {
      return row;
    }

    const isA = row.playerId === match.playerA;
    const gf = isA ? goalsA : goalsB;
    const gc = isA ? goalsB : goalsA;

    const win = gf > gc;
    const draw = gf === gc;
    const loss = gf < gc;

    const addedPts = win ? 3 : draw ? 1 : 0;

    return {
      ...row,
      pts: row.pts + addedPts,
      pj: row.pj + 1,
      pg: row.pg + (win ? 1 : 0),
      pe: row.pe + (draw ? 1 : 0),
      pp: row.pp + (loss ? 1 : 0),
      gf: row.gf + gf,
      gc: row.gc + gc,
      dg: row.dg + (gf - gc),
    };
  });
}

/**
 * Computes context-aware smart guidance messages for both players in a match (RF-75).
 * Evaluates qualification scenarios, 1st place guarantees, direct goal difference duels,
 * and elimination risks.
 */
export function getMatchScenarioGuidance(
  match: LeagueMatch,
  standings: readonly LeagueStandingRow[],
  remainingMatches: readonly LeagueMatch[],
  qualifyingSpots?: number
): MatchScenarioGuidance {
  const spots =
    qualifyingSpots !== undefined
      ? qualifyingSpots
      : standings.length <= 4
      ? 2
      : standings.length >= 10
      ? 8
      : 4;

  const rowA = standings.find((s) => s.playerId === match.playerA);
  const rowB = standings.find((s) => s.playerId === match.playerB);

  if (!rowA || !rowB || match.confirmed) {
    return { guidanceA: null, guidanceB: null };
  }

  const remainingWithoutCurrent = remainingMatches.filter(
    (m) => m.id !== match.id && !m.confirmed
  );

  const guidanceA = derivePlayerGuidance(
    rowA,
    rowB,
    match,
    standings,
    remainingWithoutCurrent,
    spots
  );

  const guidanceB = derivePlayerGuidance(
    rowB,
    rowA,
    {
      ...match,
      playerA: match.playerB,
      playerB: match.playerA,
    },
    standings,
    remainingWithoutCurrent,
    spots
  );

  return { guidanceA, guidanceB };
}

function derivePlayerGuidance(
  player: LeagueStandingRow,
  rival: LeagueStandingRow,
  match: LeagueMatch,
  standings: readonly LeagueStandingRow[],
  remainingWithoutCurrent: readonly LeagueMatch[],
  spots: number
): string | null {
  const pId = player.playerId;
  const isAlreadyEliminated = isPlayerMathematicallyEliminated(
    pId,
    standings,
    [match, ...remainingWithoutCurrent],
    spots
  );

  if (isAlreadyEliminated) {
    return 'Eliminado matemáticamente';
  }

  const isAlreadyQualified = isPlayerMathematicallyQualified(
    pId,
    standings,
    [match, ...remainingWithoutCurrent],
    spots
  );

  const isAlreadyChampion = isPlayerMathematicallyQualified(
    pId,
    standings,
    [match, ...remainingWithoutCurrent],
    1
  );

  // 1. Player is already Champion secured
  if (isAlreadyChampion) {
    return '1° puesto asegurado';
  }

  // 2. Player is already qualified for the playoffs/podium
  if (isAlreadyQualified) {
    // Check if winning this match secures 1st place
    const simWinTable = simulateMatchOutcome(standings, match, 1, 0);
    const winSecures1st = isPlayerMathematicallyQualified(
      pId,
      simWinTable,
      remainingWithoutCurrent,
      1
    );

    if (winSecures1st) {
      return 'Con un triunfo asegura el 1° puesto';
    }

    return 'Ya clasificado';
  }

  // 3. Player is not yet qualified: evaluate Draw
  const simDrawTable = simulateMatchOutcome(standings, match, 0, 0);
  const drawQualifies = isPlayerMathematicallyQualified(
    pId,
    simDrawTable,
    remainingWithoutCurrent,
    spots
  );

  if (drawQualifies) {
    return spots === 1
      ? 'Con un empate asegura el 1° puesto'
      : 'Un empate le asegura clasificar';
  }

  // 4. Evaluate Win
  const simWinTable = simulateMatchOutcome(standings, match, 1, 0);
  const winQualifies = isPlayerMathematicallyQualified(
    pId,
    simWinTable,
    remainingWithoutCurrent,
    spots
  );

  if (winQualifies) {
    return spots === 1
      ? 'Con un triunfo asegura el 1° puesto'
      : 'Con un triunfo asegura la clasificación';
  }

  // 5. Direct Goal Difference duel against rival in this match
  // If rival is 3 points ahead with superior or equal DG
  const ptsDiff = rival.pts - player.pts;
  const rivalName = rival.displayName ? rival.displayName.split(',')[0]?.trim() ?? 'su rival' : 'su rival';

  if (ptsDiff === 3) {
    const dgDiff = rival.dg - player.dg;
    if (dgDiff >= 0) {
      const goalsNeeded = Math.floor(dgDiff / 2) + 1;
      if (goalsNeeded > 1) {
        return `Necesita ganar por ${goalsNeeded} goles para superar a ${rivalName} en DG`;
      }
      return `Con un triunfo supera a ${rivalName} en la tabla`;
    }
  }

  // 6. Evaluate Loss (risk of mathematical elimination)
  const simLossTable = simulateMatchOutcome(standings, match, 0, 1);
  const lossEliminates = isPlayerMathematicallyEliminated(
    pId,
    simLossTable,
    remainingWithoutCurrent,
    spots
  );

  if (lossEliminates) {
    return 'Obligado a ganar para seguir con chances';
  }

  // 7. General positive guidance if climbing into qualifying zone
  const currentRank = player.rank ?? standings.findIndex((s) => s.playerId === pId) + 1;
  if (currentRank > spots) {
    const sortedSimWin = [...simWinTable].sort((a, b) => b.pts - a.pts || b.dg - a.dg);
    const simRank = sortedSimWin.findIndex((s) => s.playerId === pId) + 1;
    if (simRank <= spots) {
      return 'Un triunfo lo mete en zona de clasificación';
    }
  }

  return 'Necesita sumar para mantener chances';
}

/**
 * Checks whether the current round is within the final 2 or 3 rounds of the regular season (RF-75).
 */
export function isLastRounds(round: number, totalRounds: number): boolean {
  if (totalRounds <= 3) return true;
  return totalRounds - round < 3;
}

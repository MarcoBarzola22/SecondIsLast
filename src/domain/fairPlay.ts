import type { CardCounts, LeagueMatch, PlayerId } from './types';

/**
 * Validates that a card count is an integer between 0 and 99 (RF-61).
 */
export function isValidCardCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 99
  );
}

/**
 * Returns default empty card counts (0 yellow, 0 red).
 */
export function createDefaultCardCounts(): CardCounts {
  return { yellow: 0, red: 0 };
}

export interface StandingRowForTiebreak {
  playerId: PlayerId;
  displayName: string;
  pts: number;
  dg: number;
  pg: number;
  yellowCards?: number;
  redCards?: number;
  rank?: number;
  [key: string]: any;
}

/**
 * Sorts standing rows according to the strict tie-breaking hierarchy (RF-62, D20):
 * 1) Puntos (PTS desc)
 * 2) Diferencia de Goles general (DG desc)
 * 3) Duelo Directo (H2H entre los empatados en PTS y DG):
 *    - Puntos en partidos directos entre los involucrados (h2hPts desc)
 *    - Diferencia de goles en partidos directos entre los involucrados (h2hDg desc)
 *    - Si un subconjunto sigue empatado, se re-aplica recursivamente H2H
 * 4) Mayor cantidad de Partidos Ganados (PG desc)
 * 5) Menor cantidad de Tarjetas Rojas (TR asc)
 * 6) Menor cantidad de Tarjetas Amarillas (TA asc)
 * 7) Desempate alfabético por Apellido/Nombre (displayName asc)
 *
 * Returns a new array with immutable updates and recalculated rank (1..N).
 */
export function sortStandingsWithFairPlay<T extends StandingRowForTiebreak>(
  rows: readonly T[],
  matches: readonly LeagueMatch[] = []
): T[] {
  if (rows.length <= 1) {
    return rows.map((r, idx) => ({ ...r, rank: idx + 1 }));
  }

  // 1) Group by points descending
  const byPts = groupBy(rows, (r) => r.pts);
  const sortedPts = Array.from(byPts.keys()).sort((a, b) => b - a);

  const result: T[] = [];

  for (const pts of sortedPts) {
    const ptsGroup = byPts.get(pts)!;

    if (ptsGroup.length === 1) {
      result.push(ptsGroup[0]!);
      continue;
    }

    // 2) Group by DG descending within the same points
    const byDg = groupBy(ptsGroup, (r) => r.dg);
    const sortedDg = Array.from(byDg.keys()).sort((a, b) => b - a);

    for (const dg of sortedDg) {
      const dgGroup = byDg.get(dg)!;

      if (dgGroup.length === 1) {
        result.push(dgGroup[0]!);
        continue;
      }

      // 3) Resolve H2H and subsequent criteria among players tied on PTS and DG
      const resolved = resolveH2HTiebreak(dgGroup, matches);
      result.push(...resolved);
    }
  }

  return result.map((r, idx) => ({
    ...r,
    rank: idx + 1,
  }));
}

/**
 * Evaluates head-to-head results for a subgroup tied on general PTS and DG.
 */
function resolveH2HTiebreak<T extends StandingRowForTiebreak>(
  tiedGroup: T[],
  matches: readonly LeagueMatch[]
): T[] {
  if (tiedGroup.length <= 1) {
    return tiedGroup;
  }

  const tiedIds = new Set(tiedGroup.map((r) => r.playerId));

  // Find all confirmed matches between members of this tied group
  const h2hMatches = matches.filter(
    (m) =>
      m.confirmed &&
      m.scoreA !== null &&
      m.scoreB !== null &&
      tiedIds.has(m.playerA) &&
      tiedIds.has(m.playerB)
  );

  // Compute H2H stats for each player in this tied group
  const h2hStats = new Map<PlayerId, { pts: number; dg: number }>();
  for (const r of tiedGroup) {
    h2hStats.set(r.playerId, { pts: 0, dg: 0 });
  }

  for (const m of h2hMatches) {
    const statA = h2hStats.get(m.playerA)!;
    const statB = h2hStats.get(m.playerB)!;
    const scoreA = m.scoreA!;
    const scoreB = m.scoreB!;

    statA.dg += scoreA - scoreB;
    statB.dg += scoreB - scoreA;

    if (scoreA > scoreB) {
      statA.pts += 3;
    } else if (scoreB > scoreA) {
      statB.pts += 3;
    } else {
      statA.pts += 1;
      statB.pts += 1;
    }
  }

  // Check if H2H provides any differentiation
  const firstStat = h2hStats.get(tiedGroup[0]!.playerId)!;
  const allIdentical =
    h2hMatches.length === 0 ||
    tiedGroup.every((r) => {
      const s = h2hStats.get(r.playerId)!;
      return s.pts === firstStat.pts && s.dg === firstStat.dg;
    });

  if (allIdentical) {
    // H2H cannot separate this entire group; proceed to criteria 4, 5, 6, 7
    return resolveRemainingCriteria(tiedGroup);
  }

  // Sort subgroup by H2H points desc, then H2H DG desc
  const sorted = [...tiedGroup].sort((a, b) => {
    const statA = h2hStats.get(a.playerId)!;
    const statB = h2hStats.get(b.playerId)!;

    if (statB.pts !== statA.pts) return statB.pts - statA.pts;
    if (statB.dg !== statA.dg) return statB.dg - statA.dg;
    return 0;
  });

  // Group by (pts, dg) in H2H
  const groupedH2H: T[][] = [];
  let currentGroup: T[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const prevStat = h2hStats.get(sorted[i - 1]!.playerId)!;
    const currStat = h2hStats.get(sorted[i]!.playerId)!;

    if (prevStat.pts === currStat.pts && prevStat.dg === currStat.dg) {
      currentGroup.push(sorted[i]!);
    } else {
      groupedH2H.push(currentGroup);
      currentGroup = [sorted[i]!];
    }
  }
  groupedH2H.push(currentGroup);

  const result: T[] = [];
  for (const group of groupedH2H) {
    if (group.length === 1) {
      result.push(group[0]!);
    } else if (group.length < tiedGroup.length) {
      // Re-apply H2H recursively exclusively on the smaller subset still tied
      result.push(...resolveH2HTiebreak(group, matches));
    } else {
      result.push(...resolveRemainingCriteria(group));
    }
  }

  return result;
}

/**
 * Resolves remaining criteria when PTS, DG, and H2H are tied:
 * 4) PG desc
 * 5) TR asc
 * 6) TA asc
 * 7) Apellido/Nombre asc
 */
function resolveRemainingCriteria<T extends StandingRowForTiebreak>(group: T[]): T[] {
  return [...group].sort((a, b) => {
    // 4) Mayor cantidad de partidos ganados (PG desc)
    if (b.pg !== a.pg) {
      return b.pg - a.pg;
    }

    // 5) Menor cantidad de Tarjetas Rojas (TR asc)
    const redA = a.redCards ?? 0;
    const redB = b.redCards ?? 0;
    if (redA !== redB) {
      return redA - redB;
    }

    // 6) Menor cantidad de Tarjetas Amarillas (TA asc)
    const yellowA = a.yellowCards ?? 0;
    const yellowB = b.yellowCards ?? 0;
    if (yellowA !== yellowB) {
      return yellowA - yellowB;
    }

    // 7) Desempate alfabético por Apellido/Nombre
    return a.displayName.localeCompare(b.displayName, 'es');
  });
}

function groupBy<T, K>(list: readonly T[], getKey: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of list) {
    const key = getKey(item);
    const collection = map.get(key);
    if (!collection) {
      map.set(key, [item]);
    } else {
      collection.push(item);
    }
  }
  return map;
}

export interface SuspensionCalculation {
  suspendedCount: number;
  yellowAccumulated: number;
  redPending: number;
  yellowCycle: number;
  motivo: string;
  isSuspended: boolean;
}

/**
 * Calculates disciplinary suspension status ("Mejor jugador afuera")
 * for accumulated yellow cards and pending red cards (T46 · RF-Sanciones).
 *
 * Rules:
 * - 4 yellow cards = 1 best player suspended for next match.
 * - Each red card = 1 best player suspended for next match.
 * - Sanciones sum: floor(yellows / 4) + reds.
 */
export function calculateSuspensionInfo(
  pendingYellowCards = 0,
  pendingRedCards = 0
): SuspensionCalculation {
  const yellowSuspensions = Math.floor(pendingYellowCards / 4);
  const redSuspensions = pendingRedCards;
  const suspendedCount = yellowSuspensions + redSuspensions;
  const yellowCycle = pendingYellowCards % 4;

  let motivo = '';
  if (yellowSuspensions > 0 && redSuspensions === 0) {
    motivo = yellowSuspensions === 1 ? '4 Amarillas acumuladas' : `${yellowSuspensions * 4} Amarillas acumuladas`;
  } else if (redSuspensions > 0 && yellowSuspensions === 0) {
    motivo = redSuspensions === 1 ? '1 Tarjeta Roja' : `${redSuspensions} Tarjetas Rojas`;
  } else if (yellowSuspensions > 0 && redSuspensions > 0) {
    motivo = `${yellowSuspensions === 1 ? '4 Amarillas' : `${yellowSuspensions * 4} Amarillas`} y ${redSuspensions === 1 ? '1 Roja' : `${redSuspensions} Rojas`}`;
  }

  return {
    suspendedCount,
    yellowAccumulated: pendingYellowCards,
    redPending: pendingRedCards,
    yellowCycle,
    motivo,
    isSuspended: suspendedCount >= 1,
  };
}

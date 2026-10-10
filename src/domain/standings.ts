import { formatPlayerName } from './players';
import { getSeriesResult } from './series';
import type {
  ActiveTournament,
  MatchFormat,
  Player,
  PlayerId,
  PlayerStats,
  Podium,
  Series,
  StandingsRow,
} from './types';

/**
 * Derives the tournament podium (Champion, RunnerUp, 3rd, 4th) from confirmed F and TP series (RF-30).
 */
export function getPodium(
  seriesList: readonly Series[],
  matchFormat: MatchFormat = 'two_legged'
): Podium {
  const finalSeries = seriesList.find((s) => s.id === 'F');
  const thirdPlaceSeries = seriesList.find((s) => s.id === 'TP');

  if (!finalSeries || !finalSeries.confirmed) {
    throw new Error('La Final debe estar confirmada para obtener el podio.');
  }
  if (!thirdPlaceSeries || !thirdPlaceSeries.confirmed) {
    throw new Error(
      'El partido por el 3er Puesto debe estar confirmado para obtener el podio.'
    );
  }

  // 1. Try with specified match format
  let finalRes = getSeriesResult(finalSeries, matchFormat);
  if (!finalRes.winner) {
    const altFormat: MatchFormat =
      matchFormat === 'two_legged' ? 'single_match' : 'two_legged';
    const altRes = getSeriesResult(finalSeries, altFormat);
    if (altRes.winner) {
      finalRes = altRes;
    }
  }

  let thirdRes = getSeriesResult(thirdPlaceSeries, matchFormat);
  if (!thirdRes.winner) {
    const altFormat: MatchFormat =
      matchFormat === 'two_legged' ? 'single_match' : 'two_legged';
    const altRes = getSeriesResult(thirdPlaceSeries, altFormat);
    if (altRes.winner) {
      thirdRes = altRes;
    }
  }

  // 2. Extract winner and loser using getSeriesResult, or fallback to persisted series.winner/loser, or participants
  const champion =
    finalRes.winner ??
    finalSeries.winner ??
    finalSeries.playerA;

  const runnerUp =
    finalRes.loser ??
    finalSeries.loser ??
    (champion === finalSeries.playerA ? finalSeries.playerB : finalSeries.playerA);

  const third =
    thirdRes.winner ??
    thirdPlaceSeries.winner ??
    thirdPlaceSeries.playerA;

  const fourth =
    thirdRes.loser ??
    thirdPlaceSeries.loser ??
    (third === thirdPlaceSeries.playerA ? thirdPlaceSeries.playerB : thirdPlaceSeries.playerA);

  if (!champion || !runnerUp) {
    throw new Error('La Final no tiene ganador o perdedor definido.');
  }
  if (!third || !fourth) {
    throw new Error(
      'El partido por el 3er Puesto no tiene ganador o perdedor definido.'
    );
  }

  return {
    champion,
    runnerUp,
    third,
    fourth,
  };
}

function createEmptyPlayerStats(playerId: PlayerId): PlayerStats {
  return {
    playerId,
    pts: 0,
    pj: 0,
    pg: 0,
    pp: 0,
    gf: 0,
    gc: 0,
    tj: 0,
  };
}

/**
 * Computes tournament statistical deltas for all participants (RF-31, RF-32).
 * Points: Champion +10, RunnerUp +7, 3rd +5, 4th +3, Quarterfinal losers +1.
 * Matches: Each series = 1 PJ, 1 PG/PP. Aggregates GF/GC across both legs (or single leg if single_match). TJ = 1.
 */
export function computeTournamentStats(
  tournament: Pick<ActiveTournament, 'participantIds' | 'series'> & {
    matchFormat?: MatchFormat;
  }
): { stats: Record<PlayerId, PlayerStats>; podium: Podium } {
  const matchFormat = tournament.matchFormat ?? 'two_legged';
  const podium = getPodium(tournament.series, matchFormat);

  const deltas: Record<PlayerId, PlayerStats> = {};
  for (const id of tournament.participantIds) {
    deltas[id] = {
      ...createEmptyPlayerStats(id),
      tj: 1, // RF-31: +1 TJ for every participant
    };
  }

  // 1. Assign position points (PTS)
  if (deltas[podium.champion]) deltas[podium.champion].pts += 10;
  if (deltas[podium.runnerUp]) deltas[podium.runnerUp].pts += 7;
  if (deltas[podium.third]) deltas[podium.third].pts += 5;
  if (deltas[podium.fourth]) deltas[podium.fourth].pts += 3;

  // Quarterfinal losers (+1 PTS)
  for (const s of tournament.series) {
    if (s.round === 'quarterfinal' && s.confirmed) {
      const res = getSeriesResult(s, matchFormat);
      if (res.loser && deltas[res.loser]) {
        deltas[res.loser].pts += 1;
      }
    }
  }

  // 2. Accumulate match performance (PJ, PG, PP, GF, GC) across all confirmed series (including TP, RF-32)
  const isSingleMatch = matchFormat === 'single_match';
  for (const s of tournament.series) {
    if (!s.confirmed || !s.playerA || !s.playerB) {
      continue;
    }

    const res = getSeriesResult(s, matchFormat);
    const { playerA, playerB } = s;

    const goalsA = (s.leg1.a ?? 0) + (isSingleMatch ? 0 : (s.leg2.a ?? 0));
    const goalsB = (s.leg1.b ?? 0) + (isSingleMatch ? 0 : (s.leg2.b ?? 0));

    // Player A stats for this series
    if (deltas[playerA]) {
      deltas[playerA].pj += 1;
      deltas[playerA].gf += goalsA;
      deltas[playerA].gc += goalsB;
      if (res.winner === playerA) deltas[playerA].pg += 1;
      if (res.loser === playerA) deltas[playerA].pp += 1;
    }

    // Player B stats for this series
    if (deltas[playerB]) {
      deltas[playerB].pj += 1;
      deltas[playerB].gf += goalsB;
      deltas[playerB].gc += goalsA;
      if (res.winner === playerB) deltas[playerB].pg += 1;
      if (res.loser === playerB) deltas[playerB].pp += 1;
    }
  }

  return { stats: deltas, podium };
}


/**
 * Purely merges tournament stats delta into existing historical stats (RF-31).
 */
export function applyStats(
  baseStats: Record<PlayerId, PlayerStats>,
  deltaStats: Record<PlayerId, PlayerStats>
): Record<PlayerId, PlayerStats> {
  const result: Record<PlayerId, PlayerStats> = {};

  // Copy existing
  for (const [id, stats] of Object.entries(baseStats)) {
    result[id] = { ...stats };
  }

  // Add deltas
  for (const [id, delta] of Object.entries(deltaStats)) {
    const current = result[id] ?? createEmptyPlayerStats(id);
    result[id] = {
      playerId: id,
      pts: current.pts + delta.pts,
      pj: current.pj + delta.pj,
      pg: current.pg + delta.pg,
      pp: current.pp + delta.pp,
      gf: current.gf + delta.gf,
      gc: current.gc + delta.gc,
      tj: current.tj + delta.tj,
    };
  }

  return result;
}

/**
 * Builds the official historical standings table (RF-34 to RF-37).
 * - Filters to players with TJ >= 1 (RF-37).
 * - Formats name as "Apellido, Nombre" (RF-35).
 * - Sorts by: PTS desc, DG desc, GF desc, LastName asc (RF-36).
 * - Assigns rank 1..N.
 */
export function buildStandings(
  players: readonly Player[],
  stats: Record<PlayerId, PlayerStats>
): StandingsRow[] {
  const playersMap = new Map(players.map((p) => [p.id, p]));

  const qualified: Array<{ stats: PlayerStats; player: Player; dg: number }> =
    [];

  for (const [playerId, s] of Object.entries(stats)) {
    if (s.tj < 1) continue; // RF-37: Only TJ >= 1
    const p = playersMap.get(playerId);
    if (!p) continue;

    qualified.push({
      stats: s,
      player: p,
      dg: s.gf - s.gc,
    });
  }

  // Sort according to RF-36
  qualified.sort((a, b) => {
    if (b.stats.pts !== a.stats.pts) {
      return b.stats.pts - a.stats.pts;
    }
    if (b.dg !== a.dg) {
      return b.dg - a.dg;
    }
    if (b.stats.gf !== a.stats.gf) {
      return b.stats.gf - a.stats.gf;
    }
    // Alphabetical by last name in Spanish
    return a.player.lastName.localeCompare(b.player.lastName, 'es');
  });

  return qualified.map((item, index) => ({
    ...item.stats,
    rank: index + 1,
    displayName: formatPlayerName(item.player),
    dg: item.dg,
  }));
}

/**
 * Removes a player's statistics record from historical stats (RF-46).
 * Pure function: returns a new object without mutating the input.
 */
export function removePlayerStats(
  stats: Record<PlayerId, PlayerStats>,
  playerId: PlayerId
): Record<PlayerId, PlayerStats> {
  const next = { ...stats };
  delete next[playerId];
  return next;
}

/**
 * Resets all accumulated standings statistics to an empty record (RF-47).
 * Pure function.
 */
export function resetStandings(): Record<PlayerId, PlayerStats> {
  return {};
}


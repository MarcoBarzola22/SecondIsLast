import { formatPlayerName } from './players';
import { shuffle } from './random';
import { isValidGoal } from './series';
import type {
  LeagueMatch,
  LeagueStandingRow,
  MatchFormat,
  Player,
  PlayerId,
  PlayerStats,
  Podium,
} from './types';

const BYE_PLAYER: PlayerId = '__BYE__';

/**
 * Generates a full single-round or double-round Round Robin fixture (Berger algorithm)
 * for 4 to 10 participants (RF-49, RF-50).
 *
 * Single match:
 * - 4 players: 3 rounds of 2 matches = 6 matches.
 * - 5 players: 5 rounds of 2 matches (1 bye per round) = 10 matches.
 * - 6 players: 5 rounds of 3 matches = 15 matches.
 * - 7 players: 7 rounds of 3 matches (1 bye per round) = 21 matches.
 * - 8 players: 7 rounds of 4 matches = 28 matches.
 * - 9 players: 9 rounds of 4 matches (1 bye per round) = 36 matches.
 * - 10 players: 9 rounds of 5 matches = 45 matches.
 *
 * Two-legged (Doble Round Robin):
 * - 4 players: 6 rounds of 2 matches = 12 matches.
 * - 5 players: 10 rounds of 2 matches (1 bye per round) = 20 matches.
 * - 6 players: 10 rounds of 3 matches = 30 matches.
 * - 7 players: 14 rounds of 3 matches (1 bye per round) = 42 matches.
 * - 8 players: 14 rounds of 4 matches = 56 matches.
 * - 9 players: 18 rounds of 4 matches (1 bye per round) = 72 matches.
 * - 10 players: 18 rounds of 5 matches = 90 matches.
 */
export function generateLeagueFixture(
  participantIds: readonly PlayerId[],
  matchFormatOrRng: MatchFormat | (() => number) = 'single_match',
  maybeRng: () => number = Math.random
): LeagueMatch[] {
  const matchFormat: MatchFormat =
    typeof matchFormatOrRng === 'string' ? matchFormatOrRng : 'single_match';
  const rng: () => number =
    typeof matchFormatOrRng === 'function' ? matchFormatOrRng : maybeRng;

  const count = participantIds.length;
  if (count < 4 || count > 10) {
    throw new Error(
      `Cantidad inválida de participantes para liga: ${count}. Debe ser entre 4 y 10.`
    );
  }

  // Shuffle participants to randomize initial seeding
  const seeded = shuffle(participantIds, rng);

  // If odd (5 players), add a BYE dummy player
  const players: PlayerId[] = [...seeded];
  if (players.length % 2 !== 0) {
    players.push(BYE_PLAYER);
  }

  const n = players.length;
  const totalRounds = n - 1;
  const half = n / 2;
  const matches: LeagueMatch[] = [];

  // Working array of player indices for standard Berger rotation
  const rotation: PlayerId[] = [...players];

  for (let round = 1; round <= totalRounds; round++) {
    let matchInRound = 1;

    for (let i = 0; i < half; i++) {
      const p1 = rotation[i]!;
      const p2 = rotation[n - 1 - i]!;

      // Skip the bye match if either participant is dummy
      if (p1 === BYE_PLAYER || p2 === BYE_PLAYER) {
        continue;
      }

      // Alternate home and away across rounds for fairness
      const isEvenRound = round % 2 === 0;
      const home = (i === 0 ? isEvenRound : !isEvenRound) ? p2 : p1;
      const away = (i === 0 ? isEvenRound : !isEvenRound) ? p1 : p2;

      matches.push({
        id: `R${round}_M${matchInRound}`,
        round,
        playerA: home,
        playerB: away,
        scoreA: null,
        scoreB: null,
        confirmed: false,
      });

      matchInRound++;
    }

    // Rotate elements 1..n-1 (keep index 0 fixed)
    const last = rotation[n - 1]!;
    for (let k = n - 1; k > 1; k--) {
      rotation[k] = rotation[k - 1]!;
    }
    rotation[1] = last;
  }

  if (matchFormat === 'two_legged') {
    const secondLegMatches: LeagueMatch[] = matches.map((m) => {
      const matchInRound = m.id.split('_')[1];
      const secondRound = m.round + totalRounds;
      return {
        id: `R${secondRound}_${matchInRound}`,
        round: secondRound,
        playerA: m.playerB,
        playerB: m.playerA,
        scoreA: null,
        scoreB: null,
        confirmed: false,
      };
    });

    return [...matches, ...secondLegMatches];
  }

  return matches;
}

/**
 * Updates match scores. Pure update returning a new list of matches (RF-51).
 */
export function setLeagueMatchScore(
  matches: readonly LeagueMatch[],
  matchId: string,
  scoreA: number | null,
  scoreB: number | null
): LeagueMatch[] {
  if (scoreA !== null && !isValidGoal(scoreA)) {
    throw new Error(
      `Goles inválidos: ${scoreA}. Deben ser números enteros entre 0 y 99.`
    );
  }
  if (scoreB !== null && !isValidGoal(scoreB)) {
    throw new Error(
      `Goles inválidos: ${scoreB}. Deben ser números enteros entre 0 y 99.`
    );
  }

  return matches.map((m) =>
    m.id === matchId ? { ...m, scoreA, scoreB } : m
  );
}

/**
 * Confirms a league match once both scores are loaded (RF-51).
 */
export function confirmLeagueMatch(
  matches: readonly LeagueMatch[],
  matchId: string
): LeagueMatch[] {
  const target = matches.find((m) => m.id === matchId);
  if (!target) {
    throw new Error(`Partido de liga no encontrado: ${matchId}`);
  }

  if (target.scoreA === null || target.scoreB === null) {
    throw new Error('No se puede confirmar el partido sin cargar ambos goles.');
  }

  return matches.map((m) =>
    m.id === matchId ? { ...m, confirmed: true } : m
  );
}

/**
 * Reopens a confirmed league match for correction (RF-54).
 */
export function reopenLeagueMatch(
  matches: readonly LeagueMatch[],
  matchId: string
): LeagueMatch[] {
  return matches.map((m) =>
    m.id === matchId ? { ...m, confirmed: false } : m
  );
}

/**
 * Checks if all scheduled matches of the league are confirmed (RF-55).
 */
export function isLeagueComplete(matches: readonly LeagueMatch[]): boolean {
  return matches.length > 0 && matches.every((m) => m.confirmed);
}

/**
 * Computes the live standings table for the active league (RF-53).
 * Rules: PG = 3 pts, PE = 1 pt, PP = 0 pts.
 * Sorting: PTS desc -> DG desc -> GF desc -> Name asc.
 */
export function computeLeagueTable(
  matches: readonly LeagueMatch[],
  participantIds: readonly PlayerId[],
  teams?: Record<PlayerId, string>,
  players?: readonly Player[]
): LeagueStandingRow[] {
  const playersMap = new Map(players?.map((p) => [p.id, p]));

  const records: Record<
    PlayerId,
    {
      playerId: PlayerId;
      pts: number;
      pj: number;
      pg: number;
      pe: number;
      pp: number;
      gf: number;
      gc: number;
    }
  > = {};

  for (const id of participantIds) {
    records[id] = {
      playerId: id,
      pts: 0,
      pj: 0,
      pg: 0,
      pe: 0,
      pp: 0,
      gf: 0,
      gc: 0,
    };
  }

  for (const m of matches) {
    if (!m.confirmed || m.scoreA === null || m.scoreB === null) {
      continue;
    }

    const { playerA, playerB, scoreA, scoreB } = m;

    if (records[playerA]) {
      records[playerA].pj += 1;
      records[playerA].gf += scoreA;
      records[playerA].gc += scoreB;

      if (scoreA > scoreB) {
        records[playerA].pg += 1;
        records[playerA].pts += 3;
      } else if (scoreA === scoreB) {
        records[playerA].pe += 1;
        records[playerA].pts += 1;
      } else {
        records[playerA].pp += 1;
      }
    }

    if (records[playerB]) {
      records[playerB].pj += 1;
      records[playerB].gf += scoreB;
      records[playerB].gc += scoreA;

      if (scoreB > scoreA) {
        records[playerB].pg += 1;
        records[playerB].pts += 3;
      } else if (scoreA === scoreB) {
        records[playerB].pe += 1;
        records[playerB].pts += 1;
      } else {
        records[playerB].pp += 1;
      }
    }
  }

  const rows = participantIds.map((id) => {
    const stat = records[id]!;
    const playerObj = playersMap.get(id);
    const displayName = playerObj ? formatPlayerName(playerObj) : id;
    const team = teams?.[id] ?? '';
    const dg = stat.gf - stat.gc;

    return {
      playerId: id,
      displayName,
      team,
      pts: stat.pts,
      pj: stat.pj,
      pg: stat.pg,
      pe: stat.pe,
      pp: stat.pp,
      gf: stat.gf,
      gc: stat.gc,
      dg,
      rank: 1, // Will be set after sorting
    };
  });

  // Sort: PTS desc -> DG desc -> GF desc -> displayName asc
  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.displayName.localeCompare(b.displayName, 'es');
  });

  return rows.map((r, idx) => ({
    ...r,
    rank: idx + 1,
  }));
}

/**
 * Extracts the top 4 positions of the league table to build the tournament podium (RF-55).
 */
export function getLeaguePodium(standings: readonly LeagueStandingRow[]): Podium {
  if (standings.length < 4) {
    throw new Error('Se requieren al menos 4 participantes para conformar el podio.');
  }

  return {
    champion: standings[0]!.playerId,
    runnerUp: standings[1]!.playerId,
    third: standings[2]!.playerId,
    fourth: standings[3]!.playerId,
  };
}

/**
 * Computes historical tournament statistics deltas for participants in a completed league (RF-31, RF-55).
 * - Position Points: Champion +10, RunnerUp +7, 3rd +5, 4th +3, 5th/6th +1.
 * - Match stats: PJ, PG, PP (drawn matches count toward PJ but not PG or PP), GF, GC. TJ = 1.
 */
export function computeLeagueTournamentStats(
  participantIds: readonly PlayerId[],
  matches: readonly LeagueMatch[],
  teams?: Record<PlayerId, string>,
  players?: readonly Player[]
): { stats: Record<PlayerId, PlayerStats>; podium: Podium } {
  if (!isLeagueComplete(matches)) {
    throw new Error(
      'Todos los partidos de la liga deben estar confirmados para calcular estadísticas.'
    );
  }

  const table = computeLeagueTable(matches, participantIds, teams, players);
  const podium = getLeaguePodium(table);

  const deltas: Record<PlayerId, PlayerStats> = {};
  for (const row of table) {
    let positionPts = 1; // Default for 5th and 6th place
    if (row.playerId === podium.champion) positionPts = 10;
    else if (row.playerId === podium.runnerUp) positionPts = 7;
    else if (row.playerId === podium.third) positionPts = 5;
    else if (row.playerId === podium.fourth) positionPts = 3;

    deltas[row.playerId] = {
      playerId: row.playerId,
      pts: positionPts,
      pj: row.pj,
      pg: row.pg,
      pp: row.pp,
      gf: row.gf,
      gc: row.gc,
      tj: 1,
    };
  }

  return { stats: deltas, podium };
}


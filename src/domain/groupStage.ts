import { computeLeagueTable } from './league';
import { shuffle } from './random';
import type {
  GroupId,
  GroupMatch,
  GroupStageFixture,
  LeagueStandingRow,
  MatchFormat,
  Player,
  PlayerId,
  Round,
  Series,
  SeriesId,
  SlotTarget,
} from './types';

function createPlayoffSeries(
  id: SeriesId,
  round: Round,
  playerA: PlayerId | null,
  playerB: PlayerId | null,
  winnerTo: SlotTarget | null,
  loserTo: SlotTarget | null
): Series {
  return {
    id,
    round,
    playerA,
    playerB,
    leg1: { a: null, b: null },
    leg2: { a: null, b: null },
    penaltyWinner: null,
    confirmed: false,
    winnerTo,
    loserTo,
    winner: null,
    loser: null,
  };
}

/**
 * Generates Berger round-robin matches for a single group of 3 players.
 * For single_match: 3 rounds of 1 match (each player plays 2 matches: 1 home, 1 away).
 * For two_legged: 6 rounds of 1 match (each player plays 4 matches: 2 home, 2 away).
 */
function generateSingleGroupMatches(
  groupId: GroupId,
  players: readonly PlayerId[],
  matchFormat: MatchFormat
): GroupMatch[] {
  const [p0, p1, p2] = players as [PlayerId, PlayerId, PlayerId];

  // For 3 players:
  // Round 1: p0 vs p1 (p2 rests) -> p0 home, p1 away
  // Round 2: p1 vs p2 (p0 rests) -> p1 home, p2 away
  // Round 3: p2 vs p0 (p1 rests) -> p2 home, p0 away
  // Every player has exactly 1 home match and 1 away match.
  const leg1Matches: GroupMatch[] = [
    {
      id: `G${groupId}_R1_M1`,
      groupId,
      round: 1,
      playerA: p0,
      playerB: p1,
      scoreA: null,
      scoreB: null,
      confirmed: false,
    },
    {
      id: `G${groupId}_R2_M1`,
      groupId,
      round: 2,
      playerA: p1,
      playerB: p2,
      scoreA: null,
      scoreB: null,
      confirmed: false,
    },
    {
      id: `G${groupId}_R3_M1`,
      groupId,
      round: 3,
      playerA: p2,
      playerB: p0,
      scoreA: null,
      scoreB: null,
      confirmed: false,
    },
  ];

  if (matchFormat === 'two_legged') {
    const leg2Matches: GroupMatch[] = [
      {
        id: `G${groupId}_R4_M1`,
        groupId,
        round: 4,
        playerA: p1,
        playerB: p0,
        scoreA: null,
        scoreB: null,
        confirmed: false,
      },
      {
        id: `G${groupId}_R5_M1`,
        groupId,
        round: 5,
        playerA: p2,
        playerB: p1,
        scoreA: null,
        scoreB: null,
        confirmed: false,
      },
      {
        id: `G${groupId}_R6_M1`,
        groupId,
        round: 6,
        playerA: p0,
        playerB: p2,
        scoreA: null,
        scoreB: null,
        confirmed: false,
      },
    ];

    return [...leg1Matches, ...leg2Matches];
  }

  return leg1Matches;
}

/**
 * Generates groups fixture for 6 (Groups A & B) or 9 (Groups A, B & C) participants (RF-67).
 *
 * - 6 players: 2 groups of 3. Single match: 3 rounds, 6 matches. Two-legged: 6 rounds, 12 matches.
 * - 9 players: 3 groups of 3. Single match: 3 rounds, 9 matches. Two-legged: 6 rounds, 18 matches.
 *
 * @throws Error if participant count is not 6 or 9, or if participants are duplicate.
 */
export function generateGroupsFixture(
  participantIds: readonly PlayerId[],
  matchFormatOrRng: MatchFormat | (() => number) = 'single_match',
  maybeRng: () => number = Math.random
): GroupStageFixture {
  const matchFormat: MatchFormat =
    typeof matchFormatOrRng === 'string' ? matchFormatOrRng : 'single_match';
  const rng: () => number =
    typeof matchFormatOrRng === 'function' ? matchFormatOrRng : maybeRng;

  const count = participantIds.length;
  if (count !== 6 && count !== 9) {
    throw new Error(
      `Cantidad inválida de participantes para fase de grupos: ${count}. Debe ser 6 o 9.`
    );
  }

  const unique = new Set(participantIds);
  if (unique.size !== count) {
    throw new Error('No se pueden generar grupos con participantes duplicados.');
  }

  const seeded = shuffle(participantIds, rng);

  let groups: Record<GroupId, PlayerId[]>;
  let groupIds: GroupId[];

  if (count === 6) {
    groupIds = ['A', 'B'];
    groups = {
      A: seeded.slice(0, 3),
      B: seeded.slice(3, 6),
    } as Record<GroupId, PlayerId[]>;
  } else {
    groupIds = ['A', 'B', 'C'];
    groups = {
      A: seeded.slice(0, 3),
      B: seeded.slice(3, 6),
      C: seeded.slice(6, 9),
    } as Record<GroupId, PlayerId[]>;
  }

  // Generate matches for each group
  const allGroupMatches: GroupMatch[] = [];
  for (const gid of groupIds) {
    const groupMatches = generateSingleGroupMatches(
      gid,
      groups[gid]!,
      matchFormat
    );
    allGroupMatches.push(...groupMatches);
  }

  // Sort matches by round ascending, then groupId ascending
  allGroupMatches.sort((m1, m2) => {
    if (m1.round !== m2.round) return m1.round - m2.round;
    return m1.groupId.localeCompare(m2.groupId);
  });

  return {
    groups,
    matches: allGroupMatches,
  };
}

/**
 * Computes standings for a single group, applying points, goal difference, H2H, and Fair Play (RF-67).
 */
export function computeGroupStandings(
  matches: readonly GroupMatch[],
  participantIds: readonly PlayerId[],
  teams?: Record<PlayerId, string>,
  players?: readonly Player[]
): LeagueStandingRow[] {
  const groupMatches = matches.filter(
    (m) =>
      participantIds.includes(m.playerA) && participantIds.includes(m.playerB)
  );

  return computeLeagueTable(groupMatches, participantIds, teams, players);
}

/**
 * Computes standings for all groups simultaneously.
 */
export function computeAllGroupStandings(
  matches: readonly GroupMatch[],
  groups: Partial<Record<GroupId, readonly PlayerId[]>>,
  teams?: Record<PlayerId, string>,
  players?: readonly Player[]
): Record<GroupId, LeagueStandingRow[]> {
  const result: Partial<Record<GroupId, LeagueStandingRow[]>> = {};

  for (const [gid, pIds] of Object.entries(groups) as [
    GroupId,
    readonly PlayerId[],
  ][]) {
    if (pIds) {
      result[gid] = computeGroupStandings(matches, pIds, teams, players);
    }
  }

  return result as Record<GroupId, LeagueStandingRow[]>;
}

/**
 * Compares and sorts standings rows across different groups according to RF-67:
 * 1) PTS (mayor)
 * 2) DG (mayor)
 * 3) PG (mayor)
 * 4) Menos Tarjetas Rojas
 * 5) Menos Tarjetas Amarillas
 * 6) Mayor Goles a Favor (GF)
 * 7) Nombre alfabético
 */
export function sortCrossGroupStandings(
  rows: readonly LeagueStandingRow[]
): LeagueStandingRow[] {
  return [...rows].sort((a, b) => {
    // 1) PTS
    if (b.pts !== a.pts) return b.pts - a.pts;
    // 2) DG
    if (b.dg !== a.dg) return b.dg - a.dg;
    // 3) PG
    if (b.pg !== a.pg) return b.pg - a.pg;
    // 4) Menos TR
    const redA = a.redCards ?? 0;
    const redB = b.redCards ?? 0;
    if (redA !== redB) return redA - redB;
    // 5) Menos TA
    const yelA = a.yellowCards ?? 0;
    const yelB = b.yellowCards ?? 0;
    if (yelA !== yelB) return yelA - yelB;
    // 6) Mayor GF
    if (b.gf !== a.gf) return b.gf - a.gf;
    // 7) Nombre alfabético
    const nameA = a.displayName || a.playerId;
    const nameB = b.displayName || b.playerId;
    return nameA.localeCompare(nameB);
  });
}

/**
 * Returns the best runner-up among the second-placed participants of all groups (RF-67).
 *
 * @throws Error if runnersUp array is empty.
 */
export function getBestRunnerUp(
  runnersUp: readonly LeagueStandingRow[]
): LeagueStandingRow {
  if (runnersUp.length === 0) {
    throw new Error('No hay participantes segundos para comparar.');
  }

  const sorted = sortCrossGroupStandings(runnersUp);
  return sorted[0]!;
}

/**
 * Checks if all scheduled matches of the group stage are confirmed (RF-67).
 */
export function isGroupStageComplete(matches: readonly GroupMatch[]): boolean {
  return matches.length > 0 && matches.every((m) => m.confirmed);
}

/**
 * Generates the playoff series (Semis, Final, 3er Puesto) from the completed group standings (RF-67).
 *
 * - 6 participants (Groups A & B):
 *   SF1: 1°A vs 2°B (winnerTo: F.a, loserTo: TP.a)
 *   SF2: 1°B vs 2°A (winnerTo: F.b, loserTo: TP.b)
 *
 * - 9 participants (Groups A, B & C):
 *   1st places sorted (Mejor 1°, 2° Mejor 1°, 3° Mejor 1°).
 *   Best runner-up determined (Mejor 2°).
 *   SF1: Mejor 1° vs Mejor 2° (winnerTo: F.a, loserTo: TP.a)
 *   SF2: 2° Mejor 1° vs 3° Mejor 1° (winnerTo: F.b, loserTo: TP.b)
 *
 * Both formats feed into:
 * Final (F) and Tercer Puesto (TP).
 *
 * @throws Error if standings don't contain required groups or participants.
 */
export function generateGroupPlayoffs(
  groupStandings: Partial<Record<GroupId, readonly LeagueStandingRow[]>>
): Series[] {
  const standingsA = groupStandings.A;
  const standingsB = groupStandings.B;
  const standingsC = groupStandings.C;

  const finalSeries = createPlayoffSeries('F', 'final', null, null, null, null);
  const thirdPlaceSeries = createPlayoffSeries(
    'TP',
    'third_place',
    null,
    null,
    null,
    null
  );

  // 6 participants format: 2 groups (A & B)
  if (standingsA && standingsB && !standingsC) {
    if (standingsA.length < 2 || standingsB.length < 2) {
      throw new Error(
        'Los grupos A y B deben tener al menos 2 participantes para generar los playoffs.'
      );
    }

    const firstA = standingsA[0]!.playerId;
    const secondA = standingsA[1]!.playerId;
    const firstB = standingsB[0]!.playerId;
    const secondB = standingsB[1]!.playerId;

    // SF1: 1°A vs 2°B
    const sf1 = createPlayoffSeries(
      'SF1',
      'semifinal',
      firstA,
      secondB,
      { seriesId: 'F', side: 'a' },
      { seriesId: 'TP', side: 'a' }
    );

    // SF2: 1°B vs 2°A
    const sf2 = createPlayoffSeries(
      'SF2',
      'semifinal',
      firstB,
      secondA,
      { seriesId: 'F', side: 'b' },
      { seriesId: 'TP', side: 'b' }
    );

    return [sf1, sf2, finalSeries, thirdPlaceSeries];
  }

  // 9 participants format: 3 groups (A, B & C)
  if (standingsA && standingsB && standingsC) {
    if (
      standingsA.length < 2 ||
      standingsB.length < 2 ||
      standingsC.length < 2
    ) {
      throw new Error(
        'Los grupos A, B y C deben tener al menos 2 participantes para generar los playoffs.'
      );
    }

    const group1sts: LeagueStandingRow[] = [
      standingsA[0]!,
      standingsB[0]!,
      standingsC[0]!,
    ];

    const group2nds: LeagueStandingRow[] = [
      standingsA[1]!,
      standingsB[1]!,
      standingsC[1]!,
    ];

    // Sort 1st placed teams across groups
    const sorted1sts = sortCrossGroupStandings(group1sts);
    const best1 = sorted1sts[0]!;
    const second1 = sorted1sts[1]!;
    const third1 = sorted1sts[2]!;

    // Find best 2nd placed team
    const bestRunnerUp = getBestRunnerUp(group2nds);

    // SF1: Mejor 1° vs Mejor 2°
    const sf1 = createPlayoffSeries(
      'SF1',
      'semifinal',
      best1.playerId,
      bestRunnerUp.playerId,
      { seriesId: 'F', side: 'a' },
      { seriesId: 'TP', side: 'a' }
    );

    // SF2: 2° Mejor 1° vs 3° Mejor 1°
    const sf2 = createPlayoffSeries(
      'SF2',
      'semifinal',
      second1.playerId,
      third1.playerId,
      { seriesId: 'F', side: 'b' },
      { seriesId: 'TP', side: 'b' }
    );

    return [sf1, sf2, finalSeries, thirdPlaceSeries];
  }

  throw new Error(
    'La fase de grupos requiere 2 grupos (A y B) o 3 grupos (A, B y C) para armar los playoffs.'
  );
}

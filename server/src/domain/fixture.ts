export type PlayerId = string;

export interface RawFixtureMatch {
  round: number;
  leg: number;
  seriesId: string;
  homeParticipantId: string | null;
  awayParticipantId: string | null;
  status: 'PENDING_SUBMISSION' | 'PENDING_CONFIRMATION' | 'CLOSED';
  isBye: boolean;
  version: number;
  closedAt: Date | null;
}

export interface GeneratedFixture {
  matches: RawFixtureMatch[];
  byesCount: number;
  totalMatches: number;
  format: string;
}

export interface FixtureOptions {
  format: 'BRACKET' | 'LEAGUE' | 'GROUP_STAGE' | 'LEAGUE_PLAYOFFS' | 'DOUBLE_ELIMINATION' | string;
  matchFormat?: 'SINGLE_MATCH' | 'TWO_LEGGED' | string;
  participants: Array<{ id: string; name?: string }>;
  rng?: () => number;
}

/**
 * Shuffles an array using Fisher-Yates algorithm.
 */
function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

interface SeriesSlot {
  id: string;
  round: string;
  playerA: PlayerId | null;
  playerB: PlayerId | null;
  isBye?: boolean;
}

/**
 * Generates asymmetric bracket series for 4 to 10 players.
 */
function buildBracketSeries(participantIds: readonly PlayerId[], rng: () => number = Math.random) {
  const count = participantIds.length;
  const p = shuffle(participantIds, rng);
  const series: SeriesSlot[] = [];
  const byes: PlayerId[] = [];

  const finalSeries: SeriesSlot = { id: 'F', round: 'final', playerA: null, playerB: null };
  const thirdPlaceSeries: SeriesSlot = { id: 'TP', round: 'third_place', playerA: null, playerB: null };

  if (count === 4) {
    series.push(
      { id: 'SF1', round: 'semifinal', playerA: p[0]!, playerB: p[1]! },
      { id: 'SF2', round: 'semifinal', playerA: p[2]!, playerB: p[3]! },
      finalSeries,
      thirdPlaceSeries
    );
  } else if (count === 5) {
    byes.push(p[2]!, p[3]!, p[4]!);
    series.push(
      { id: 'QF1', round: 'quarterfinal', playerA: p[0]!, playerB: p[1]! },
      { id: 'SF1', round: 'semifinal', playerA: null, playerB: p[2]! },
      { id: 'SF2', round: 'semifinal', playerA: p[3]!, playerB: p[4]! },
      finalSeries,
      thirdPlaceSeries
    );
  } else if (count === 6) {
    byes.push(p[4]!, p[5]!);
    series.push(
      { id: 'QF1', round: 'quarterfinal', playerA: p[0]!, playerB: p[1]! },
      { id: 'QF2', round: 'quarterfinal', playerA: p[2]!, playerB: p[3]! },
      { id: 'SF1', round: 'semifinal', playerA: null, playerB: p[4]! },
      { id: 'SF2', round: 'semifinal', playerA: null, playerB: p[5]! },
      finalSeries,
      thirdPlaceSeries
    );
  } else if (count === 7) {
    byes.push(p[6]!);
    series.push(
      { id: 'QF1', round: 'quarterfinal', playerA: p[0]!, playerB: p[1]! },
      { id: 'QF2', round: 'quarterfinal', playerA: p[2]!, playerB: p[3]! },
      { id: 'QF3', round: 'quarterfinal', playerA: p[4]!, playerB: p[5]! },
      { id: 'SF1', round: 'semifinal', playerA: null, playerB: null },
      { id: 'SF2', round: 'semifinal', playerA: null, playerB: p[6]! },
      finalSeries,
      thirdPlaceSeries
    );
  } else if (count === 8) {
    series.push(
      { id: 'QF1', round: 'quarterfinal', playerA: p[0]!, playerB: p[1]! },
      { id: 'QF2', round: 'quarterfinal', playerA: p[2]!, playerB: p[3]! },
      { id: 'QF3', round: 'quarterfinal', playerA: p[4]!, playerB: p[5]! },
      { id: 'QF4', round: 'quarterfinal', playerA: p[6]!, playerB: p[7]! },
      { id: 'SF1', round: 'semifinal', playerA: null, playerB: null },
      { id: 'SF2', round: 'semifinal', playerA: null, playerB: null },
      finalSeries,
      thirdPlaceSeries
    );
  } else if (count === 9) {
    byes.push(p[2]!, p[3]!, p[4]!, p[5]!, p[6]!, p[7]!, p[8]!);
    series.push(
      { id: 'R16_1', round: 'round_of_16', playerA: p[0]!, playerB: p[1]! },
      { id: 'QF1', round: 'quarterfinal', playerA: null, playerB: p[2]! },
      { id: 'QF2', round: 'quarterfinal', playerA: p[3]!, playerB: p[4]! },
      { id: 'QF3', round: 'quarterfinal', playerA: p[5]!, playerB: p[6]! },
      { id: 'QF4', round: 'quarterfinal', playerA: p[7]!, playerB: p[8]! },
      { id: 'SF1', round: 'semifinal', playerA: null, playerB: null },
      { id: 'SF2', round: 'semifinal', playerA: null, playerB: null },
      finalSeries,
      thirdPlaceSeries
    );
  } else if (count === 10) {
    byes.push(p[4]!, p[5]!, p[6]!, p[7]!, p[8]!, p[9]!);
    series.push(
      { id: 'R16_1', round: 'round_of_16', playerA: p[0]!, playerB: p[1]! },
      { id: 'R16_2', round: 'round_of_16', playerA: p[2]!, playerB: p[3]! },
      { id: 'QF1', round: 'quarterfinal', playerA: null, playerB: p[4]! },
      { id: 'QF2', round: 'quarterfinal', playerA: p[5]!, playerB: p[6]! },
      { id: 'QF3', round: 'quarterfinal', playerA: null, playerB: p[7]! },
      { id: 'QF4', round: 'quarterfinal', playerA: p[8]!, playerB: p[9]! },
      { id: 'SF1', round: 'semifinal', playerA: null, playerB: null },
      { id: 'SF2', round: 'semifinal', playerA: null, playerB: null },
      finalSeries,
      thirdPlaceSeries
    );
  }

  return { series, byes };
}

/**
 * Generates Berger round robin matches for league mode.
 */
function buildLeagueMatches(
  participantIds: readonly PlayerId[],
  isTwoLegged: boolean,
  rng: () => number = Math.random
) {
  const seeded = shuffle(participantIds, rng);
  const players = [...seeded];
  const BYE = '__BYE__';
  if (players.length % 2 !== 0) {
    players.push(BYE);
  }

  const n = players.length;
  const totalRounds = n - 1;
  const half = n / 2;
  const matches: Array<{ round: number; id: string; playerA: string; playerB: string }> = [];
  const rotation = [...players];

  for (let round = 1; round <= totalRounds; round++) {
    let matchInRound = 1;
    for (let i = 0; i < half; i++) {
      const p1 = rotation[i]!;
      const p2 = rotation[n - 1 - i]!;
      if (p1 === BYE || p2 === BYE) continue;

      const isEvenRound = round % 2 === 0;
      const home = (i === 0 ? isEvenRound : !isEvenRound) ? p2 : p1;
      const away = (i === 0 ? isEvenRound : !isEvenRound) ? p1 : p2;

      matches.push({
        round,
        id: `R${round}_M${matchInRound}`,
        playerA: home,
        playerB: away,
      });
      matchInRound++;
    }

    const last = rotation[n - 1]!;
    for (let k = n - 1; k > 1; k--) {
      rotation[k] = rotation[k - 1]!;
    }
    rotation[1] = last;
  }

  // Second leg if two-legged
  if (isTwoLegged) {
    const leg2Matches = matches.map((m) => ({
      round: m.round + totalRounds,
      id: `R${m.round + totalRounds}_M${m.id.split('_M')[1]}`,
      playerA: m.playerB,
      playerB: m.playerA,
    }));
    return [...matches, ...leg2Matches];
  }

  return matches;
}

/**
 * Builds double elimination series for 4 to 10 players.
 */
function buildDoubleEliminationSeries(participantIds: readonly PlayerId[], rng: () => number = Math.random) {
  const count = participantIds.length;
  const p = shuffle(participantIds, rng);
  const series: SeriesSlot[] = [];
  const byes: PlayerId[] = [];

  const gf1: SeriesSlot = { id: 'GF1', round: 'grand_final', playerA: null, playerB: null };

  if (count === 4) {
    series.push(
      { id: 'WB_SF1', round: 'wb_semifinal', playerA: p[0]!, playerB: p[1]! },
      { id: 'WB_SF2', round: 'wb_semifinal', playerA: p[2]!, playerB: p[3]! },
      { id: 'WB_F', round: 'wb_final', playerA: null, playerB: null },
      { id: 'LB_R1', round: 'lb_round_1', playerA: null, playerB: null },
      { id: 'LB_F', round: 'lb_final', playerA: null, playerB: null },
      gf1
    );
  } else if (count >= 5) {
    byes.push(...p.slice(2));
    series.push(
      { id: 'WB_QF1', round: 'wb_quarterfinal', playerA: p[0]!, playerB: p[1]! },
      { id: 'WB_SF1', round: 'wb_semifinal', playerA: null, playerB: p[2]! },
      { id: 'WB_SF2', round: 'wb_semifinal', playerA: p[3] || null, playerB: p[4] || null },
      { id: 'WB_F', round: 'wb_final', playerA: null, playerB: null },
      { id: 'LB_R1', round: 'lb_round_1', playerA: null, playerB: null },
      { id: 'LB_R2', round: 'lb_round_2', playerA: null, playerB: null },
      { id: 'LB_F', round: 'lb_final', playerA: null, playerB: null },
      gf1
    );
  }

  return { series, byes };
}

/**
 * Builds 2 or 3 groups of 3 for 6 or 9 players.
 */
function buildGroupStageMatches(
  participantIds: readonly PlayerId[],
  isTwoLegged: boolean,
  rng: () => number = Math.random
) {
  const seeded = shuffle(participantIds, rng);
  const matches: Array<{ round: number; id: string; playerA: string; playerB: string }> = [];

  if (seeded.length === 6) {
    // 2 groups of 3
    const grpA = seeded.slice(0, 3);
    const grpB = seeded.slice(3, 6);

    const addGroupRoundRobin = (grp: PlayerId[], grpName: string) => {
      matches.push(
        { round: 1, id: `G${grpName}_R1_M1`, playerA: grp[0]!, playerB: grp[1]! },
        { round: 2, id: `G${grpName}_R2_M1`, playerA: grp[1]!, playerB: grp[2]! },
        { round: 3, id: `G${grpName}_R3_M1`, playerA: grp[2]!, playerB: grp[0]! }
      );
      if (isTwoLegged) {
        matches.push(
          { round: 4, id: `G${grpName}_R4_M1`, playerA: grp[1]!, playerB: grp[0]! },
          { round: 5, id: `G${grpName}_R5_M1`, playerA: grp[2]!, playerB: grp[1]! },
          { round: 6, id: `G${grpName}_R6_M1`, playerA: grp[0]!, playerB: grp[2]! }
        );
      }
    };

    addGroupRoundRobin(grpA, 'A');
    addGroupRoundRobin(grpB, 'B');
  }

  return matches;
}

function mapBracketRoundNumber(round: string, hasR16: boolean, hasQF: boolean): number {
  switch (round.toLowerCase()) {
    case 'r16':
    case 'round_of_16':
    case 'octavos':
      return 1;
    case 'qf':
    case 'quarterfinal':
    case 'cuartos':
      return hasR16 ? 2 : 1;
    case 'sf':
    case 'semifinal':
    case 'semis':
      return hasR16 ? 3 : hasQF ? 2 : 1;
    case 'f':
    case 'final':
    case 'tp':
    case 'third_place':
    case 'tercer_puesto':
      return hasR16 ? 4 : hasQF ? 3 : 2;
    default:
      return 1;
  }
}

function mapDoubleElimRoundNumber(round: string): number {
  const r = round.toLowerCase();
  if (r.includes('quarterfinal') || r.includes('qf')) return 1;
  if (r.includes('semifinal') || r.includes('sf') || r.includes('lb_round_1')) return 2;
  if (r.includes('final') || r.includes('lb_round_2')) return 3;
  if (r.includes('grand_final')) return 4;
  return 1;
}

/**
 * Pure generator of relational Match structures with automated Bye auto-liquidations (RF-113, RNF-2).
 */
export function generateTournamentFixture(options: FixtureOptions): GeneratedFixture {
  const { format, matchFormat = 'SINGLE_MATCH', participants, rng = Math.random } = options;
  const count = participants.length;

  if (count < 4 || count > 10) {
    throw new Error(`Se requieren entre 4 y 10 participantes para generar el fixture (hay ${count}).`);
  }

  const participantIds: PlayerId[] = participants.map((p) => p.id);
  const normalizedFormat = format.toUpperCase();
  const isTwoLegged = matchFormat.toUpperCase() === 'TWO_LEGGED';

  const matches: RawFixtureMatch[] = [];
  let byesCount = 0;

  if (normalizedFormat === 'BRACKET') {
    const result = buildBracketSeries(participantIds, rng);
    const hasR16 = count >= 9;
    const hasQF = count >= 5;
    byesCount = result.byes.length;

    // 1. Auto-closed Bye matches in Round 1 (RF-113)
    for (const byeId of result.byes) {
      matches.push({
        round: 1,
        leg: 1,
        seriesId: `BYE_${byeId}`,
        homeParticipantId: byeId,
        awayParticipantId: null,
        status: 'CLOSED',
        isBye: true,
        version: 1,
        closedAt: new Date(),
      });
    }

    // 2. Tournament series matches
    for (const s of result.series) {
      const roundNum = mapBracketRoundNumber(s.round, hasR16, hasQF);
      const isSeriesBye = Boolean(s.isBye);

      if (isSeriesBye) {
        matches.push({
          round: roundNum,
          leg: 1,
          seriesId: s.id,
          homeParticipantId: s.playerA || null,
          awayParticipantId: null,
          status: 'CLOSED',
          isBye: true,
          version: 1,
          closedAt: new Date(),
        });
      } else {
        matches.push({
          round: roundNum,
          leg: 1,
          seriesId: s.id,
          homeParticipantId: s.playerA || null,
          awayParticipantId: s.playerB || null,
          status: 'PENDING_SUBMISSION',
          isBye: false,
          version: 1,
          closedAt: null,
        });

        if (isTwoLegged && s.round !== 'third_place') {
          matches.push({
            round: roundNum,
            leg: 2,
            seriesId: s.id,
            homeParticipantId: s.playerB || null,
            awayParticipantId: s.playerA || null,
            status: 'PENDING_SUBMISSION',
            isBye: false,
            version: 1,
            closedAt: null,
          });
        }
      }
    }
  } else if (normalizedFormat === 'DOUBLE_ELIMINATION') {
    const result = buildDoubleEliminationSeries(participantIds, rng);
    byesCount = result.byes.length;

    for (const byeId of result.byes) {
      matches.push({
        round: 1,
        leg: 1,
        seriesId: `BYE_${byeId}`,
        homeParticipantId: byeId,
        awayParticipantId: null,
        status: 'CLOSED',
        isBye: true,
        version: 1,
        closedAt: new Date(),
      });
    }

    for (const s of result.series) {
      const roundNum = mapDoubleElimRoundNumber(s.round);
      const isSeriesBye = Boolean(s.isBye);

      matches.push({
        round: roundNum,
        leg: 1,
        seriesId: s.id,
        homeParticipantId: s.playerA || null,
        awayParticipantId: s.playerB || null,
        status: isSeriesBye ? 'CLOSED' : 'PENDING_SUBMISSION',
        isBye: isSeriesBye,
        version: 1,
        closedAt: isSeriesBye ? new Date() : null,
      });

      if (isTwoLegged && !isSeriesBye && s.round !== 'grand_final') {
        matches.push({
          round: roundNum,
          leg: 2,
          seriesId: s.id,
          homeParticipantId: s.playerB || null,
          awayParticipantId: s.playerA || null,
          status: 'PENDING_SUBMISSION',
          isBye: false,
          version: 1,
          closedAt: null,
        });
      }
    }
  } else if (normalizedFormat === 'LEAGUE' || normalizedFormat === 'LEAGUE_PLAYOFFS') {
    const leagueMatches = buildLeagueMatches(participantIds, isTwoLegged, rng);

    for (const lm of leagueMatches) {
      matches.push({
        round: lm.round,
        leg: 1,
        seriesId: lm.id,
        homeParticipantId: lm.playerA,
        awayParticipantId: lm.playerB,
        status: 'PENDING_SUBMISSION',
        isBye: false,
        version: 1,
        closedAt: null,
      });
    }
  } else if (normalizedFormat === 'GROUP_STAGE') {
    const groupMatches = buildGroupStageMatches(participantIds, isTwoLegged, rng);

    for (const gm of groupMatches) {
      matches.push({
        round: gm.round,
        leg: 1,
        seriesId: gm.id,
        homeParticipantId: gm.playerA,
        awayParticipantId: gm.playerB,
        status: 'PENDING_SUBMISSION',
        isBye: false,
        version: 1,
        closedAt: null,
      });
    }
  } else {
    return generateTournamentFixture({
      ...options,
      format: 'BRACKET',
    });
  }

  return {
    matches,
    byesCount,
    totalMatches: matches.length,
    format: normalizedFormat,
  };
}

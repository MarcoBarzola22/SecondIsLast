import { shuffle, type RngFn } from './random';
import { confirmSeries, getSeriesResult } from './series';
import { createEmptyPlayerStats } from './standings';
import type {
  ActiveTournament,
  MatchFormat,
  PlayerId,
  PlayerStats,
  Podium,
  Round,
  Series,
  SeriesId,
  SlotTarget,
} from './types';

export interface DoubleEliminationBracket {
  series: Series[];
  byes: PlayerId[];
  shuffledOrder: PlayerId[];
}

export interface GrandFinalEvaluation {
  isComplete: boolean;
  isResetRequired: boolean;
  champion: PlayerId | null;
  runnerUp: PlayerId | null;
  thirdPlace: PlayerId | null;
  fourthPlace: PlayerId | null;
  resetSeries?: Series;
}

export function createDoubleEliminationSeries(
  id: SeriesId,
  round: Round,
  playerA: PlayerId | null,
  playerB: PlayerId | null,
  winnerTo: SlotTarget | null,
  loserTo: SlotTarget | null,
  isBye: boolean = false
): Series {
  return {
    id,
    round,
    playerA,
    playerB,
    leg1: { a: null, b: null },
    leg2: { a: null, b: null },
    penaltyWinner: null,
    confirmed: isBye,
    status: isBye ? 'CLOSED' : 'PENDING_SUBMISSION',
    isBye,
    winnerTo,
    loserTo,
    winner: isBye ? playerA : null,
    loser: null,
  };
}

/**
 * 4 participants Double Elimination bracket:
 * WB: 2 Semifinals, 1 Final.
 * LB: 1 Round (4th place eliminated), 1 Final (3rd place eliminated).
 * GF: Grand Final (GF1).
 */
function buildBracket4(p: readonly PlayerId[]): { series: Series[]; byes: PlayerId[] } {
  const wbSf1 = createDoubleEliminationSeries(
    'WB_SF1',
    'wb_semifinal',
    p[0]!,
    p[1]!,
    { seriesId: 'WB_F', side: 'a' },
    { seriesId: 'LB_R1', side: 'a' }
  );

  const wbSf2 = createDoubleEliminationSeries(
    'WB_SF2',
    'wb_semifinal',
    p[2]!,
    p[3]!,
    { seriesId: 'WB_F', side: 'b' },
    { seriesId: 'LB_R1', side: 'b' }
  );

  const wbF = createDoubleEliminationSeries(
    'WB_F',
    'wb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'a' },
    { seriesId: 'LB_F', side: 'b' }
  );

  const lbR1 = createDoubleEliminationSeries(
    'LB_R1',
    'lb_round_1',
    null,
    null,
    { seriesId: 'LB_F', side: 'a' },
    null // Loser is 4th place
  );

  const lbF = createDoubleEliminationSeries(
    'LB_F',
    'lb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'b' },
    null // Loser is 3rd place
  );

  const gf1 = createDoubleEliminationSeries(
    'GF1',
    'grand_final',
    null,
    null,
    null,
    null
  );

  return {
    series: [wbSf1, wbSf2, wbF, lbR1, lbF, gf1],
    byes: [],
  };
}

/**
 * 5 participants Double Elimination bracket:
 * 3 Byes (p[2], p[3], p[4]).
 * WB: 1 QF, 2 SF, 1 Final.
 * LB: 1 R1, 1 R2, 1 Final.
 */
function buildBracket5(p: readonly PlayerId[]): { series: Series[]; byes: PlayerId[] } {
  const byes = [p[2]!, p[3]!, p[4]!];

  const wbQf1 = createDoubleEliminationSeries(
    'WB_QF1',
    'wb_quarterfinal',
    p[0]!,
    p[1]!,
    { seriesId: 'WB_SF1', side: 'a' },
    { seriesId: 'LB_R1', side: 'a' }
  );

  const wbSf1 = createDoubleEliminationSeries(
    'WB_SF1',
    'wb_semifinal',
    null,
    p[2]!,
    { seriesId: 'WB_F', side: 'a' },
    { seriesId: 'LB_R2', side: 'b' }
  );

  const wbSf2 = createDoubleEliminationSeries(
    'WB_SF2',
    'wb_semifinal',
    p[3]!,
    p[4]!,
    { seriesId: 'WB_F', side: 'b' },
    { seriesId: 'LB_R1', side: 'b' }
  );

  const wbF = createDoubleEliminationSeries(
    'WB_F',
    'wb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'a' },
    { seriesId: 'LB_F', side: 'b' }
  );

  const lbR1 = createDoubleEliminationSeries(
    'LB_R1',
    'lb_round_1',
    null,
    null,
    { seriesId: 'LB_R2', side: 'a' },
    null
  );

  const lbR2 = createDoubleEliminationSeries(
    'LB_R2',
    'lb_semifinal',
    null,
    null,
    { seriesId: 'LB_F', side: 'a' },
    null // Loser is 4th place
  );

  const lbF = createDoubleEliminationSeries(
    'LB_F',
    'lb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'b' },
    null // Loser is 3rd place
  );

  const gf1 = createDoubleEliminationSeries(
    'GF1',
    'grand_final',
    null,
    null,
    null,
    null
  );

  return {
    series: [wbQf1, wbSf1, wbSf2, wbF, lbR1, lbR2, lbF, gf1],
    byes,
  };
}

/**
 * 6 participants Double Elimination bracket:
 * 2 Byes to Semifinals (p[4], p[5]).
 */
function buildBracket6(p: readonly PlayerId[]): { series: Series[]; byes: PlayerId[] } {
  const byes = [p[4]!, p[5]!];

  const wbQf1 = createDoubleEliminationSeries(
    'WB_QF1',
    'wb_quarterfinal',
    p[0]!,
    p[1]!,
    { seriesId: 'WB_SF1', side: 'a' },
    { seriesId: 'LB_R1_1', side: 'a' }
  );

  const wbQf2 = createDoubleEliminationSeries(
    'WB_QF2',
    'wb_quarterfinal',
    p[2]!,
    p[3]!,
    { seriesId: 'WB_SF2', side: 'a' },
    { seriesId: 'LB_R1_2', side: 'a' }
  );

  const wbSf1 = createDoubleEliminationSeries(
    'WB_SF1',
    'wb_semifinal',
    null,
    p[4]!,
    { seriesId: 'WB_F', side: 'a' },
    { seriesId: 'LB_R1_2', side: 'b' }
  );

  const wbSf2 = createDoubleEliminationSeries(
    'WB_SF2',
    'wb_semifinal',
    null,
    p[5]!,
    { seriesId: 'WB_F', side: 'b' },
    { seriesId: 'LB_R1_1', side: 'b' }
  );

  const wbF = createDoubleEliminationSeries(
    'WB_F',
    'wb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'a' },
    { seriesId: 'LB_F', side: 'b' }
  );

  const lbR1_1 = createDoubleEliminationSeries(
    'LB_R1_1',
    'lb_round_1',
    null,
    null,
    { seriesId: 'LB_SF', side: 'a' },
    null
  );

  const lbR1_2 = createDoubleEliminationSeries(
    'LB_R1_2',
    'lb_round_1',
    null,
    null,
    { seriesId: 'LB_SF', side: 'b' },
    null
  );

  const lbSf = createDoubleEliminationSeries(
    'LB_SF',
    'lb_semifinal',
    null,
    null,
    { seriesId: 'LB_F', side: 'a' },
    null // Loser is 4th place
  );

  const lbF = createDoubleEliminationSeries(
    'LB_F',
    'lb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'b' },
    null // Loser is 3rd place
  );

  const gf1 = createDoubleEliminationSeries(
    'GF1',
    'grand_final',
    null,
    null,
    null,
    null
  );

  return {
    series: [wbQf1, wbQf2, wbSf1, wbSf2, wbF, lbR1_1, lbR1_2, lbSf, lbF, gf1],
    byes,
  };
}

/**
 * 7 participants Double Elimination bracket:
 * 1 Bye to Semifinals (p[6]).
 */
function buildBracket7(p: readonly PlayerId[]): { series: Series[]; byes: PlayerId[] } {
  const byes = [p[6]!];

  const wbQf1 = createDoubleEliminationSeries(
    'WB_QF1',
    'wb_quarterfinal',
    p[0]!,
    p[1]!,
    { seriesId: 'WB_SF1', side: 'a' },
    { seriesId: 'LB_R1_1', side: 'a' }
  );

  const wbQf2 = createDoubleEliminationSeries(
    'WB_QF2',
    'wb_quarterfinal',
    p[2]!,
    p[3]!,
    { seriesId: 'WB_SF1', side: 'b' },
    { seriesId: 'LB_R1_1', side: 'b' }
  );

  const wbQf3 = createDoubleEliminationSeries(
    'WB_QF3',
    'wb_quarterfinal',
    p[4]!,
    p[5]!,
    { seriesId: 'WB_SF2', side: 'a' },
    { seriesId: 'LB_R2_2', side: 'a' }
  );

  const wbSf1 = createDoubleEliminationSeries(
    'WB_SF1',
    'wb_semifinal',
    null,
    null,
    { seriesId: 'WB_F', side: 'a' },
    { seriesId: 'LB_R2_1', side: 'b' }
  );

  const wbSf2 = createDoubleEliminationSeries(
    'WB_SF2',
    'wb_semifinal',
    null,
    p[6]!,
    { seriesId: 'WB_F', side: 'b' },
    { seriesId: 'LB_R2_2', side: 'b' }
  );

  const wbF = createDoubleEliminationSeries(
    'WB_F',
    'wb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'a' },
    { seriesId: 'LB_F', side: 'b' }
  );

  const lbR1_1 = createDoubleEliminationSeries(
    'LB_R1_1',
    'lb_round_1',
    null,
    null,
    { seriesId: 'LB_R2_1', side: 'a' },
    null
  );

  const lbR2_1 = createDoubleEliminationSeries(
    'LB_R2_1',
    'lb_round_2',
    null,
    null,
    { seriesId: 'LB_SF', side: 'a' },
    null
  );

  const lbR2_2 = createDoubleEliminationSeries(
    'LB_R2_2',
    'lb_round_2',
    null,
    null,
    { seriesId: 'LB_SF', side: 'b' },
    null
  );

  const lbSf = createDoubleEliminationSeries(
    'LB_SF',
    'lb_semifinal',
    null,
    null,
    { seriesId: 'LB_F', side: 'a' },
    null // Loser is 4th place
  );

  const lbF = createDoubleEliminationSeries(
    'LB_F',
    'lb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'b' },
    null // Loser is 3rd place
  );

  const gf1 = createDoubleEliminationSeries(
    'GF1',
    'grand_final',
    null,
    null,
    null,
    null
  );

  return {
    series: [
      wbQf1,
      wbQf2,
      wbQf3,
      wbSf1,
      wbSf2,
      wbF,
      lbR1_1,
      lbR2_1,
      lbR2_2,
      lbSf,
      lbF,
      gf1,
    ],
    byes,
  };
}

/**
 * 8 participants Double Elimination bracket (standard symmetrical):
 * 0 Byes.
 */
function buildBracket8(p: readonly PlayerId[]): { series: Series[]; byes: PlayerId[] } {
  const wbQf1 = createDoubleEliminationSeries(
    'WB_QF1',
    'wb_quarterfinal',
    p[0]!,
    p[1]!,
    { seriesId: 'WB_SF1', side: 'a' },
    { seriesId: 'LB_R1_1', side: 'a' }
  );

  const wbQf2 = createDoubleEliminationSeries(
    'WB_QF2',
    'wb_quarterfinal',
    p[2]!,
    p[3]!,
    { seriesId: 'WB_SF1', side: 'b' },
    { seriesId: 'LB_R1_1', side: 'b' }
  );

  const wbQf3 = createDoubleEliminationSeries(
    'WB_QF3',
    'wb_quarterfinal',
    p[4]!,
    p[5]!,
    { seriesId: 'WB_SF2', side: 'a' },
    { seriesId: 'LB_R1_2', side: 'a' }
  );

  const wbQf4 = createDoubleEliminationSeries(
    'WB_QF4',
    'wb_quarterfinal',
    p[6]!,
    p[7]!,
    { seriesId: 'WB_SF2', side: 'b' },
    { seriesId: 'LB_R1_2', side: 'b' }
  );

  const wbSf1 = createDoubleEliminationSeries(
    'WB_SF1',
    'wb_semifinal',
    null,
    null,
    { seriesId: 'WB_F', side: 'a' },
    { seriesId: 'LB_R2_1', side: 'b' }
  );

  const wbSf2 = createDoubleEliminationSeries(
    'WB_SF2',
    'wb_semifinal',
    null,
    null,
    { seriesId: 'WB_F', side: 'b' },
    { seriesId: 'LB_R2_2', side: 'b' }
  );

  const wbF = createDoubleEliminationSeries(
    'WB_F',
    'wb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'a' },
    { seriesId: 'LB_F', side: 'b' }
  );

  const lbR1_1 = createDoubleEliminationSeries(
    'LB_R1_1',
    'lb_round_1',
    null,
    null,
    { seriesId: 'LB_R2_1', side: 'a' },
    null
  );

  const lbR1_2 = createDoubleEliminationSeries(
    'LB_R1_2',
    'lb_round_1',
    null,
    null,
    { seriesId: 'LB_R2_2', side: 'a' },
    null
  );

  const lbR2_1 = createDoubleEliminationSeries(
    'LB_R2_1',
    'lb_round_2',
    null,
    null,
    { seriesId: 'LB_SF', side: 'a' },
    null
  );

  const lbR2_2 = createDoubleEliminationSeries(
    'LB_R2_2',
    'lb_round_2',
    null,
    null,
    { seriesId: 'LB_SF', side: 'b' },
    null
  );

  const lbSf = createDoubleEliminationSeries(
    'LB_SF',
    'lb_semifinal',
    null,
    null,
    { seriesId: 'LB_F', side: 'a' },
    null // Loser is 4th place
  );

  const lbF = createDoubleEliminationSeries(
    'LB_F',
    'lb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'b' },
    null // Loser is 3rd place
  );

  const gf1 = createDoubleEliminationSeries(
    'GF1',
    'grand_final',
    null,
    null,
    null,
    null
  );

  return {
    series: [
      wbQf1,
      wbQf2,
      wbQf3,
      wbQf4,
      wbSf1,
      wbSf2,
      wbF,
      lbR1_1,
      lbR1_2,
      lbR2_1,
      lbR2_2,
      lbSf,
      lbF,
      gf1,
    ],
    byes: [],
  };
}

/**
 * 9 participants Double Elimination bracket:
 * 1 Play-in series in WB (WB_R16_1: p[0] vs p[1]).
 * Byes to Cuartos: p[2]..p[8].
 */
function buildBracket9(p: readonly PlayerId[]): { series: Series[]; byes: PlayerId[] } {
  const byes = [p[2]!, p[3]!, p[4]!, p[5]!, p[6]!, p[7]!, p[8]!];

  const wbR16_1 = createDoubleEliminationSeries(
    'WB_R16_1',
    'wb_round_16',
    p[0]!,
    p[1]!,
    { seriesId: 'WB_QF1', side: 'a' },
    { seriesId: 'LB_R1_1', side: 'a' }
  );

  const wbQf1 = createDoubleEliminationSeries(
    'WB_QF1',
    'wb_quarterfinal',
    null,
    p[2]!,
    { seriesId: 'WB_SF1', side: 'a' },
    { seriesId: 'LB_R2_1', side: 'b' }
  );

  const wbQf2 = createDoubleEliminationSeries(
    'WB_QF2',
    'wb_quarterfinal',
    p[3]!,
    p[4]!,
    { seriesId: 'WB_SF1', side: 'b' },
    { seriesId: 'LB_R1_1', side: 'b' }
  );

  const wbQf3 = createDoubleEliminationSeries(
    'WB_QF3',
    'wb_quarterfinal',
    p[5]!,
    p[6]!,
    { seriesId: 'WB_SF2', side: 'a' },
    { seriesId: 'LB_R1_2', side: 'a' }
  );

  const wbQf4 = createDoubleEliminationSeries(
    'WB_QF4',
    'wb_quarterfinal',
    p[7]!,
    p[8]!,
    { seriesId: 'WB_SF2', side: 'b' },
    { seriesId: 'LB_R1_2', side: 'b' }
  );

  const wbSf1 = createDoubleEliminationSeries(
    'WB_SF1',
    'wb_semifinal',
    null,
    null,
    { seriesId: 'WB_F', side: 'a' },
    { seriesId: 'LB_R2_1', side: 'a' }
  );

  const wbSf2 = createDoubleEliminationSeries(
    'WB_SF2',
    'wb_semifinal',
    null,
    null,
    { seriesId: 'WB_F', side: 'b' },
    { seriesId: 'LB_R2_2', side: 'b' }
  );

  const wbF = createDoubleEliminationSeries(
    'WB_F',
    'wb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'a' },
    { seriesId: 'LB_F', side: 'b' }
  );

  const lbR1_1 = createDoubleEliminationSeries(
    'LB_R1_1',
    'lb_round_1',
    null,
    null,
    { seriesId: 'LB_R2_1', side: 'b' },
    null
  );

  const lbR1_2 = createDoubleEliminationSeries(
    'LB_R1_2',
    'lb_round_1',
    null,
    null,
    { seriesId: 'LB_R2_2', side: 'a' },
    null
  );

  const lbR2_1 = createDoubleEliminationSeries(
    'LB_R2_1',
    'lb_round_2',
    null,
    null,
    { seriesId: 'LB_SF', side: 'a' },
    null
  );

  const lbR2_2 = createDoubleEliminationSeries(
    'LB_R2_2',
    'lb_round_2',
    null,
    null,
    { seriesId: 'LB_SF', side: 'b' },
    null
  );

  const lbSf = createDoubleEliminationSeries(
    'LB_SF',
    'lb_semifinal',
    null,
    null,
    { seriesId: 'LB_F', side: 'a' },
    null // Loser is 4th place
  );

  const lbF = createDoubleEliminationSeries(
    'LB_F',
    'lb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'b' },
    null // Loser is 3rd place
  );

  const gf1 = createDoubleEliminationSeries(
    'GF1',
    'grand_final',
    null,
    null,
    null,
    null
  );

  return {
    series: [
      wbR16_1,
      wbQf1,
      wbQf2,
      wbQf3,
      wbQf4,
      wbSf1,
      wbSf2,
      wbF,
      lbR1_1,
      lbR1_2,
      lbR2_1,
      lbR2_2,
      lbSf,
      lbF,
      gf1,
    ],
    byes,
  };
}

/**
 * 10 participants Double Elimination bracket:
 * 2 Play-in series in WB (WB_R16_1: p[0] vs p[1], WB_R16_2: p[2] vs p[3]).
 * Losers of WB R16 meet in LB_R0_1 (loser finishes 10th).
 * Byes to Cuartos: p[4]..p[9].
 */
function buildBracket10(p: readonly PlayerId[]): { series: Series[]; byes: PlayerId[] } {
  const byes = [p[4]!, p[5]!, p[6]!, p[7]!, p[8]!, p[9]!];

  const wbR16_1 = createDoubleEliminationSeries(
    'WB_R16_1',
    'wb_round_16',
    p[0]!,
    p[1]!,
    { seriesId: 'WB_QF1', side: 'a' },
    { seriesId: 'LB_R0_1', side: 'a' }
  );

  const wbR16_2 = createDoubleEliminationSeries(
    'WB_R16_2',
    'wb_round_16',
    p[2]!,
    p[3]!,
    { seriesId: 'WB_QF3', side: 'a' },
    { seriesId: 'LB_R0_1', side: 'b' }
  );

  const lbR0_1 = createDoubleEliminationSeries(
    'LB_R0_1',
    'lb_round_0',
    null,
    null,
    { seriesId: 'LB_R1_1', side: 'a' },
    null // Loser is 10th
  );

  const wbQf1 = createDoubleEliminationSeries(
    'WB_QF1',
    'wb_quarterfinal',
    null,
    p[4]!,
    { seriesId: 'WB_SF1', side: 'a' },
    { seriesId: 'LB_R2_1', side: 'b' }
  );

  const wbQf2 = createDoubleDoubleEliminationSeriesSafe(
    'WB_QF2',
    'wb_quarterfinal',
    p[5]!,
    p[6]!,
    { seriesId: 'WB_SF1', side: 'b' },
    { seriesId: 'LB_R1_1', side: 'b' }
  );

  const wbQf3 = createDoubleEliminationSeries(
    'WB_QF3',
    'wb_quarterfinal',
    null,
    p[7]!,
    { seriesId: 'WB_SF2', side: 'a' },
    { seriesId: 'LB_R2_2', side: 'b' }
  );

  const wbQf4 = createDoubleEliminationSeries(
    'WB_QF4',
    'wb_quarterfinal',
    p[8]!,
    p[9]!,
    { seriesId: 'WB_SF2', side: 'b' },
    { seriesId: 'LB_R1_2', side: 'b' }
  );

  const wbSf1 = createDoubleEliminationSeries(
    'WB_SF1',
    'wb_semifinal',
    null,
    null,
    { seriesId: 'WB_F', side: 'a' },
    { seriesId: 'LB_R2_1', side: 'a' }
  );

  const wbSf2 = createDoubleEliminationSeries(
    'WB_SF2',
    'wb_semifinal',
    null,
    null,
    { seriesId: 'WB_F', side: 'b' },
    { seriesId: 'LB_R2_2', side: 'a' }
  );

  const wbF = createDoubleEliminationSeries(
    'WB_F',
    'wb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'a' },
    { seriesId: 'LB_F', side: 'b' }
  );

  const lbR1_1 = createDoubleEliminationSeries(
    'LB_R1_1',
    'lb_round_1',
    null,
    null,
    { seriesId: 'LB_R2_1', side: 'b' },
    null
  );

  const lbR1_2 = createDoubleEliminationSeries(
    'LB_R1_2',
    'lb_round_1',
    null,
    p[8]! !== undefined ? null : null,
    { seriesId: 'LB_R2_2', side: 'b' },
    null
  );

  const lbR2_1 = createDoubleEliminationSeries(
    'LB_R2_1',
    'lb_round_2',
    null,
    null,
    { seriesId: 'LB_SF', side: 'a' },
    null
  );

  const lbR2_2 = createDoubleEliminationSeries(
    'LB_R2_2',
    'lb_round_2',
    null,
    null,
    { seriesId: 'LB_SF', side: 'b' },
    null
  );

  const lbSf = createDoubleEliminationSeries(
    'LB_SF',
    'lb_semifinal',
    null,
    null,
    { seriesId: 'LB_F', side: 'a' },
    null // Loser is 4th place
  );

  const lbF = createDoubleEliminationSeries(
    'LB_F',
    'lb_final',
    null,
    null,
    { seriesId: 'GF1', side: 'b' },
    null // Loser is 3rd place
  );

  const gf1 = createDoubleEliminationSeries(
    'GF1',
    'grand_final',
    null,
    null,
    null,
    null
  );

  return {
    series: [
      wbR16_1,
      wbR16_2,
      lbR0_1,
      wbQf1,
      wbQf2,
      wbQf3,
      wbQf4,
      wbSf1,
      wbSf2,
      wbF,
      lbR1_1,
      lbR1_2,
      lbR2_1,
      lbR2_2,
      lbSf,
      lbF,
      gf1,
    ],
    byes,
  };
}

function createDoubleDoubleEliminationSeriesSafe(
  id: SeriesId,
  round: Round,
  playerA: PlayerId | null,
  playerB: PlayerId | null,
  winnerTo: SlotTarget | null,
  loserTo: SlotTarget | null
): Series {
  return createDoubleEliminationSeries(id, round, playerA, playerB, winnerTo, loserTo);
}

/**
 * Generates an asymmetric double elimination bracket for 4 to 10 participants (RF-48, RF-69).
 *
 * @throws Error if participant count is not between 4 and 10 or if there are duplicate participants.
 */
export function generateDoubleEliminationBracket(
  participantIds: readonly PlayerId[],
  rng: RngFn | null = Math.random
): DoubleEliminationBracket {
  const count = participantIds.length;
  if (count < 4 || count > 10) {
    throw new Error(
      `El número de participantes para doble eliminación debe ser entre 4 y 10. Recibido: ${count}.`
    );
  }

  const unique = new Set(participantIds);
  if (unique.size !== count) {
    throw new Error('No se pueden generar llaves con participantes duplicados.');
  }

  const shuffledOrder = rng === null ? [...participantIds] : shuffle(participantIds, rng);

  let result: { series: Series[]; byes: PlayerId[] };
  switch (count) {
    case 4:
      result = buildBracket4(shuffledOrder);
      break;
    case 5:
      result = buildBracket5(shuffledOrder);
      break;
    case 6:
      result = buildBracket6(shuffledOrder);
      break;
    case 7:
      result = buildBracket7(shuffledOrder);
      break;
    case 8:
      result = buildBracket8(shuffledOrder);
      break;
    case 9:
      result = buildBracket9(shuffledOrder);
      break;
    case 10:
      result = buildBracket10(shuffledOrder);
      break;
    default:
      throw new Error(`Cantidad no soportada: ${count}`);
  }

  return {
    series: result.series,
    byes: result.byes,
    shuffledOrder,
  };
}

/**
 * Generates double elimination bracket from a pre-defined manual or deterministic order (RF-87).
 */
export function generateDoubleEliminationBracketFromOrder(
  orderedParticipantIds: readonly PlayerId[]
): DoubleEliminationBracket {
  return generateDoubleEliminationBracket(orderedParticipantIds, null);
}

/**
 * Creates the Grand Final Reset series (GF2) between the WB champion and the LB champion (RF-69).
 */
export function createGrandFinalResetSeries(
  playerA: PlayerId,
  playerB: PlayerId
): Series {
  return createDoubleEliminationSeries(
    'GF2',
    'grand_final_reset',
    playerA,
    playerB,
    null,
    null
  );
}

/**
 * Evaluates the status of the Grand Final in a double elimination tournament (RF-69).
 *
 * Rules:
 * - GF1: playerA = WB Champion, playerB = LB Champion.
 * - If WB Champion wins GF1: Tournament is complete! Champion = WB Champion, RunnerUp = LB Champion.
 * - If LB Champion wins GF1: Grand Final Reset is required (GF2)!
 *   - If GF2 is not confirmed yet: isComplete = false, isResetRequired = true.
 *   - If GF2 is confirmed: isComplete = true, isResetRequired = false, Champion = GF2 winner, RunnerUp = GF2 loser.
 */
export function evaluateGrandFinal(
  seriesList: readonly Series[],
  _matchFormat: MatchFormat = 'two_legged'
): GrandFinalEvaluation {
  const gf1 = seriesList.find((s) => s.id === 'GF1');
  const gf2 = seriesList.find((s) => s.id === 'GF2');
  const lbF = seriesList.find((s) => s.id === 'LB_F');

  // Identify 3rd place (loser of LB Final)
  const thirdPlace = lbF?.loser ?? null;

  // Identify 4th place (loser of LB Semifinal or preceding round)
  const lbSf =
    seriesList.find((s) => s.id === 'LB_SF') ??
    seriesList.find((s) => s.id === 'LB_R2') ??
    seriesList.find((s) => s.id === 'LB_R1');
  const fourthPlace = lbSf?.loser ?? null;

  if (!gf1 || !gf1.confirmed || gf1.winner === null) {
    return {
      isComplete: false,
      isResetRequired: false,
      champion: null,
      runnerUp: null,
      thirdPlace,
      fourthPlace,
    };
  }

  const wbChampion = gf1.playerA!;
  const lbChampion = gf1.playerB!;

  // Case 1: WB Champion wins GF1 -> Tournament complete without reset (RF-69)
  if (gf1.winner === wbChampion) {
    return {
      isComplete: true,
      isResetRequired: false,
      champion: wbChampion,
      runnerUp: lbChampion,
      thirdPlace,
      fourthPlace,
    };
  }

  // Case 2: LB Champion wins GF1 -> Bracket Reset required (RF-69)
  if (!gf2 || !gf2.confirmed || gf2.winner === null) {
    return {
      isComplete: false,
      isResetRequired: true,
      champion: null,
      runnerUp: null,
      thirdPlace,
      fourthPlace,
      resetSeries:
        gf2 ?? createGrandFinalResetSeries(wbChampion, lbChampion),
    };
  }

  // Case 3: GF2 has been played and confirmed
  return {
    isComplete: true,
    isResetRequired: false,
    champion: gf2.winner ?? null,
    runnerUp: gf2.loser ?? null,
    thirdPlace,
    fourthPlace,
  };
}

/**
 * Advances a series in a double elimination tournament, propagating winner to winnerTo and loser to loserTo.
 * If GF1 is confirmed and won by the LB champion, automatically wires or triggers the Grand Final Reset series GF2 (RF-69).
 */
export function advanceDoubleEliminationSeries(
  seriesList: readonly Series[],
  seriesId: SeriesId,
  matchFormat: MatchFormat = 'two_legged'
): Series[] {
  let updatedList = confirmSeries(seriesList, seriesId, matchFormat);

  // If the confirmed series was GF1, evaluate if Grand Final Reset is triggered
  if (seriesId === 'GF1') {
    const gf1 = updatedList.find((s) => s.id === 'GF1');
    if (gf1 && gf1.confirmed && gf1.winner !== null) {
      const wbChampion = gf1.playerA!;
      const lbChampion = gf1.playerB!;

      // If LB champion won GF1, activate / insert GF2
      if (gf1.winner === lbChampion) {
        const existingGf2 = updatedList.find((s) => s.id === 'GF2');
        if (existingGf2) {
          updatedList = updatedList.map((s) =>
            s.id === 'GF2'
              ? { ...s, playerA: wbChampion, playerB: lbChampion }
              : s
          );
        } else {
          const newGf2 = createGrandFinalResetSeries(wbChampion, lbChampion);
          updatedList = [...updatedList, newGf2];
        }
      }
    }
  }

  return updatedList;
}

/**
 * Checks whether the entire double elimination tournament is complete.
 */
export function isDoubleEliminationComplete(
  seriesList: readonly Series[],
  matchFormat: MatchFormat = 'two_legged'
): boolean {
  return evaluateGrandFinal(seriesList, matchFormat).isComplete;
}

/**
 * Extracts the official podium from a completed double elimination tournament (RF-30).
 *
 * @throws Error if the tournament is not complete or podium cannot be determined.
 */
export function getDoubleEliminationPodium(
  seriesList: readonly Series[],
  matchFormat: MatchFormat = 'two_legged'
): Podium {
  const evalResult = evaluateGrandFinal(seriesList, matchFormat);
  if (!evalResult.isComplete) {
    throw new Error(
      'No se puede determinar el podio: el torneo de doble eliminación aún no finalizó.'
    );
  }

  if (
    !evalResult.champion ||
    !evalResult.runnerUp ||
    !evalResult.thirdPlace ||
    !evalResult.fourthPlace
  ) {
    throw new Error(
      'Podio incompleto: faltan definir posiciones en el bracket de perdedores.'
    );
  }

  return {
    champion: evalResult.champion,
    runnerUp: evalResult.runnerUp,
    third: evalResult.thirdPlace,
    fourth: evalResult.fourthPlace,
  };
}

/**
 * Computes player stats delta and podium for a finished double elimination tournament (RF-30, RF-31, RF-69).
 */
export function computeDoubleEliminationTournamentStats(
  tournament: Pick<ActiveTournament, 'participantIds' | 'series'> & {
    matchFormat?: MatchFormat;
  }
): { stats: Record<PlayerId, PlayerStats>; podium: Podium } {
  const matchFormat = tournament.matchFormat ?? 'two_legged';
  const podium = getDoubleEliminationPodium(tournament.series, matchFormat);

  const deltas: Record<PlayerId, PlayerStats> = {};
  for (const id of tournament.participantIds) {
    deltas[id] = {
      ...createEmptyPlayerStats(id),
      tj: 1, // RF-31: +1 TJ for every participant
    };
  }

  // 1. Position points (PTS)
  if (deltas[podium.champion]) deltas[podium.champion].pts += 10;
  if (deltas[podium.runnerUp]) deltas[podium.runnerUp].pts += 7;
  if (deltas[podium.third]) deltas[podium.third].pts += 5;
  if (deltas[podium.fourth]) deltas[podium.fourth].pts += 3;

  // 2. Accumulate match performance (PJ, PG, PP, GF, GC) across all confirmed series
  const isSingleMatch = matchFormat === 'single_match';
  for (const s of tournament.series) {
    if (!s.confirmed || !s.playerA || !s.playerB) {
      continue;
    }

    const res = getSeriesResult(s, matchFormat);
    const { playerA, playerB } = s;

    const goalsA = (s.leg1.a ?? 0) + (isSingleMatch ? 0 : (s.leg2.a ?? 0));
    const goalsB = (s.leg1.b ?? 0) + (isSingleMatch ? 0 : (s.leg2.b ?? 0));

    if (deltas[playerA]) {
      deltas[playerA].pj += 1;
      deltas[playerA].gf += goalsA;
      deltas[playerA].gc += goalsB;
      if (res.winner === playerA) deltas[playerA].pg += 1;
      if (res.loser === playerA) deltas[playerA].pp += 1;
    }

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


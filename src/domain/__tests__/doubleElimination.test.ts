import { describe, expect, it } from 'vitest';
import {
  advanceDoubleEliminationSeries,
  evaluateGrandFinal,
  generateDoubleEliminationBracket,
  generateDoubleEliminationBracketFromOrder,
  getDoubleEliminationPodium,
  isDoubleEliminationComplete,
} from '../doubleElimination';
import { setLegScore } from '../series';
import type { PlayerId, Series } from '../types';

describe('domain - doubleElimination (RF-48, RF-69)', () => {
  const identityRng = () => 0.99999;

  const p4: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
  const p5: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const p6: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const p7: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
  const p8: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const p9: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'];
  const p10: PlayerId[] = [
    'p1',
    'p2',
    'p3',
    'p4',
    'p5',
    'p6',
    'p7',
    'p8',
    'p9',
    'p10',
  ];

  describe('generateDoubleEliminationBracket validation', () => {
    it('throws error for fewer than 4 participants', () => {
      expect(() =>
        generateDoubleEliminationBracket(['p1', 'p2', 'p3'])
      ).toThrowError(/entre 4 y 10/);
    });

    it('throws error for more than 10 participants', () => {
      const p11 = [...p10, 'p11'];
      expect(() => generateDoubleEliminationBracket(p11)).toThrowError(
        /entre 4 y 10/
      );
    });

    it('throws error for duplicate participants', () => {
      expect(() =>
        generateDoubleEliminationBracket(['p1', 'p2', 'p3', 'p1'])
      ).toThrowError(/duplicados/);
    });

    it('generates deterministic bracket with mock RNG', () => {
      const mockRng = () => 0.5;
      const b1 = generateDoubleEliminationBracket(p4, mockRng);
      const b2 = generateDoubleEliminationBracket(p4, mockRng);
      expect(b1.shuffledOrder).toEqual(b2.shuffledOrder);
    });
  });

  describe('bracket structures for all N from 4 to 10', () => {
    it('creates valid bracket for 4 players (0 Byes, 6 series)', () => {
      const { series, byes, shuffledOrder } = generateDoubleEliminationBracket(
        p4,
        identityRng
      );
      expect(shuffledOrder).toEqual(p4);
      expect(byes).toHaveLength(0);
      expect(series).toHaveLength(6);

      const ids = series.map((s) => s.id);
      expect(ids).toEqual(['WB_SF1', 'WB_SF2', 'WB_F', 'LB_R1', 'LB_F', 'GF1']);

      const sf1 = series.find((s) => s.id === 'WB_SF1')!;
      expect(sf1.playerA).toBe('p1');
      expect(sf1.playerB).toBe('p2');
      expect(sf1.winnerTo).toEqual({ seriesId: 'WB_F', side: 'a' });
      expect(sf1.loserTo).toEqual({ seriesId: 'LB_R1', side: 'a' });
    });

    it('creates valid bracket for 5 players (3 Byes, 8 series)', () => {
      const { series, byes } = generateDoubleEliminationBracket(p5, identityRng);
      expect(byes).toHaveLength(3);
      expect(series).toHaveLength(8);

      const ids = series.map((s) => s.id);
      expect(ids).toContain('WB_QF1');
      expect(ids).toContain('WB_SF1');
      expect(ids).toContain('WB_SF2');
      expect(ids).toContain('WB_F');
      expect(ids).toContain('LB_R1');
      expect(ids).toContain('LB_R2');
      expect(ids).toContain('LB_F');
      expect(ids).toContain('GF1');
    });

    it('creates valid bracket for 6 players (2 Byes, 10 series)', () => {
      const { series, byes } = generateDoubleEliminationBracket(p6, identityRng);
      expect(byes).toHaveLength(2);
      expect(series).toHaveLength(10);
      expect(series.map((s) => s.id)).toContain('LB_SF');
    });

    it('creates valid bracket for 7 players (1 Bye, 12 series)', () => {
      const { series, byes } = generateDoubleEliminationBracket(p7, identityRng);
      expect(byes).toHaveLength(1);
      expect(series).toHaveLength(12);
    });

    it('creates valid bracket for 8 players (0 Byes, 14 series)', () => {
      const { series, byes } = generateDoubleEliminationBracket(p8, identityRng);
      expect(byes).toHaveLength(0);
      expect(series).toHaveLength(14);
    });

    it('creates valid bracket for 9 players (7 Byes, 15 series with Play-in WB_R16_1)', () => {
      const { series, byes } = generateDoubleEliminationBracket(p9, identityRng);
      expect(byes).toHaveLength(7);
      expect(series).toHaveLength(15);
      expect(series.map((s) => s.id)).toContain('WB_R16_1');
    });

    it('creates valid bracket for 10 players (6 Byes, 17 series with 2 Play-ins and LB_R0_1)', () => {
      const { series, byes } = generateDoubleEliminationBracket(p10, identityRng);
      expect(byes).toHaveLength(6);
      expect(series).toHaveLength(17);
      const ids = series.map((s) => s.id);
      expect(ids).toContain('WB_R16_1');
      expect(ids).toContain('WB_R16_2');
      expect(ids).toContain('LB_R0_1');
    });
  });

  describe('series progression and loser drops (advanceDoubleEliminationSeries)', () => {
    it('correctly drops WB losers to LB and advances WB winners', () => {
      let { series } = generateDoubleEliminationBracket(p4, identityRng);

      // WB_SF1: p1 vs p2. Score 2-0 for p1
      series = setLegScore(series, 'WB_SF1', 'leg1', 'a', 2, 'single_match');
      series = setLegScore(series, 'WB_SF1', 'leg1', 'b', 0, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'WB_SF1', 'single_match');

      const wbF = series.find((s) => s.id === 'WB_F')!;
      const lbR1 = series.find((s) => s.id === 'LB_R1')!;

      // Winner p1 advances to WB_F side 'a'
      expect(wbF.playerA).toBe('p1');
      // Loser p2 drops to LB_R1 side 'a'
      expect(lbR1.playerA).toBe('p2');

      // WB_SF2: p3 vs p4. Score 1-3 for p4
      series = setLegScore(series, 'WB_SF2', 'leg1', 'a', 1, 'single_match');
      series = setLegScore(series, 'WB_SF2', 'leg1', 'b', 3, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'WB_SF2', 'single_match');

      const wbF_updated = series.find((s) => s.id === 'WB_F')!;
      const lbR1_updated = series.find((s) => s.id === 'LB_R1')!;

      // Winner p4 advances to WB_F side 'b'
      expect(wbF_updated.playerB).toBe('p4');
      // Loser p3 drops to LB_R1 side 'b'
      expect(lbR1_updated.playerB).toBe('p3');
    });
  });

  describe('Grand Final without Reset (WB Champion wins GF1)', () => {
    it('crowns WB Champion directly when winning GF1', () => {
      let { series } = generateDoubleEliminationBracket(p4, identityRng);

      // WB_SF1: p1 (2) vs p2 (0) -> p1 win
      series = setLegScore(series, 'WB_SF1', 'leg1', 'a', 2, 'single_match');
      series = setLegScore(series, 'WB_SF1', 'leg1', 'b', 0, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'WB_SF1', 'single_match');

      // WB_SF2: p3 (0) vs p4 (1) -> p4 win
      series = setLegScore(series, 'WB_SF2', 'leg1', 'a', 0, 'single_match');
      series = setLegScore(series, 'WB_SF2', 'leg1', 'b', 1, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'WB_SF2', 'single_match');

      // WB_F: p1 (3) vs p4 (1) -> p1 is WB Champion!
      series = setLegScore(series, 'WB_F', 'leg1', 'a', 3, 'single_match');
      series = setLegScore(series, 'WB_F', 'leg1', 'b', 1, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'WB_F', 'single_match');

      // LB_R1: p2 (2) vs p3 (1) -> p2 win, p3 is 4th place
      series = setLegScore(series, 'LB_R1', 'leg1', 'a', 2, 'single_match');
      series = setLegScore(series, 'LB_R1', 'leg1', 'b', 1, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'LB_R1', 'single_match');

      // LB_F: p2 (2) vs p4 (0) -> p2 is LB Champion, p4 is 3rd place
      series = setLegScore(series, 'LB_F', 'leg1', 'a', 2, 'single_match');
      series = setLegScore(series, 'LB_F', 'leg1', 'b', 0, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'LB_F', 'single_match');

      // GF1: p1 (WB Champion) vs p2 (LB Champion)
      const gf1 = series.find((s) => s.id === 'GF1')!;
      expect(gf1.playerA).toBe('p1');
      expect(gf1.playerB).toBe('p2');

      // p1 wins GF1 (2 - 0)
      series = setLegScore(series, 'GF1', 'leg1', 'a', 2, 'single_match');
      series = setLegScore(series, 'GF1', 'leg1', 'b', 0, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'GF1', 'single_match');

      const evaluation = evaluateGrandFinal(series, 'single_match');
      expect(evaluation.isComplete).toBe(true);
      expect(evaluation.isResetRequired).toBe(false);
      expect(evaluation.champion).toBe('p1');
      expect(evaluation.runnerUp).toBe('p2');
      expect(evaluation.thirdPlace).toBe('p4');
      expect(evaluation.fourthPlace).toBe('p3');

      expect(isDoubleEliminationComplete(series, 'single_match')).toBe(true);

      const podium = getDoubleEliminationPodium(series, 'single_match');
      expect(podium).toEqual({
        champion: 'p1',
        runnerUp: 'p2',
        third: 'p4',
        fourth: 'p3',
      });

      // No GF2 created
      expect(series.find((s) => s.id === 'GF2')).toBeUndefined();
    });
  });

  describe('Grand Final WITH Reset (LB Champion wins GF1)', () => {
    function setupGrandFinal(seriesInput: Series[]): Series[] {
      let series = seriesInput;
      // WB_SF1: p1 beats p2
      series = setLegScore(series, 'WB_SF1', 'leg1', 'a', 2, 'single_match');
      series = setLegScore(series, 'WB_SF1', 'leg1', 'b', 0, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'WB_SF1', 'single_match');

      // WB_SF2: p4 beats p3
      series = setLegScore(series, 'WB_SF2', 'leg1', 'a', 0, 'single_match');
      series = setLegScore(series, 'WB_SF2', 'leg1', 'b', 1, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'WB_SF2', 'single_match');

      // WB_F: p1 beats p4 -> p1 WB Champion
      series = setLegScore(series, 'WB_F', 'leg1', 'a', 3, 'single_match');
      series = setLegScore(series, 'WB_F', 'leg1', 'b', 1, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'WB_F', 'single_match');

      // LB_R1: p2 beats p3 -> p3 is 4th
      series = setLegScore(series, 'LB_R1', 'leg1', 'a', 2, 'single_match');
      series = setLegScore(series, 'LB_R1', 'leg1', 'b', 1, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'LB_R1', 'single_match');

      // LB_F: p2 beats p4 -> p2 LB Champion, p4 is 3rd
      series = setLegScore(series, 'LB_F', 'leg1', 'a', 2, 'single_match');
      series = setLegScore(series, 'LB_F', 'leg1', 'b', 0, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'LB_F', 'single_match');

      return series;
    }

    it('triggers Grand Final Reset GF2 when LB Champion wins GF1', () => {
      const { series: initialSeries } = generateDoubleEliminationBracket(
        p4,
        identityRng
      );
      let series = setupGrandFinal(initialSeries);

      // GF1: p1 (WB Champ) vs p2 (LB Champ). p2 WINS GF1 (0 - 1)!
      series = setLegScore(series, 'GF1', 'leg1', 'a', 0, 'single_match');
      series = setLegScore(series, 'GF1', 'leg1', 'b', 1, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'GF1', 'single_match');

      // GF2 must be automatically generated and appended
      const gf2 = series.find((s) => s.id === 'GF2');
      expect(gf2).toBeDefined();
      expect(gf2?.playerA).toBe('p1');
      expect(gf2?.playerB).toBe('p2');
      expect(gf2?.confirmed).toBe(false);

      const evaluation = evaluateGrandFinal(series, 'single_match');
      expect(evaluation.isComplete).toBe(false);
      expect(evaluation.isResetRequired).toBe(true);
      expect(evaluation.champion).toBeNull();
      expect(isDoubleEliminationComplete(series, 'single_match')).toBe(false);

      expect(() => getDoubleEliminationPodium(series, 'single_match')).toThrowError(
        /aún no finalizó/
      );
    });

    it('crowns WB Champion if they win GF2 (Bracket Reset won by WB)', () => {
      const { series: initialSeries } = generateDoubleEliminationBracket(
        p4,
        identityRng
      );
      let series = setupGrandFinal(initialSeries);

      // GF1: p2 wins (0-1) -> triggers GF2
      series = setLegScore(series, 'GF1', 'leg1', 'a', 0, 'single_match');
      series = setLegScore(series, 'GF1', 'leg1', 'b', 1, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'GF1', 'single_match');

      // GF2: p1 wins (3-1)!
      series = setLegScore(series, 'GF2', 'leg1', 'a', 3, 'single_match');
      series = setLegScore(series, 'GF2', 'leg1', 'b', 1, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'GF2', 'single_match');

      const evaluation = evaluateGrandFinal(series, 'single_match');
      expect(evaluation.isComplete).toBe(true);
      expect(evaluation.isResetRequired).toBe(false);
      expect(evaluation.champion).toBe('p1');
      expect(evaluation.runnerUp).toBe('p2');
      expect(evaluation.thirdPlace).toBe('p4');
      expect(evaluation.fourthPlace).toBe('p3');

      const podium = getDoubleEliminationPodium(series, 'single_match');
      expect(podium.champion).toBe('p1');
      expect(podium.runnerUp).toBe('p2');
    });

    it('crowns LB Champion if they win GF2 (Bracket Reset won by LB)', () => {
      const { series: initialSeries } = generateDoubleEliminationBracket(
        p4,
        identityRng
      );
      let series = setupGrandFinal(initialSeries);

      // GF1: p2 wins (0-1) -> triggers GF2
      series = setLegScore(series, 'GF1', 'leg1', 'a', 0, 'single_match');
      series = setLegScore(series, 'GF1', 'leg1', 'b', 1, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'GF1', 'single_match');

      // GF2: p2 wins again (0-2)!
      series = setLegScore(series, 'GF2', 'leg1', 'a', 0, 'single_match');
      series = setLegScore(series, 'GF2', 'leg1', 'b', 2, 'single_match');
      series = advanceDoubleEliminationSeries(series, 'GF2', 'single_match');

      const evaluation = evaluateGrandFinal(series, 'single_match');
      expect(evaluation.isComplete).toBe(true);
      expect(evaluation.isResetRequired).toBe(false);
      expect(evaluation.champion).toBe('p2');
      expect(evaluation.runnerUp).toBe('p1');
      expect(evaluation.thirdPlace).toBe('p4');
      expect(evaluation.fourthPlace).toBe('p3');

      const podium = getDoubleEliminationPodium(series, 'single_match');
      expect(podium.champion).toBe('p2');
      expect(podium.runnerUp).toBe('p1');
    });
  });

  describe('Two-Legged format and penalty tiebreak', () => {
    it('supports two-legged format with global tie and penalty resolution', () => {
      const { series: initialSeries } = generateDoubleEliminationBracket(
        p4,
        identityRng
      );
      let series = initialSeries;

      // WB_SF1: Leg 1: 1-1, Leg 2: 1-1 -> Tied global (2-2). Penalties: p1
      series = setLegScore(series, 'WB_SF1', 'leg1', 'a', 1, 'two_legged');
      series = setLegScore(series, 'WB_SF1', 'leg1', 'b', 1, 'two_legged');
      series = setLegScore(series, 'WB_SF1', 'leg2', 'a', 1, 'two_legged');
      series = setLegScore(series, 'WB_SF1', 'leg2', 'b', 1, 'two_legged');

      // Set penalty winner
      series = series.map((s) =>
        s.id === 'WB_SF1' ? { ...s, penaltyWinner: 'p1' } : s
      );

      series = advanceDoubleEliminationSeries(series, 'WB_SF1', 'two_legged');

      const sf1 = series.find((s) => s.id === 'WB_SF1')!;
      expect(sf1.confirmed).toBe(true);
      expect(sf1.winner).toBe('p1');
      expect(sf1.loser).toBe('p2');

      const wbF = series.find((s) => s.id === 'WB_F')!;
      expect(wbF.playerA).toBe('p1');
    });

    it('generateDoubleEliminationBracketFromOrder respects exact given order without shuffling (RF-87)', () => {
      const players: PlayerId[] = ['A', 'B', 'C', 'D'];
      const bracket = generateDoubleEliminationBracketFromOrder(players);
      expect(bracket.shuffledOrder).toEqual(['A', 'B', 'C', 'D']);
      const sf1 = bracket.series.find((s) => s.id === 'WB_SF1')!;
      const sf2 = bracket.series.find((s) => s.id === 'WB_SF2')!;
      expect(sf1.playerA).toBe('A');
      expect(sf1.playerB).toBe('B');
      expect(sf2.playerA).toBe('C');
      expect(sf2.playerB).toBe('D');
    });
  });
});

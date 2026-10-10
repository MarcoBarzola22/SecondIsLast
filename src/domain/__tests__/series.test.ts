import { describe, expect, it } from 'vitest';
import { generateBracket } from '../bracket';
import {
  canEditSeries,
  confirmSeries,
  getSeriesResult,
  isBracketComplete,
  isSeriesReady,
  isValidGoal,
  reopenSeries,
  setLegScore,
  setPenaltyWinner,
} from '../series';
import type { Series } from '../types';

describe('series - domain logic (RF-21 to RF-29)', () => {
  describe('isValidGoal (RF-22)', () => {
    it('accepts integers between 0 and 99', () => {
      expect(isValidGoal(0)).toBe(true);
      expect(isValidGoal(5)).toBe(true);
      expect(isValidGoal(99)).toBe(true);
    });

    it('rejects numbers outside [0, 99], decimals, and non-numbers', () => {
      expect(isValidGoal(-1)).toBe(false);
      expect(isValidGoal(100)).toBe(false);
      expect(isValidGoal(2.5)).toBe(false);
      expect(isValidGoal('3')).toBe(false);
      expect(isValidGoal(null)).toBe(false);
    });
  });

  describe('isSeriesReady and getSeriesResult (RF-21, RF-23, RF-24, RF-25, RF-29)', () => {
    const unreadySeries: Series = {
      id: 'SF1',
      round: 'semifinal',
      playerA: null,
      playerB: 'p2',
      leg1: { a: null, b: null },
      leg2: { a: null, b: null },
      penaltyWinner: null,
      confirmed: false,
      winnerTo: null,
      loserTo: null,
    };

    it('identifies unready series where a participant is missing (RF-27)', () => {
      expect(isSeriesReady(unreadySeries)).toBe(false);
      const res = getSeriesResult(unreadySeries);
      expect(res.isReady).toBe(false);
      expect(res.canConfirm).toBe(false);
    });

    const readySeries: Series = {
      id: 'SF1',
      round: 'semifinal',
      playerA: 'p1',
      playerB: 'p2',
      leg1: { a: null, b: null },
      leg2: { a: null, b: null },
      penaltyWinner: null,
      confirmed: false,
      winnerTo: null,
      loserTo: null,
    };

    it('computes running score when partially entered and blocks confirmation (RF-23, RF-24)', () => {
      const withLeg1: Series = {
        ...readySeries,
        leg1: { a: 2, b: 1 },
      };
      const res = getSeriesResult(withLeg1);
      expect(res.isReady).toBe(true);
      expect(res.isComplete).toBe(false);
      expect(res.globalA).toBe(2);
      expect(res.globalB).toBe(1);
      expect(res.canConfirm).toBe(false);
    });

    it('resolves clear winner and loser when complete and untied (RF-24)', () => {
      const completeSeries: Series = {
        ...readySeries,
        leg1: { a: 3, b: 1 },
        leg2: { a: 1, b: 2 }, // A total: 3+1 = 4. B total: 1+2 = 3.
      };
      const res = getSeriesResult(completeSeries);
      expect(res.isComplete).toBe(true);
      expect(res.globalA).toBe(4);
      expect(res.globalB).toBe(3);
      expect(res.isTied).toBe(false);
      expect(res.winner).toBe('p1');
      expect(res.loser).toBe('p2');
      expect(res.canConfirm).toBe(true);
    });

    it('requires penalty selection when global is tied (RF-25, RF-29)', () => {
      const tiedSeries: Series = {
        ...readySeries,
        leg1: { a: 2, b: 1 },
        leg2: { a: 1, b: 2 }, // A total = 3, B total = 3
      };
      const resBeforePenalties = getSeriesResult(tiedSeries);
      expect(resBeforePenalties.isTied).toBe(true);
      expect(resBeforePenalties.winner).toBeNull();
      expect(resBeforePenalties.canConfirm).toBe(false);

      const withPenalty: Series = {
        ...tiedSeries,
        penaltyWinner: 'p2',
      };
      const resAfterPenalties = getSeriesResult(withPenalty);
      expect(resAfterPenalties.isTied).toBe(true);
      expect(resAfterPenalties.winner).toBe('p2');
      expect(resAfterPenalties.loser).toBe('p1');
      expect(resAfterPenalties.canConfirm).toBe(true);
      // Penalties do NOT affect aggregate score (RF-29)
      expect(resAfterPenalties.globalA).toBe(3);
      expect(resAfterPenalties.globalB).toBe(3);
    });
  });

  describe('setLegScore and setPenaltyWinner', () => {
    const list: Series[] = [
      {
        id: 'SF1',
        round: 'semifinal',
        playerA: 'p1',
        playerB: 'p2',
        leg1: { a: 2, b: 2 },
        leg2: { a: 1, b: 1 },
        penaltyWinner: 'p1',
        confirmed: false,
        winnerTo: null,
        loserTo: null,
      },
    ];

    it('updates leg score and resets penaltyWinner if tie is broken', () => {
      // Leg 2 side 'a' changes from 1 to 2 -> Total A = 4, Total B = 3 (no longer tied)
      const updated = setLegScore(list, 'SF1', 'leg2', 'a', 2);
      expect(updated[0]!.leg2.a).toBe(2);
      expect(updated[0]!.penaltyWinner).toBeNull();
    });

    it('throws when setting an invalid goal number', () => {
      expect(() => setLegScore(list, 'SF1', 'leg1', 'a', -1)).toThrow(
        /Goles inválidos/
      );
    });

    it('allows setting valid penalty winner', () => {
      const updated = setPenaltyWinner(list, 'SF1', 'p2');
      expect(updated[0]!.penaltyWinner).toBe('p2');
    });

    it('throws when setting a penalty winner who is not playing the series', () => {
      expect(() => setPenaltyWinner(list, 'SF1', 'p999')).toThrow(
        /ganador por penales debe ser uno de los dos participantes/
      );
    });
  });

  describe('confirmSeries, progression, and reopening (RF-26, RF-28, RF-30)', () => {
    it('advances winner and loser in 4-player bracket correctly', () => {
      const { series } = generateBracket(['p1', 'p2', 'p3', 'p4'], () => 0);
      // SF1: p1 vs p2. SF2: p3 vs p4.
      const sf1Before = series.find((s) => s.id === 'SF1')!;
      const expectedWinner = sf1Before.playerA!;
      const expectedLoser = sf1Before.playerB!;

      let current = setLegScore(series, 'SF1', 'leg1', 'a', 3);
      current = setLegScore(current, 'SF1', 'leg1', 'b', 0);
      current = setLegScore(current, 'SF1', 'leg2', 'a', 1);
      current = setLegScore(current, 'SF1', 'leg2', 'b', 0);

      // Confirm SF1
      current = confirmSeries(current, 'SF1');
      const sf1 = current.find((s) => s.id === 'SF1')!;
      const final = current.find((s) => s.id === 'F')!;
      const third = current.find((s) => s.id === 'TP')!;

      expect(sf1.confirmed).toBe(true);
      // Winner to F side a, Loser to TP side a
      expect(final.playerA).toBe(expectedWinner);
      expect(third.playerA).toBe(expectedLoser);
    });

    it('allows editing confirmed series if downstream has not started (RF-28)', () => {
      const { series } = generateBracket(['p1', 'p2', 'p3', 'p4'], () => 0);
      let current = setLegScore(series, 'SF1', 'leg1', 'a', 1);
      current = setLegScore(current, 'SF1', 'leg1', 'b', 0);
      current = setLegScore(current, 'SF1', 'leg2', 'a', 1);
      current = setLegScore(current, 'SF1', 'leg2', 'b', 0);
      current = confirmSeries(current, 'SF1');

      expect(canEditSeries(current, 'SF1')).toBe(true);

      current = reopenSeries(current, 'SF1');
      expect(current.find((s) => s.id === 'SF1')!.confirmed).toBe(false);
    });

    it('blocks editing confirmed series if downstream match has started (RF-28)', () => {
      const { series } = generateBracket(['p1', 'p2', 'p3', 'p4'], () => 0);
      let current = setLegScore(series, 'SF1', 'leg1', 'a', 1);
      current = setLegScore(current, 'SF1', 'leg1', 'b', 0);
      current = setLegScore(current, 'SF1', 'leg2', 'a', 1);
      current = setLegScore(current, 'SF1', 'leg2', 'b', 0);
      current = confirmSeries(current, 'SF1');

      // Now downstream Final enters a goal
      current = setLegScore(current, 'F', 'leg1', 'a', 1);

      expect(canEditSeries(current, 'SF1')).toBe(false);
      expect(() => reopenSeries(current, 'SF1')).toThrow(
        /No se puede editar esta llave/
      );
    });

    it('reports bracket complete only when both Final and Third place are confirmed (RF-30)', () => {
      const { series } = generateBracket(['p1', 'p2', 'p3', 'p4'], () => 0);
      expect(isBracketComplete(series)).toBe(false);

      const completed = series.map((s) => {
        if (s.id === 'F' || s.id === 'TP') {
          return { ...s, confirmed: true };
        }
        return s;
      });

      expect(isBracketComplete(completed)).toBe(true);
    });
  });

  describe('single_match format (RF-21, RF-49)', () => {
    const singleSeries: Series = {
      id: 'SF1',
      round: 'semifinal',
      playerA: 'p1',
      playerB: 'p2',
      leg1: { a: null, b: null },
      leg2: { a: null, b: null },
      penaltyWinner: null,
      confirmed: false,
      winnerTo: { seriesId: 'F', side: 'a' },
      loserTo: { seriesId: 'TP', side: 'a' },
    };

    it('requires only leg1 to be complete in single_match', () => {
      let res = getSeriesResult(singleSeries, 'single_match');
      expect(res.isComplete).toBe(false);
      expect(res.canConfirm).toBe(false);

      const withLeg1: Series = {
        ...singleSeries,
        leg1: { a: 3, b: 1 },
      };
      res = getSeriesResult(withLeg1, 'single_match');
      expect(res.isComplete).toBe(true);
      expect(res.globalA).toBe(3);
      expect(res.globalB).toBe(1);
      expect(res.winner).toBe('p1');
      expect(res.loser).toBe('p2');
      expect(res.canConfirm).toBe(true);
    });

    it('identifies tie in single_match and requires penalties to confirm', () => {
      const tied: Series = {
        ...singleSeries,
        leg1: { a: 2, b: 2 },
      };
      let res = getSeriesResult(tied, 'single_match');
      expect(res.isComplete).toBe(true);
      expect(res.isTied).toBe(true);
      expect(res.winner).toBeNull();
      expect(res.canConfirm).toBe(false);

      const withPenalties: Series = {
        ...tied,
        penaltyWinner: 'p2',
      };
      res = getSeriesResult(withPenalties, 'single_match');
      expect(res.winner).toBe('p2');
      expect(res.loser).toBe('p1');
      expect(res.canConfirm).toBe(true);
    });

    it('supports confirmSeries and score updates in single_match', () => {
      const seriesList = [singleSeries];
      let updated = setLegScore(seriesList, 'SF1', 'leg1', 'a', 2, 'single_match');
      updated = setLegScore(updated, 'SF1', 'leg1', 'b', 0, 'single_match');

      const confirmed = confirmSeries(updated, 'SF1', 'single_match');
      expect(confirmed[0]!.confirmed).toBe(true);
      expect(confirmed[0]!.winner).toBe('p1');
      expect(confirmed[0]!.loser).toBe('p2');
    });

    it('settles and persists winner and loser on Final series without winnerTo', () => {
      const finalSeries: Series = {
        id: 'F',
        round: 'final',
        playerA: 'p1',
        playerB: 'p2',
        leg1: { a: 1, b: 0 },
        leg2: { a: null, b: null },
        penaltyWinner: null,
        confirmed: false,
        winnerTo: null,
        loserTo: null,
      };

      const confirmed = confirmSeries([finalSeries], 'F', 'single_match');
      expect(confirmed[0]!.confirmed).toBe(true);
      expect(confirmed[0]!.winner).toBe('p1');
      expect(confirmed[0]!.loser).toBe('p2');

      const reopened = reopenSeries(confirmed, 'F', 'single_match');
      expect(reopened[0]!.confirmed).toBe(false);
      expect(reopened[0]!.winner).toBeNull();
      expect(reopened[0]!.loser).toBeNull();
    });
  });
});


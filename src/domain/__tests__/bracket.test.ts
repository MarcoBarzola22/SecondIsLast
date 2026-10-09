import { describe, expect, it } from 'vitest';
import { generateBracket } from '../bracket';
import { createMulberry32 } from './helpers';

describe('bracket - asymmetric generation (RF-17, RF-18, RF-19)', () => {
  it('throws an error if participant count is out of range [4, 6]', () => {
    expect(() => generateBracket(['p1', 'p2', 'p3'])).toThrow(
      /debe ser entre 4 y 6/
    );
    expect(() =>
      generateBracket(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'])
    ).toThrow(/debe ser entre 4 y 6/);
  });

  it('throws an error if participant list has duplicate IDs', () => {
    expect(() => generateBracket(['p1', 'p1', 'p2', 'p3'])).toThrow(
      /participantes duplicados/
    );
  });

  describe('4 participants', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];

    it('generates 4 series and 0 byes with correct wiring', () => {
      const result = generateBracket(players, createMulberry32(111));
      const { series, byes, shuffledOrder } = result;

      expect(byes).toHaveLength(0);
      expect(series).toHaveLength(4);
      expect(shuffledOrder).toHaveLength(4);

      const sf1 = series.find((s) => s.id === 'SF1')!;
      const sf2 = series.find((s) => s.id === 'SF2')!;
      const final = series.find((s) => s.id === 'F')!;
      const third = series.find((s) => s.id === 'TP')!;

      expect(sf1).toBeDefined();
      expect(sf2).toBeDefined();
      expect(final).toBeDefined();
      expect(third).toBeDefined();

      // SF1 and SF2 participants match shuffled order
      expect(sf1.playerA).toBe(shuffledOrder[0]);
      expect(sf1.playerB).toBe(shuffledOrder[1]);
      expect(sf1.winnerTo).toEqual({ seriesId: 'F', side: 'a' });
      expect(sf1.loserTo).toEqual({ seriesId: 'TP', side: 'a' });

      expect(sf2.playerA).toBe(shuffledOrder[2]);
      expect(sf2.playerB).toBe(shuffledOrder[3]);
      expect(sf2.winnerTo).toEqual({ seriesId: 'F', side: 'b' });
      expect(sf2.loserTo).toEqual({ seriesId: 'TP', side: 'b' });

      // Final and Third place initially pending
      expect(final.playerA).toBeNull();
      expect(final.playerB).toBeNull();
      expect(third.playerA).toBeNull();
      expect(third.playerB).toBeNull();
    });
  });

  describe('5 participants', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];

    it('generates 1 QF, 2 SF, 1 F, 1 TP and 3 Byes', () => {
      const result = generateBracket(players, createMulberry32(222));
      const { series, byes, shuffledOrder } = result;

      expect(byes).toEqual([
        shuffledOrder[2],
        shuffledOrder[3],
        shuffledOrder[4],
      ]);
      expect(series).toHaveLength(5);

      const qf1 = series.find((s) => s.id === 'QF1')!;
      const sf1 = series.find((s) => s.id === 'SF1')!;
      const sf2 = series.find((s) => s.id === 'SF2')!;
      const final = series.find((s) => s.id === 'F')!;
      const third = series.find((s) => s.id === 'TP')!;

      // QF1
      expect(qf1.playerA).toBe(shuffledOrder[0]);
      expect(qf1.playerB).toBe(shuffledOrder[1]);
      expect(qf1.winnerTo).toEqual({ seriesId: 'SF1', side: 'a' });
      expect(qf1.loserTo).toBeNull();

      // SF1: QF1 winner awaits vs P2 (bye)
      expect(sf1.playerA).toBeNull();
      expect(sf1.playerB).toBe(shuffledOrder[2]);
      expect(sf1.winnerTo).toEqual({ seriesId: 'F', side: 'a' });
      expect(sf1.loserTo).toEqual({ seriesId: 'TP', side: 'a' });

      // SF2: P3 vs P4 (byes direct)
      expect(sf2.playerA).toBe(shuffledOrder[3]);
      expect(sf2.playerB).toBe(shuffledOrder[4]);
      expect(sf2.winnerTo).toEqual({ seriesId: 'F', side: 'b' });
      expect(sf2.loserTo).toEqual({ seriesId: 'TP', side: 'b' });

      // Final and Third Place
      expect(final.playerA).toBeNull();
      expect(final.playerB).toBeNull();
      expect(third.playerA).toBeNull();
      expect(third.playerB).toBeNull();
    });
  });

  describe('6 participants', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

    it('generates 2 QF, 2 SF, 1 F, 1 TP and 2 Byes', () => {
      const result = generateBracket(players, createMulberry32(333));
      const { series, byes, shuffledOrder } = result;

      expect(byes).toEqual([shuffledOrder[4], shuffledOrder[5]]);
      expect(series).toHaveLength(6);

      const qf1 = series.find((s) => s.id === 'QF1')!;
      const qf2 = series.find((s) => s.id === 'QF2')!;
      const sf1 = series.find((s) => s.id === 'SF1')!;
      const sf2 = series.find((s) => s.id === 'SF2')!;
      const final = series.find((s) => s.id === 'F')!;
      const third = series.find((s) => s.id === 'TP')!;

      // QF1 and QF2
      expect(qf1.playerA).toBe(shuffledOrder[0]);
      expect(qf1.playerB).toBe(shuffledOrder[1]);
      expect(qf1.winnerTo).toEqual({ seriesId: 'SF1', side: 'a' });
      expect(qf1.loserTo).toBeNull();

      expect(qf2.playerA).toBe(shuffledOrder[2]);
      expect(qf2.playerB).toBe(shuffledOrder[3]);
      expect(qf2.winnerTo).toEqual({ seriesId: 'SF2', side: 'a' });
      expect(qf2.loserTo).toBeNull();

      // SF1 and SF2
      expect(sf1.playerA).toBeNull();
      expect(sf1.playerB).toBe(shuffledOrder[4]);
      expect(sf1.winnerTo).toEqual({ seriesId: 'F', side: 'a' });
      expect(sf1.loserTo).toEqual({ seriesId: 'TP', side: 'a' });

      expect(sf2.playerA).toBeNull();
      expect(sf2.playerB).toBe(shuffledOrder[5]);
      expect(sf2.winnerTo).toEqual({ seriesId: 'F', side: 'b' });
      expect(sf2.loserTo).toEqual({ seriesId: 'TP', side: 'b' });

      // Final and Third Place
      expect(final.playerA).toBeNull();
      expect(final.playerB).toBeNull();
      expect(third.playerA).toBeNull();
      expect(third.playerB).toBeNull();
    });
  });

  it('guarantees determinism with identical RNG', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const r1 = generateBracket(players, createMulberry32(444));
    const r2 = generateBracket(players, createMulberry32(444));

    expect(r1.shuffledOrder).toEqual(r2.shuffledOrder);
    expect(r1.byes).toEqual(r2.byes);
    expect(r1.series).toEqual(r2.series);
  });
});

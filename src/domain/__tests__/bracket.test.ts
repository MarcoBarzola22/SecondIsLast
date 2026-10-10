import { describe, expect, it } from 'vitest';
import { generateBracket } from '../bracket';
import { confirmSeries, setLegScore } from '../series';
import { createMulberry32 } from './helpers';

describe('bracket - asymmetric generation (RF-17, RF-18, RF-19)', () => {
  it('throws an error if participant count is out of range [4, 10]', () => {
    expect(() => generateBracket(['p1', 'p2', 'p3'])).toThrow(
      /debe ser entre 4 y 10/
    );
    expect(() =>
      generateBracket([
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
        'p11',
      ])
    ).toThrow(/debe ser entre 4 y 10/);
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

  describe('7 participants', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];

    it('generates 3 QF, 2 SF, 1 F, 1 TP and 1 Bye to Semis', () => {
      const result = generateBracket(players, createMulberry32(400));
      const { series, byes, shuffledOrder } = result;

      expect(byes).toEqual([shuffledOrder[6]]);
      expect(series).toHaveLength(7);

      const qf1 = series.find((s) => s.id === 'QF1')!;
      const qf2 = series.find((s) => s.id === 'QF2')!;
      const qf3 = series.find((s) => s.id === 'QF3')!;
      const sf1 = series.find((s) => s.id === 'SF1')!;
      const sf2 = series.find((s) => s.id === 'SF2')!;

      // 3 QFs
      expect(qf1.playerA).toBe(shuffledOrder[0]);
      expect(qf1.playerB).toBe(shuffledOrder[1]);
      expect(qf1.winnerTo).toEqual({ seriesId: 'SF1', side: 'a' });

      expect(qf2.playerA).toBe(shuffledOrder[2]);
      expect(qf2.playerB).toBe(shuffledOrder[3]);
      expect(qf2.winnerTo).toEqual({ seriesId: 'SF1', side: 'b' });

      expect(qf3.playerA).toBe(shuffledOrder[4]);
      expect(qf3.playerB).toBe(shuffledOrder[5]);
      expect(qf3.winnerTo).toEqual({ seriesId: 'SF2', side: 'a' });

      // SF1: QF1 winner vs QF2 winner
      expect(sf1.playerA).toBeNull();
      expect(sf1.playerB).toBeNull();
      expect(sf1.winnerTo).toEqual({ seriesId: 'F', side: 'a' });
      expect(sf1.loserTo).toEqual({ seriesId: 'TP', side: 'a' });

      // SF2: QF3 winner vs P6 (bye directly seeded)
      expect(sf2.playerA).toBeNull();
      expect(sf2.playerB).toBe(shuffledOrder[6]);
      expect(sf2.winnerTo).toEqual({ seriesId: 'F', side: 'b' });
      expect(sf2.loserTo).toEqual({ seriesId: 'TP', side: 'b' });
    });
  });

  describe('8 participants', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

    it('generates 4 QF, 2 SF, 1 F, 1 TP and 0 Byes', () => {
      const result = generateBracket(players, createMulberry32(500));
      const { series, byes, shuffledOrder } = result;

      expect(byes).toHaveLength(0);
      expect(series).toHaveLength(8);

      const qf1 = series.find((s) => s.id === 'QF1')!;
      const qf2 = series.find((s) => s.id === 'QF2')!;
      const qf3 = series.find((s) => s.id === 'QF3')!;
      const qf4 = series.find((s) => s.id === 'QF4')!;
      const sf1 = series.find((s) => s.id === 'SF1')!;
      const sf2 = series.find((s) => s.id === 'SF2')!;

      // 4 QFs
      expect(qf1.playerA).toBe(shuffledOrder[0]);
      expect(qf1.playerB).toBe(shuffledOrder[1]);
      expect(qf1.winnerTo).toEqual({ seriesId: 'SF1', side: 'a' });

      expect(qf2.playerA).toBe(shuffledOrder[2]);
      expect(qf2.playerB).toBe(shuffledOrder[3]);
      expect(qf2.winnerTo).toEqual({ seriesId: 'SF1', side: 'b' });

      expect(qf3.playerA).toBe(shuffledOrder[4]);
      expect(qf3.playerB).toBe(shuffledOrder[5]);
      expect(qf3.winnerTo).toEqual({ seriesId: 'SF2', side: 'a' });

      expect(qf4.playerA).toBe(shuffledOrder[6]);
      expect(qf4.playerB).toBe(shuffledOrder[7]);
      expect(qf4.winnerTo).toEqual({ seriesId: 'SF2', side: 'b' });

      // Semifinals await QF winners
      expect(sf1.playerA).toBeNull();
      expect(sf1.playerB).toBeNull();
      expect(sf2.playerA).toBeNull();
      expect(sf2.playerB).toBeNull();
    });
  });

  describe('9 participants', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'];

    it('generates 1 Octavos (Play-in), 4 QF, 2 SF, 1 F, 1 TP and 7 Byes to Cuartos', () => {
      const result = generateBracket(players, createMulberry32(600));
      const { series, byes, shuffledOrder } = result;

      expect(byes).toHaveLength(7);
      expect(byes).toEqual([
        shuffledOrder[2],
        shuffledOrder[3],
        shuffledOrder[4],
        shuffledOrder[5],
        shuffledOrder[6],
        shuffledOrder[7],
        shuffledOrder[8],
      ]);
      expect(series).toHaveLength(9);

      const r16_1 = series.find((s) => s.id === 'R16_1')!;
      const qf1 = series.find((s) => s.id === 'QF1')!;
      const qf2 = series.find((s) => s.id === 'QF2')!;
      const qf3 = series.find((s) => s.id === 'QF3')!;
      const qf4 = series.find((s) => s.id === 'QF4')!;

      expect(r16_1.round).toBe('round_of_16');
      expect(r16_1.playerA).toBe(shuffledOrder[0]);
      expect(r16_1.playerB).toBe(shuffledOrder[1]);
      expect(r16_1.winnerTo).toEqual({ seriesId: 'QF1', side: 'a' });

      // QF1 has R16_1 winner vs P2 (bye)
      expect(qf1.playerA).toBeNull();
      expect(qf1.playerB).toBe(shuffledOrder[2]);

      // QF2, QF3, QF4 have byes vs byes
      expect(qf2.playerA).toBe(shuffledOrder[3]);
      expect(qf2.playerB).toBe(shuffledOrder[4]);
      expect(qf3.playerA).toBe(shuffledOrder[5]);
      expect(qf3.playerB).toBe(shuffledOrder[6]);
      expect(qf4.playerA).toBe(shuffledOrder[7]);
      expect(qf4.playerB).toBe(shuffledOrder[8]);
    });
  });

  describe('10 participants', () => {
    const players = [
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

    it('generates 2 Octavos (Play-ins), 4 QF, 2 SF, 1 F, 1 TP and 6 Byes to Cuartos', () => {
      const result = generateBracket(players, createMulberry32(700));
      const { series, byes, shuffledOrder } = result;

      expect(byes).toHaveLength(6);
      expect(byes).toEqual([
        shuffledOrder[4],
        shuffledOrder[5],
        shuffledOrder[6],
        shuffledOrder[7],
        shuffledOrder[8],
        shuffledOrder[9],
      ]);
      expect(series).toHaveLength(10);

      const r16_1 = series.find((s) => s.id === 'R16_1')!;
      const r16_2 = series.find((s) => s.id === 'R16_2')!;
      const qf1 = series.find((s) => s.id === 'QF1')!;
      const qf2 = series.find((s) => s.id === 'QF2')!;
      const qf3 = series.find((s) => s.id === 'QF3')!;
      const qf4 = series.find((s) => s.id === 'QF4')!;

      // 2 Play-ins in Octavos
      expect(r16_1.round).toBe('round_of_16');
      expect(r16_1.playerA).toBe(shuffledOrder[0]);
      expect(r16_1.playerB).toBe(shuffledOrder[1]);
      expect(r16_1.winnerTo).toEqual({ seriesId: 'QF1', side: 'a' });

      expect(r16_2.round).toBe('round_of_16');
      expect(r16_2.playerA).toBe(shuffledOrder[2]);
      expect(r16_2.playerB).toBe(shuffledOrder[3]);
      expect(r16_2.winnerTo).toEqual({ seriesId: 'QF3', side: 'a' });

      // QF1 has R16_1 winner vs P4 (bye)
      expect(qf1.playerA).toBeNull();
      expect(qf1.playerB).toBe(shuffledOrder[4]);

      // QF2 has P5 vs P6
      expect(qf2.playerA).toBe(shuffledOrder[5]);
      expect(qf2.playerB).toBe(shuffledOrder[6]);

      // QF3 has R16_2 winner vs P7 (bye)
      expect(qf3.playerA).toBeNull();
      expect(qf3.playerB).toBe(shuffledOrder[7]);

      // QF4 has P8 vs P9
      expect(qf4.playerA).toBe(shuffledOrder[8]);
      expect(qf4.playerB).toBe(shuffledOrder[9]);
    });

    it('correctly propagates winners and losers across all rounds in 10-player bracket', () => {
      const result = generateBracket(players, createMulberry32(700));
      let currentSeries = result.series;

      // 1. Play Octavos R16_1: P0 beats P1 (2-0)
      const r16_1 = currentSeries.find((s) => s.id === 'R16_1')!;
      currentSeries = setLegScore(currentSeries, 'R16_1', 'leg1', 'a', 2, 'single_match');
      currentSeries = setLegScore(currentSeries, 'R16_1', 'leg1', 'b', 0, 'single_match');
      currentSeries = confirmSeries(currentSeries, 'R16_1', 'single_match');

      // QF1.playerA should now be P0
      expect(currentSeries.find((s) => s.id === 'QF1')!.playerA).toBe(r16_1.playerA);

      // 2. Play Octavos R16_2: P2 beats P3 (3-1)
      const r16_2 = currentSeries.find((s) => s.id === 'R16_2')!;
      currentSeries = setLegScore(currentSeries, 'R16_2', 'leg1', 'a', 3, 'single_match');
      currentSeries = setLegScore(currentSeries, 'R16_2', 'leg1', 'b', 1, 'single_match');
      currentSeries = confirmSeries(currentSeries, 'R16_2', 'single_match');

      // QF3.playerA should now be P2
      expect(currentSeries.find((s) => s.id === 'QF3')!.playerA).toBe(r16_2.playerA);
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

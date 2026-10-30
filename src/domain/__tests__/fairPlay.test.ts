import { describe, expect, it } from 'vitest';
import {
  calculateSuspensionInfo,
  createDefaultCardCounts,
  isValidCardCount,
  sortStandingsWithFairPlay,
  type StandingRowForTiebreak,
} from '../fairPlay';
import type { LeagueMatch } from '../types';

describe('domain - fairPlay (RF-61, RF-62, D20)', () => {
  describe('isValidCardCount (RF-61)', () => {
    it('accepts non-negative integers between 0 and 99', () => {
      expect(isValidCardCount(0)).toBe(true);
      expect(isValidCardCount(1)).toBe(true);
      expect(isValidCardCount(5)).toBe(true);
      expect(isValidCardCount(99)).toBe(true);
    });

    it('rejects numbers out of range, negative numbers, decimals and non-numbers', () => {
      expect(isValidCardCount(-1)).toBe(false);
      expect(isValidCardCount(100)).toBe(false);
      expect(isValidCardCount(2.5)).toBe(false);
      expect(isValidCardCount('2')).toBe(false);
      expect(isValidCardCount(null)).toBe(false);
      expect(isValidCardCount(undefined)).toBe(false);
      expect(isValidCardCount(NaN)).toBe(false);
    });
  });

  describe('createDefaultCardCounts', () => {
    it('returns 0 yellow and 0 red cards', () => {
      expect(createDefaultCardCounts()).toEqual({ yellow: 0, red: 0 });
    });
  });

  describe('sortStandingsWithFairPlay hierarchy (RF-62, D20)', () => {
    it('ranks by 1) Puntos (PTS desc)', () => {
      const rows: StandingRowForTiebreak[] = [
        { playerId: 'p1', displayName: 'Gómez, Nico', pts: 4, dg: 2, pg: 1 },
        { playerId: 'p2', displayName: 'Barzola, Marco', pts: 7, dg: 1, pg: 2 },
      ];

      const sorted = sortStandingsWithFairPlay(rows, []);
      expect(sorted[0]!.playerId).toBe('p2');
      expect(sorted[0]!.rank).toBe(1);
      expect(sorted[1]!.playerId).toBe('p1');
      expect(sorted[1]!.rank).toBe(2);
    });

    it('ranks by 2) Diferencia de Goles (DG desc) when PTS are tied', () => {
      const rows: StandingRowForTiebreak[] = [
        { playerId: 'p1', displayName: 'Gómez, Nico', pts: 6, dg: 1, pg: 2 },
        { playerId: 'p2', displayName: 'Barzola, Marco', pts: 6, dg: 4, pg: 2 },
      ];

      const sorted = sortStandingsWithFairPlay(rows, []);
      expect(sorted[0]!.playerId).toBe('p2');
      expect(sorted[0]!.rank).toBe(1);
      expect(sorted[1]!.playerId).toBe('p1');
      expect(sorted[1]!.rank).toBe(2);
    });

    it('ranks by 3) Duelo Directo (H2H - Single Match) when PTS and DG are tied', () => {
      // Both have 6 pts and +2 DG
      const rows: StandingRowForTiebreak[] = [
        { playerId: 'p1', displayName: 'Barzola, Marco', pts: 6, dg: 2, pg: 2 },
        { playerId: 'p2', displayName: 'Fernández, Lucas', pts: 6, dg: 2, pg: 2 },
      ];

      // Direct match: p2 beat p1 2 - 1
      const matches: LeagueMatch[] = [
        {
          id: 'R1_M1',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 1,
          scoreB: 2,
          confirmed: true,
        },
      ];

      const sorted = sortStandingsWithFairPlay(rows, matches);
      expect(sorted[0]!.playerId).toBe('p2');
      expect(sorted[0]!.rank).toBe(1);
      expect(sorted[1]!.playerId).toBe('p1');
      expect(sorted[1]!.rank).toBe(2);
    });

    it('ranks by 3) Duelo Directo (H2H - Two-legged aggregate DG) when H2H points are tied', () => {
      // Both have 6 pts and +1 DG
      const rows: StandingRowForTiebreak[] = [
        { playerId: 'p1', displayName: 'Barzola, Marco', pts: 6, dg: 1, pg: 2 },
        { playerId: 'p2', displayName: 'Fernández, Lucas', pts: 6, dg: 1, pg: 2 },
      ];

      // Two legs:
      // Leg 1: p1 wins 1 - 0
      // Leg 2: p2 wins 3 - 1
      // Aggregate in H2H: p2 scored 3 and conceded 2 (DG +1), p1 scored 2 and conceded 3 (DG -1)
      const matches: LeagueMatch[] = [
        {
          id: 'R1_M1',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 1,
          scoreB: 0,
          confirmed: true,
        },
        {
          id: 'R4_M1',
          round: 4,
          playerA: 'p2',
          playerB: 'p1',
          scoreA: 3,
          scoreB: 1,
          confirmed: true,
        },
      ];

      const sorted = sortStandingsWithFairPlay(rows, matches);
      expect(sorted[0]!.playerId).toBe('p2');
      expect(sorted[0]!.rank).toBe(1);
      expect(sorted[1]!.playerId).toBe('p1');
      expect(sorted[1]!.rank).toBe(2);
    });

    it('ranks 3-way tie correctly via mini-table H2H', () => {
      // 3 players tied on 6 PTS and +2 DG: p1, p2, p3
      const rows: StandingRowForTiebreak[] = [
        { playerId: 'p1', displayName: 'Barzola, Marco', pts: 6, dg: 2, pg: 2 },
        { playerId: 'p2', displayName: 'Fernández, Lucas', pts: 6, dg: 2, pg: 2 },
        { playerId: 'p3', displayName: 'Gómez, Nico', pts: 6, dg: 2, pg: 2 },
      ];

      // Direct matches:
      // p1 vs p2: p1 wins 3 - 0 (p1: 3 pts, +3 dg; p2: 0 pts, -3 dg)
      // p1 vs p3: p1 wins 2 - 0 (p1: 3 pts, +2 dg; p3: 0 pts, -2 dg)
      // p2 vs p3: draw 1 - 1 (p2: 1 pt, 0 dg; p3: 1 pt, 0 dg)
      // Total H2H:
      // p1: 6 pts
      // p3: 1 pt, -2 dg
      // p2: 1 pt, -3 dg
      const matches: LeagueMatch[] = [
        {
          id: 'R1_M1',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 3,
          scoreB: 0,
          confirmed: true,
        },
        {
          id: 'R2_M1',
          round: 2,
          playerA: 'p1',
          playerB: 'p3',
          scoreA: 2,
          scoreB: 0,
          confirmed: true,
        },
        {
          id: 'R3_M1',
          round: 3,
          playerA: 'p2',
          playerB: 'p3',
          scoreA: 1,
          scoreB: 1,
          confirmed: true,
        },
      ];

      const sorted = sortStandingsWithFairPlay(rows, matches);
      expect(sorted[0]!.playerId).toBe('p1');
      expect(sorted[0]!.rank).toBe(1);
      expect(sorted[1]!.playerId).toBe('p3');
      expect(sorted[1]!.rank).toBe(2);
      expect(sorted[2]!.playerId).toBe('p2');
      expect(sorted[2]!.rank).toBe(3);
    });

    it('falls through to 4) Partidos Ganados (PG desc) when H2H is completely tied', () => {
      // p1 and p2 tied on 5 PTS, 0 DG, and their direct match was a draw
      const rows: StandingRowForTiebreak[] = [
        { playerId: 'p1', displayName: 'Barzola, Marco', pts: 5, dg: 0, pg: 1 }, // 1 W, 2 D, 1 L = 5 pts
        { playerId: 'p2', displayName: 'Fernández, Lucas', pts: 5, dg: 0, pg: 2 }, // 2 W, 0 D, 2 L -> wait: 2*3 = 6 pts; let's say pg 1 vs pg 0 (0 W, 5 D = 5 pts)
      ];

      const matches: LeagueMatch[] = [
        {
          id: 'R1_M1',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 1,
          scoreB: 1,
          confirmed: true,
        },
      ];

      const sorted = sortStandingsWithFairPlay(rows, matches);
      expect(sorted[0]!.playerId).toBe('p2'); // p2 has pg: 2 > pg: 1
      expect(sorted[0]!.rank).toBe(1);
      expect(sorted[1]!.playerId).toBe('p1');
      expect(sorted[1]!.rank).toBe(2);
    });

    it('falls through to 5) Menos Tarjetas Rojas (TR asc) when PG are tied', () => {
      // p1 and p2 tied on PTS, DG, H2H, and PG
      const rows: StandingRowForTiebreak[] = [
        {
          playerId: 'p1',
          displayName: 'Barzola, Marco',
          pts: 4,
          dg: 0,
          pg: 1,
          redCards: 1,
          yellowCards: 0,
        },
        {
          playerId: 'p2',
          displayName: 'Fernández, Lucas',
          pts: 4,
          dg: 0,
          pg: 1,
          redCards: 0,
          yellowCards: 2,
        },
      ];

      const matches: LeagueMatch[] = [
        {
          id: 'R1_M1',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 0,
          scoreB: 0,
          confirmed: true,
        },
      ];

      const sorted = sortStandingsWithFairPlay(rows, matches);
      // p2 has 0 red cards vs p1 with 1 red card -> p2 wins tiebreaker
      expect(sorted[0]!.playerId).toBe('p2');
      expect(sorted[0]!.rank).toBe(1);
      expect(sorted[1]!.playerId).toBe('p1');
      expect(sorted[1]!.rank).toBe(2);
    });

    it('falls through to 6) Menos Tarjetas Amarillas (TA asc) when TR are tied', () => {
      // p1 and p2 tied on PTS, DG, H2H, PG, and TR (both 0 red cards)
      const rows: StandingRowForTiebreak[] = [
        {
          playerId: 'p1',
          displayName: 'Barzola, Marco',
          pts: 4,
          dg: 0,
          pg: 1,
          redCards: 0,
          yellowCards: 3,
        },
        {
          playerId: 'p2',
          displayName: 'Fernández, Lucas',
          pts: 4,
          dg: 0,
          pg: 1,
          redCards: 0,
          yellowCards: 1,
        },
      ];

      const matches: LeagueMatch[] = [
        {
          id: 'R1_M1',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 1,
          scoreB: 1,
          confirmed: true,
        },
      ];

      const sorted = sortStandingsWithFairPlay(rows, matches);
      // p2 has 1 yellow card vs p1 with 3 yellow cards -> p2 wins tiebreaker
      expect(sorted[0]!.playerId).toBe('p2');
      expect(sorted[0]!.rank).toBe(1);
      expect(sorted[1]!.playerId).toBe('p1');
      expect(sorted[1]!.rank).toBe(2);
    });

    it('falls through to 7) Desempate alfabético por Apellido/Nombre as final deterministic tiebreaker', () => {
      // Completely identical on all stats and cards
      const rows: StandingRowForTiebreak[] = [
        {
          playerId: 'p1',
          displayName: 'Gómez, Nico',
          pts: 4,
          dg: 0,
          pg: 1,
          redCards: 0,
          yellowCards: 1,
        },
        {
          playerId: 'p2',
          displayName: 'Álvarez, Fede',
          pts: 4,
          dg: 0,
          pg: 1,
          redCards: 0,
          yellowCards: 1,
        },
        {
          playerId: 'p3',
          displayName: 'Barzola, Marco',
          pts: 4,
          dg: 0,
          pg: 1,
          redCards: 0,
          yellowCards: 1,
        },
      ];

      // Draw between p1, p2, p3 in cyclic fashion with 0-0
      const matches: LeagueMatch[] = [
        {
          id: 'R1_M1',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 0,
          scoreB: 0,
          confirmed: true,
        },
        {
          id: 'R2_M1',
          round: 2,
          playerA: 'p2',
          playerB: 'p3',
          scoreA: 0,
          scoreB: 0,
          confirmed: true,
        },
        {
          id: 'R3_M1',
          round: 3,
          playerA: 'p3',
          playerB: 'p1',
          scoreA: 0,
          scoreB: 0,
          confirmed: true,
        },
      ];

      const sorted = sortStandingsWithFairPlay(rows, matches);
      // Alphabetical in Spanish: Álvarez, Fede (p2) -> Barzola, Marco (p3) -> Gómez, Nico (p1)
      expect(sorted[0]!.playerId).toBe('p2');
      expect(sorted[0]!.rank).toBe(1);
      expect(sorted[1]!.playerId).toBe('p3');
      expect(sorted[1]!.rank).toBe(2);
      expect(sorted[2]!.playerId).toBe('p1');
      expect(sorted[2]!.rank).toBe(3);
    });

    it('is immutable and does not mutate the input array', () => {
      const rows: StandingRowForTiebreak[] = [
        { playerId: 'p1', displayName: 'B, B', pts: 3, dg: 0, pg: 1 },
        { playerId: 'p2', displayName: 'A, A', pts: 6, dg: 2, pg: 2 },
      ];
      const rowsCopy = [...rows];

      const sorted = sortStandingsWithFairPlay(rows, []);
      expect(rows).toEqual(rowsCopy);
      expect(sorted[0]!.playerId).toBe('p2');
      expect(sorted[1]!.playerId).toBe('p1');
    });

    it('handles empty or single row arrays safely', () => {
      expect(sortStandingsWithFairPlay([], [])).toEqual([]);

      const single: StandingRowForTiebreak[] = [
        { playerId: 'p1', displayName: 'Solo, Uno', pts: 0, dg: 0, pg: 0 },
      ];
      const result = sortStandingsWithFairPlay(single, []);
      expect(result).toEqual([
        { playerId: 'p1', displayName: 'Solo, Uno', pts: 0, dg: 0, pg: 0, rank: 1 },
      ]);
    });
  });

  describe('calculateSuspensionInfo (T46 · RF-Sanciones)', () => {
    it('returns 0 suspended players when player has no cards or less than 4 yellows', () => {
      const clean = calculateSuspensionInfo(0, 0);
      expect(clean.suspendedCount).toBe(0);
      expect(clean.isSuspended).toBe(false);
      expect(clean.yellowCycle).toBe(0);
      expect(clean.motivo).toBe('');

      const oneYellow = calculateSuspensionInfo(1, 0);
      expect(oneYellow.suspendedCount).toBe(0);
      expect(oneYellow.isSuspended).toBe(false);
      expect(oneYellow.yellowCycle).toBe(1);

      const threeYellows = calculateSuspensionInfo(3, 0);
      expect(threeYellows.suspendedCount).toBe(0);
      expect(threeYellows.isSuspended).toBe(false);
      expect(threeYellows.yellowCycle).toBe(3);
    });

    it('suspends 1 best player when player reaches 4 yellow cards', () => {
      const fourYellows = calculateSuspensionInfo(4, 0);
      expect(fourYellows.suspendedCount).toBe(1);
      expect(fourYellows.isSuspended).toBe(true);
      expect(fourYellows.yellowCycle).toBe(0);
      expect(fourYellows.motivo).toBe('4 Amarillas acumuladas');
    });

    it('suspends 2 best players when player accumulates 8 yellow cards', () => {
      const eightYellows = calculateSuspensionInfo(8, 0);
      expect(eightYellows.suspendedCount).toBe(2);
      expect(eightYellows.isSuspended).toBe(true);
      expect(eightYellows.yellowCycle).toBe(0);
      expect(eightYellows.motivo).toBe('8 Amarillas acumuladas');
    });

    it('suspends 1 best player for each red card', () => {
      const oneRed = calculateSuspensionInfo(0, 1);
      expect(oneRed.suspendedCount).toBe(1);
      expect(oneRed.isSuspended).toBe(true);
      expect(oneRed.motivo).toBe('1 Tarjeta Roja');

      const twoReds = calculateSuspensionInfo(0, 2);
      expect(twoReds.suspendedCount).toBe(2);
      expect(twoReds.isSuspended).toBe(true);
      expect(twoReds.motivo).toBe('2 Tarjetas Rojas');
    });

    it('sums sanctions when player has both 4 yellows and red cards', () => {
      const combined = calculateSuspensionInfo(4, 1);
      expect(combined.suspendedCount).toBe(2);
      expect(combined.isSuspended).toBe(true);
      expect(combined.motivo).toBe('4 Amarillas y 1 Roja');

      const combinedMultiple = calculateSuspensionInfo(8, 2);
      expect(combinedMultiple.suspendedCount).toBe(4);
      expect(combinedMultiple.isSuspended).toBe(true);
      expect(combinedMultiple.motivo).toBe('8 Amarillas y 2 Rojas');
    });

    it('handles carry-over yellows above multiples of 4 (e.g. 5 yellows = 1 suspended + 1 towards next)', () => {
      const fiveYellows = calculateSuspensionInfo(5, 0);
      expect(fiveYellows.suspendedCount).toBe(1);
      expect(fiveYellows.isSuspended).toBe(true);
      expect(fiveYellows.yellowCycle).toBe(1);
      expect(fiveYellows.motivo).toBe('4 Amarillas acumuladas');
    });
  });
});

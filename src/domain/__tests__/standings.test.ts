import { describe, expect, it } from 'vitest';
import { generateBracket } from '../bracket';
import {
  confirmSeries,
  setLegScore,
  setPenaltyWinner,
} from '../series';
import {
  applyStats,
  buildStandings,
  computeTournamentStats,
  getPodium,
  removePlayerStats,
  resetStandings,
} from '../standings';
import type { Player, Series } from '../types';

describe('standings - domain logic (RF-30 to RF-37, RF-46, RF-47)', () => {
  const players: Player[] = [
    { id: 'p1', firstName: 'Marco', lastName: 'Barzola', createdAt: '2026-10-09' },
    { id: 'p2', firstName: 'Lucho', lastName: 'Fernández', createdAt: '2026-10-09' },
    { id: 'p3', firstName: 'Fede', lastName: 'Álvarez', createdAt: '2026-10-09' },
    { id: 'p4', firstName: 'Nico', lastName: 'Gómez', createdAt: '2026-10-09' },
    { id: 'p5', firstName: 'Tomi', lastName: 'Silva', createdAt: '2026-10-09' },
  ];

  it('calculates full 5-player tournament by hand with exact precision (RF-30, RF-31, RF-32)', () => {
    // Generate bracket with deterministic RNG that preserves order [p1, p2, p3, p4, p5]
    // In shuffle, if rng returns i/(i+1) for each step, j = i (no swaps, identical order)
    const preserveOrderRng = () => 0.999;
    const { series } = generateBracket(
      players.map((p) => p.id),
      preserveOrderRng
    );

    let current: Series[] = series;

    // 1. QF1: p1 vs p2
    // Ida: p1 (local) 2 - 1 p2 (visitante)
    current = setLegScore(current, 'QF1', 'leg1', 'a', 2);
    current = setLegScore(current, 'QF1', 'leg1', 'b', 1);
    // Vuelta: p2 (local) 0 - 1 p1 (visitante) -> Leg2: 'a' is p1 (visitante), 'b' is p2 (local)
    current = setLegScore(current, 'QF1', 'leg2', 'a', 1);
    current = setLegScore(current, 'QF1', 'leg2', 'b', 0);
    current = confirmSeries(current, 'QF1'); // p1 wins (3-1), p2 eliminated in QF

    // 2. SF1: Winner QF1 (p1) vs p3 (bye)
    // Ida: p1 (local) 1 - 0 p3 (visitante)
    current = setLegScore(current, 'SF1', 'leg1', 'a', 1);
    current = setLegScore(current, 'SF1', 'leg1', 'b', 0);
    // Vuelta: p3 (local) 2 - 0 p1 (visitante) -> Leg2: 'a' is p1 (visitante), 'b' is p3 (local)
    current = setLegScore(current, 'SF1', 'leg2', 'a', 0);
    current = setLegScore(current, 'SF1', 'leg2', 'b', 2);
    current = confirmSeries(current, 'SF1'); // p3 wins (2-1) -> F. p1 -> TP.

    // 3. SF2: p4 (bye) vs p5 (bye)
    // Ida: p4 (local) 1 - 1 p5 (visitante)
    current = setLegScore(current, 'SF2', 'leg1', 'a', 1);
    current = setLegScore(current, 'SF2', 'leg1', 'b', 1);
    // Vuelta: p5 (local) 1 - 1 p4 (visitante) -> Leg2: 'a' is p4 (visitante), 'b' is p5 (local)
    current = setLegScore(current, 'SF2', 'leg2', 'a', 1);
    current = setLegScore(current, 'SF2', 'leg2', 'b', 1);
    // Tied 2-2 aggregate -> penalties won by p5
    current = setPenaltyWinner(current, 'SF2', 'p5');
    current = confirmSeries(current, 'SF2'); // p5 wins -> F. p4 -> TP.

    // 4. TP (Third place): p1 vs p4
    // Ida: p1 3 - 1 p4
    current = setLegScore(current, 'TP', 'leg1', 'a', 3);
    current = setLegScore(current, 'TP', 'leg1', 'b', 1);
    // Vuelta: p4 1 - 1 p1 -> a (p1) 1, b (p4) 1
    current = setLegScore(current, 'TP', 'leg2', 'a', 1);
    current = setLegScore(current, 'TP', 'leg2', 'b', 1);
    current = confirmSeries(current, 'TP'); // p1 wins (4-2, 3rd place), p4 4th place.

    // 5. F (Final): p3 vs p5
    // Ida: p3 2 - 0 p5
    current = setLegScore(current, 'F', 'leg1', 'a', 2);
    current = setLegScore(current, 'F', 'leg1', 'b', 0);
    // Vuelta: p5 1 - 1 p3 -> a (p3) 1, b (p5) 1
    current = setLegScore(current, 'F', 'leg2', 'a', 1);
    current = setLegScore(current, 'F', 'leg2', 'b', 1);
    current = confirmSeries(current, 'F'); // p3 wins (3-1, Champion!), p5 Runner-up.

    // Verify Podium (RF-30)
    const podium = getPodium(current);
    expect(podium).toEqual({
      champion: 'p3',
      runnerUp: 'p5',
      third: 'p1',
      fourth: 'p4',
    });

    // Compute stats deltas (RF-31, RF-32)
    const { stats } = computeTournamentStats({
      participantIds: players.map((p) => p.id),
      series: current,
    });

    // Hand-calculated assertions:
    // P3 (Champion): 10 PTS, 2 PJ, 2 PG, 0 PP, 5 GF, 2 GC, TJ = 1
    expect(stats['p3']).toEqual({
      playerId: 'p3',
      pts: 10,
      pj: 2,
      pg: 2,
      pp: 0,
      gf: 5,
      gc: 2,
      tj: 1,
    });

    // P5 (RunnerUp): 7 PTS, 2 PJ, 1 PG, 1 PP, 3 GF, 5 GC, TJ = 1
    expect(stats['p5']).toEqual({
      playerId: 'p5',
      pts: 7,
      pj: 2,
      pg: 1,
      pp: 1,
      gf: 3,
      gc: 5,
      tj: 1,
    });

    // P1 (3rd place): 5 PTS, 3 PJ, 2 PG, 1 PP, 8 GF, 5 GC, TJ = 1
    expect(stats['p1']).toEqual({
      playerId: 'p1',
      pts: 5,
      pj: 3,
      pg: 2,
      pp: 1,
      gf: 8,
      gc: 5,
      tj: 1,
    });

    // P4 (4th place): 3 PTS, 2 PJ, 0 PG, 2 PP, 4 GF, 6 GC, TJ = 1
    expect(stats['p4']).toEqual({
      playerId: 'p4',
      pts: 3,
      pj: 2,
      pg: 0,
      pp: 2,
      gf: 4,
      gc: 6,
      tj: 1,
    });

    // P2 (Eliminated in QF): 1 PTS, 1 PJ, 0 PG, 1 PP, 1 GF, 3 GC, TJ = 1
    expect(stats['p2']).toEqual({
      playerId: 'p2',
      pts: 1,
      pj: 1,
      pg: 0,
      pp: 1,
      gf: 1,
      gc: 3,
      tj: 1,
    });

    // Standings table generation (RF-34 to RF-37)
    const standings = buildStandings(players, stats);
    expect(standings).toHaveLength(5);
    expect(standings.map((s) => s.playerId)).toEqual([
      'p3',
      'p5',
      'p1',
      'p4',
      'p2',
    ]);
    expect(standings[0]!.displayName).toBe('Álvarez, Fede');
    expect(standings[0]!.rank).toBe(1);
    expect(standings[0]!.dg).toBe(3);
  });

  it('accumulates statistics across two successive tournaments (applyStats)', () => {
    const t1Stats = {
      p1: { playerId: 'p1', pts: 10, pj: 3, pg: 3, pp: 0, gf: 9, gc: 2, tj: 1 },
      p2: { playerId: 'p2', pts: 7, pj: 3, pg: 2, pp: 1, gf: 5, gc: 4, tj: 1 },
    };

    const t2Deltas = {
      p1: { playerId: 'p1', pts: 5, pj: 2, pg: 1, pp: 1, gf: 4, gc: 3, tj: 1 },
      p2: { playerId: 'p2', pts: 10, pj: 2, pg: 2, pp: 0, gf: 6, gc: 1, tj: 1 },
    };

    const combined = applyStats(t1Stats, t2Deltas);

    expect(combined['p1']).toEqual({
      playerId: 'p1',
      pts: 15,
      pj: 5,
      pg: 4,
      pp: 1,
      gf: 13,
      gc: 5,
      tj: 2,
    });

    expect(combined['p2']).toEqual({
      playerId: 'p2',
      pts: 17,
      pj: 5,
      pg: 4,
      pp: 1,
      gf: 11,
      gc: 5,
      tj: 2,
    });
  });

  it('resolves tie-breaking in standings: PTS -> DG -> GF -> LastName (RF-36)', () => {
    const tiedPlayers: Player[] = [
      { id: 'u1', firstName: 'A', lastName: 'Zapata', createdAt: '2026-10-09' },
      { id: 'u2', firstName: 'B', lastName: 'Alonso', createdAt: '2026-10-09' },
      { id: 'u3', firstName: 'C', lastName: 'Benitez', createdAt: '2026-10-09' },
    ];

    // All have 10 PTS and +3 DG.
    // u1 has GF = 7 (GC = 4).
    // u2 and u3 have GF = 5 (GC = 2).
    // u2 (Alonso) comes before u3 (Benitez) by last name.
    const statsMap = {
      u1: { playerId: 'u1', pts: 10, pj: 2, pg: 2, pp: 0, gf: 7, gc: 4, tj: 1 },
      u2: { playerId: 'u2', pts: 10, pj: 2, pg: 2, pp: 0, gf: 5, gc: 2, tj: 1 },
      u3: { playerId: 'u3', pts: 10, pj: 2, pg: 2, pp: 0, gf: 5, gc: 2, tj: 1 },
    };

    const standings = buildStandings(tiedPlayers, statsMap);

    expect(standings.map((s) => s.playerId)).toEqual(['u1', 'u2', 'u3']);
    expect(standings[0]!.rank).toBe(1);
    expect(standings[1]!.rank).toBe(2);
    expect(standings[2]!.rank).toBe(3);
  });

  it('excludes players with TJ = 0 from standings (RF-37)', () => {
    const list: Player[] = [
      { id: 'p1', firstName: 'Active', lastName: 'User', createdAt: '2026-10-09' },
      { id: 'p2', firstName: 'Inactive', lastName: 'User', createdAt: '2026-10-09' },
    ];

    const statsMap = {
      p1: { playerId: 'p1', pts: 5, pj: 2, pg: 1, pp: 1, gf: 3, gc: 3, tj: 1 },
      p2: { playerId: 'p2', pts: 0, pj: 0, pg: 0, pp: 0, gf: 0, gc: 0, tj: 0 },
    };

    const standings = buildStandings(list, statsMap);
    expect(standings).toHaveLength(1);
    expect(standings[0]!.playerId).toBe('p1');
  });

  describe('removePlayerStats (RF-46)', () => {
    it('removes statistics for the target player and returns a fresh object', () => {
      const statsMap = {
        p1: { playerId: 'p1', pts: 10, pj: 3, pg: 3, pp: 0, gf: 8, gc: 2, tj: 1 },
        p2: { playerId: 'p2', pts: 7, pj: 3, pg: 2, pp: 1, gf: 5, gc: 4, tj: 1 },
      };

      const result = removePlayerStats(statsMap, 'p1');
      expect(result).not.toHaveProperty('p1');
      expect(result).toHaveProperty('p2');
      expect(statsMap).toHaveProperty('p1'); // original remains untouched
    });

    it('returns an identical shallow clone if player does not exist in stats', () => {
      const statsMap = {
        p1: { playerId: 'p1', pts: 10, pj: 3, pg: 3, pp: 0, gf: 8, gc: 2, tj: 1 },
      };
      const result = removePlayerStats(statsMap, 'non-existent');
      expect(result).toEqual(statsMap);
    });
  });

  describe('resetStandings (RF-47)', () => {
    it('returns an empty object to clear all accumulated statistics', () => {
      const result = resetStandings();
      expect(result).toEqual({});
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('computeTournamentStats with single_match format (RF-21, RF-49)', () => {
    it('tallies goals only from leg1 and computes correct podium and stats', () => {
      const seriesList: Series[] = [
        {
          id: 'SF1',
          round: 'semifinal',
          playerA: 'p1',
          playerB: 'p2',
          leg1: { a: 3, b: 1 },
          leg2: { a: null, b: null },
          penaltyWinner: null,
          confirmed: true,
          winnerTo: { seriesId: 'F', side: 'a' },
          loserTo: { seriesId: 'TP', side: 'a' },
        },
        {
          id: 'SF2',
          round: 'semifinal',
          playerA: 'p3',
          playerB: 'p4',
          leg1: { a: 0, b: 2 },
          leg2: { a: null, b: null },
          penaltyWinner: null,
          confirmed: true,
          winnerTo: { seriesId: 'F', side: 'b' },
          loserTo: { seriesId: 'TP', side: 'b' },
        },
        {
          id: 'TP',
          round: 'third_place',
          playerA: 'p2',
          playerB: 'p3',
          leg1: { a: 2, b: 1 },
          leg2: { a: null, b: null },
          penaltyWinner: null,
          confirmed: true,
          winnerTo: null,
          loserTo: null,
        },
        {
          id: 'F',
          round: 'final',
          playerA: 'p1',
          playerB: 'p4',
          leg1: { a: 1, b: 2 },
          leg2: { a: null, b: null },
          penaltyWinner: null,
          confirmed: true,
          winnerTo: null,
          loserTo: null,
        },
      ];

      const { stats, podium } = computeTournamentStats({
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        series: seriesList,
        matchFormat: 'single_match',
      });

      // Champion: p4, RunnerUp: p1, Third: p2, Fourth: p3
      expect(podium).toEqual({
        champion: 'p4',
        runnerUp: 'p1',
        third: 'p2',
        fourth: 'p3',
      });

      // P4 (Champion): 10 PTS, 2 PJ, 2 PG, 0 PP, GF = 2 + 2 = 4, GC = 0 + 1 = 1
      expect(stats['p4']).toEqual({
        playerId: 'p4',
        pts: 10,
        pj: 2,
        pg: 2,
        pp: 0,
        gf: 4,
        gc: 1,
        tj: 1,
      });

      // P1 (RunnerUp): 7 PTS, 2 PJ, 1 PG, 1 PP, GF = 3 + 1 = 4, GC = 1 + 2 = 3
      expect(stats['p1']).toEqual({
        playerId: 'p1',
        pts: 7,
        pj: 2,
        pg: 1,
        pp: 1,
        gf: 4,
        gc: 3,
        tj: 1,
      });
    });

    it('extracts podium in single_match format and falls back safely if matchFormat was omitted (RF-30)', () => {
      const singleMatchSeries: Series[] = [
        {
          id: 'F',
          round: 'final',
          playerA: 'p1',
          playerB: 'p2',
          leg1: { a: 3, b: 0 },
          leg2: { a: null, b: null },
          penaltyWinner: null,
          confirmed: true,
          winnerTo: null,
          loserTo: null,
          winner: 'p1',
          loser: 'p2',
        },
        {
          id: 'TP',
          round: 'third_place',
          playerA: 'p3',
          playerB: 'p4',
          leg1: { a: 1, b: 2 },
          leg2: { a: null, b: null },
          penaltyWinner: null,
          confirmed: true,
          winnerTo: null,
          loserTo: null,
          winner: 'p4',
          loser: 'p3',
        },
      ];

      // With explicit single_match
      const podiumExplicit = getPodium(singleMatchSeries, 'single_match');
      expect(podiumExplicit).toEqual({
        champion: 'p1',
        runnerUp: 'p2',
        third: 'p4',
        fourth: 'p3',
      });

      // Without passing matchFormat (defaults to two_legged) -> should fallback and not crash
      const podiumFallback = getPodium(singleMatchSeries);
      expect(podiumFallback).toEqual({
        champion: 'p1',
        runnerUp: 'p2',
        third: 'p4',
        fourth: 'p3',
      });
    });
  });
});



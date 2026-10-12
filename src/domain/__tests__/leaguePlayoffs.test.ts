import { describe, expect, it } from 'vitest';
import {
  generatePlayoffsBracketFromStandings,
  getPlayoffsCutoffCount,
  isLeaguePhaseComplete,
} from '../leaguePlayoffs';
import { confirmSeries, setLegScore } from '../series';
import type { LeagueMatch, LeagueStandingRow, PlayerId } from '../types';

describe('domain - leaguePlayoffs (RF-68)', () => {
  function makeRow(playerId: PlayerId, rank: number): LeagueStandingRow {
    return {
      playerId,
      displayName: `Jugador ${playerId}`,
      team: `Equipo ${playerId}`,
      pts: (11 - rank) * 3,
      pj: 5,
      pg: 11 - rank,
      pe: 0,
      pp: 0,
      gf: 10,
      gc: rank,
      dg: 10 - rank,
      rank,
    };
  }

  function makeStandings(count: number): LeagueStandingRow[] {
    return Array.from({ length: count }, (_, i) => makeRow(`p${i + 1}`, i + 1));
  }

  describe('getPlayoffsCutoffCount', () => {
    it('throws for invalid participant count (< 4 or > 10)', () => {
      expect(() => getPlayoffsCutoffCount(3)).toThrow(
        /Cantidad inválida de participantes para playoffs de liga: 3/
      );
      expect(() => getPlayoffsCutoffCount(11)).toThrow(
        /Cantidad inválida de participantes para playoffs de liga: 11/
      );
    });

    it('returns 2 for 4 and 5 participants (top 2 to Final)', () => {
      expect(getPlayoffsCutoffCount(4)).toBe(2);
      expect(getPlayoffsCutoffCount(5)).toBe(2);
    });

    it('returns 4 for 6, 7, 8 and 9 participants (top 4 to Semifinals)', () => {
      expect(getPlayoffsCutoffCount(6)).toBe(4);
      expect(getPlayoffsCutoffCount(7)).toBe(4);
      expect(getPlayoffsCutoffCount(8)).toBe(4);
      expect(getPlayoffsCutoffCount(9)).toBe(4);
    });

    it('returns 8 for 10 participants (top 8 to Quarterfinals)', () => {
      expect(getPlayoffsCutoffCount(10)).toBe(8);
    });
  });

  describe('isLeaguePhaseComplete', () => {
    it('returns false for empty matches or any unconfirmed match', () => {
      expect(isLeaguePhaseComplete([])).toBe(false);

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
          id: 'R1_M2',
          round: 1,
          playerA: 'p3',
          playerB: 'p4',
          scoreA: null,
          scoreB: null,
          confirmed: false,
        },
      ];

      expect(isLeaguePhaseComplete(matches)).toBe(false);
    });

    it('returns true when all league matches are confirmed', () => {
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
          id: 'R1_M2',
          round: 1,
          playerA: 'p3',
          playerB: 'p4',
          scoreA: 2,
          scoreB: 2,
          confirmed: true,
        },
      ];

      expect(isLeaguePhaseComplete(matches)).toBe(true);
    });
  });

  describe('generatePlayoffsBracketFromStandings', () => {
    it('throws error if standings has invalid player count or duplicates', () => {
      expect(() => generatePlayoffsBracketFromStandings(makeStandings(3))).toThrow(
        /Cantidad inválida de participantes en la tabla de posiciones: 3/
      );
      expect(() => generatePlayoffsBracketFromStandings(makeStandings(11))).toThrow(
        /Cantidad inválida de participantes en la tabla de posiciones: 11/
      );

      const dupStandings = [
        makeRow('p1', 1),
        makeRow('p2', 2),
        makeRow('p1', 3),
        makeRow('p4', 4),
      ];
      expect(() => generatePlayoffsBracketFromStandings(dupStandings)).toThrow(
        /La tabla de posiciones contiene participantes duplicados/
      );
    });

    it('generates direct Final and Third Place for 4 participants', () => {
      const standings = makeStandings(4);
      const playoffs = generatePlayoffsBracketFromStandings(standings);

      expect(playoffs.length).toBe(2);
      const [finalSeries, tpSeries] = playoffs;

      // Final: 1° ('p1') vs 2° ('p2')
      expect(finalSeries?.id).toBe('F');
      expect(finalSeries?.round).toBe('final');
      expect(finalSeries?.playerA).toBe('p1');
      expect(finalSeries?.playerB).toBe('p2');
      expect(finalSeries?.winnerTo).toBeNull();
      expect(finalSeries?.loserTo).toBeNull();

      // Third place: 3° ('p3') vs 4° ('p4')
      expect(tpSeries?.id).toBe('TP');
      expect(tpSeries?.round).toBe('third_place');
      expect(tpSeries?.playerA).toBe('p3');
      expect(tpSeries?.playerB).toBe('p4');
      expect(tpSeries?.winnerTo).toBeNull();
      expect(tpSeries?.loserTo).toBeNull();
    });

    it('generates direct Final and Third Place for 5 participants (5° eliminated)', () => {
      const standings = makeStandings(5);
      const playoffs = generatePlayoffsBracketFromStandings(standings);

      expect(playoffs.length).toBe(2);
      const [finalSeries, tpSeries] = playoffs;

      expect(finalSeries?.playerA).toBe('p1');
      expect(finalSeries?.playerB).toBe('p2');
      expect(tpSeries?.playerA).toBe('p3');
      expect(tpSeries?.playerB).toBe('p4');
    });

    it('generates Semifinals (1° vs 4°, 2° vs 3°) for 6 to 9 participants', () => {
      const standings6 = makeStandings(6);
      const playoffs6 = generatePlayoffsBracketFromStandings(standings6);

      expect(playoffs6.length).toBe(4);
      const [sf1, sf2, finalSeries, tpSeries] = playoffs6;

      // SF1: 1° ('p1') vs 4° ('p4')
      expect(sf1?.id).toBe('SF1');
      expect(sf1?.round).toBe('semifinal');
      expect(sf1?.playerA).toBe('p1');
      expect(sf1?.playerB).toBe('p4');
      expect(sf1?.winnerTo).toEqual({ seriesId: 'F', side: 'a' });
      expect(sf1?.loserTo).toEqual({ seriesId: 'TP', side: 'a' });

      // SF2: 2° ('p2') vs 3° ('p3')
      expect(sf2?.id).toBe('SF2');
      expect(sf2?.round).toBe('semifinal');
      expect(sf2?.playerA).toBe('p2');
      expect(sf2?.playerB).toBe('p3');
      expect(sf2?.winnerTo).toEqual({ seriesId: 'F', side: 'b' });
      expect(sf2?.loserTo).toEqual({ seriesId: 'TP', side: 'b' });

      // Final and TP start unpopulated
      expect(finalSeries?.playerA).toBeNull();
      expect(finalSeries?.playerB).toBeNull();
      expect(tpSeries?.playerA).toBeNull();
      expect(tpSeries?.playerB).toBeNull();

      // Check 8 participants as well
      const standings8 = makeStandings(8);
      const playoffs8 = generatePlayoffsBracketFromStandings(standings8);
      expect(playoffs8.length).toBe(4);
      expect(playoffs8[0]?.playerA).toBe('p1');
      expect(playoffs8[0]?.playerB).toBe('p4');
      expect(playoffs8[1]?.playerA).toBe('p2');
      expect(playoffs8[1]?.playerB).toBe('p3');
    });

    it('generates Quarterfinals for 10 participants (top 8 to QF)', () => {
      const standings10 = makeStandings(10);
      const playoffs = generatePlayoffsBracketFromStandings(standings10);

      expect(playoffs.length).toBe(8);
      const [qf1, qf2, qf3, qf4, sf1, sf2, finalSeries, tpSeries] = playoffs;

      // QF1: 1° ('p1') vs 8° ('p8') -> SF1.a
      expect(qf1?.id).toBe('QF1');
      expect(qf1?.playerA).toBe('p1');
      expect(qf1?.playerB).toBe('p8');
      expect(qf1?.winnerTo).toEqual({ seriesId: 'SF1', side: 'a' });

      // QF2: 4° ('p4') vs 5° ('p5') -> SF1.b
      expect(qf2?.id).toBe('QF2');
      expect(qf2?.playerA).toBe('p4');
      expect(qf2?.playerB).toBe('p5');
      expect(qf2?.winnerTo).toEqual({ seriesId: 'SF1', side: 'b' });

      // QF3: 2° ('p2') vs 7° ('p7') -> SF2.a
      expect(qf3?.id).toBe('QF3');
      expect(qf3?.playerA).toBe('p2');
      expect(qf3?.playerB).toBe('p7');
      expect(qf3?.winnerTo).toEqual({ seriesId: 'SF2', side: 'a' });

      // QF4: 3° ('p3') vs 6° ('p6') -> SF2.b
      expect(qf4?.id).toBe('QF4');
      expect(qf4?.playerA).toBe('p3');
      expect(qf4?.playerB).toBe('p6');
      expect(qf4?.winnerTo).toEqual({ seriesId: 'SF2', side: 'b' });

      // SF1 & SF2
      expect(sf1?.playerA).toBeNull();
      expect(sf1?.playerB).toBeNull();
      expect(sf1?.winnerTo).toEqual({ seriesId: 'F', side: 'a' });
      expect(sf1?.loserTo).toEqual({ seriesId: 'TP', side: 'a' });

      expect(sf2?.playerA).toBeNull();
      expect(sf2?.playerB).toBeNull();
      expect(sf2?.winnerTo).toEqual({ seriesId: 'F', side: 'b' });
      expect(sf2?.loserTo).toEqual({ seriesId: 'TP', side: 'b' });

      // Final & TP
      expect(finalSeries?.playerA).toBeNull();
      expect(tpSeries?.playerA).toBeNull();
    });

    it('integrates seamlessly with confirmSeries for playoff progression', () => {
      const standings = makeStandings(6);
      let playoffs = generatePlayoffsBracketFromStandings(standings);

      // Play SF1: p1 vs p4 -> p1 wins 2-0
      playoffs = setLegScore(playoffs, 'SF1', 'leg1', 'a', 2, 'single_match');
      playoffs = setLegScore(playoffs, 'SF1', 'leg1', 'b', 0, 'single_match');
      playoffs = confirmSeries(playoffs, 'SF1', 'single_match');

      const finalSeries = playoffs.find((s) => s.id === 'F');
      const tpSeries = playoffs.find((s) => s.id === 'TP');

      // Winner p1 advanced to Final side a, Loser p4 advanced to TP side a
      expect(finalSeries?.playerA).toBe('p1');
      expect(tpSeries?.playerA).toBe('p4');
    });

    it('generates asymmetric bracket when customQualifyingSpots is 5 in a 6-player league (RF-86, T66)', () => {
      const standings = makeStandings(6); // p1..p6
      // Top 5 qualify: p1, p2, p3, p4, p5 (p6 eliminated)
      const playoffs = generatePlayoffsBracketFromStandings(standings, 5);

      // Should have QF1 (4° vs 5°), SF1 (QF1.win vs 1°), SF2 (2° vs 3°), F, TP
      expect(playoffs.length).toBe(5);

      const qf1 = playoffs.find((s) => s.id === 'QF1')!;
      expect(qf1).toBeDefined();
      expect(qf1.playerA).toBe('p4');
      expect(qf1.playerB).toBe('p5');

      const sf1 = playoffs.find((s) => s.id === 'SF1')!;
      expect(sf1).toBeDefined();
      expect(sf1.playerA).toBeNull(); // waits for QF1 winner
      expect(sf1.playerB).toBe('p1'); // 1° gets direct Bye to SF1!

      const sf2 = playoffs.find((s) => s.id === 'SF2')!;
      expect(sf2).toBeDefined();
      expect(sf2.playerA).toBe('p2');
      expect(sf2.playerB).toBe('p3');
    });

    it('generates asymmetric bracket when customQualifyingSpots is 6 in a 6-player league (all qualify, top 2 Byes)', () => {
      const standings = makeStandings(6);
      const playoffs = generatePlayoffsBracketFromStandings(standings, 6);

      // Should have QF1 (4° vs 5°), QF2 (3° vs 6°), SF1 (QF1.win vs 1°), SF2 (QF2.win vs 2°), F, TP
      expect(playoffs.length).toBe(6);

      const qf1 = playoffs.find((s) => s.id === 'QF1')!;
      expect(qf1.playerA).toBe('p4');
      expect(qf1.playerB).toBe('p5');

      const qf2 = playoffs.find((s) => s.id === 'QF2')!;
      expect(qf2.playerA).toBe('p3');
      expect(qf2.playerB).toBe('p6');

      const sf1 = playoffs.find((s) => s.id === 'SF1')!;
      expect(sf1.playerB).toBe('p1'); // 1° gets Bye to Semis

      const sf2 = playoffs.find((s) => s.id === 'SF2')!;
      expect(sf2.playerB).toBe('p2'); // 2° gets Bye to Semis
    });

    it('generates direct Final when customQualifyingSpots is 2 in a 6-player league', () => {
      const standings = makeStandings(6);
      const playoffs = generatePlayoffsBracketFromStandings(standings, 2);

      expect(playoffs.length).toBe(2);
      const finalSeries = playoffs.find((s) => s.id === 'F')!;
      expect(finalSeries.playerA).toBe('p1');
      expect(finalSeries.playerB).toBe('p2');
    });

    it('generates 3-player playoff with direct bye to final for 1° when customQualifyingSpots is 3', () => {
      const standings = makeStandings(6);
      const playoffs = generatePlayoffsBracketFromStandings(standings, 3);

      expect(playoffs.length).toBe(3);
      const sf1 = playoffs.find((s) => s.id === 'SF1')!;
      expect(sf1.playerA).toBe('p2');
      expect(sf1.playerB).toBe('p3');

      const finalSeries = playoffs.find((s) => s.id === 'F')!;
      expect(finalSeries.playerA).toBe('p1');
      expect(finalSeries.playerB).toBeNull();
    });
  });
});

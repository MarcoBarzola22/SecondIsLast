import { describe, expect, it } from 'vitest';
import {
  computeAllGroupStandings,
  computeGroupStandings,
  generateGroupPlayoffs,
  generateGroupsFixture,
  getBestRunnerUp,
  isGroupStageComplete,
  sortCrossGroupStandings,
} from '../groupStage';
import type {
  GroupId,
  GroupMatch,
  LeagueStandingRow,
  Player,
  PlayerId,
} from '../types';

describe('domain - groupStage (RF-67)', () => {
  const p6: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const p9: PlayerId[] = [
    'p1',
    'p2',
    'p3',
    'p4',
    'p5',
    'p6',
    'p7',
    'p8',
    'p9',
  ];

  describe('generateGroupsFixture', () => {
    it('throws error on invalid participant count (e.g. 4, 5, 7, 8, 10)', () => {
      expect(() => generateGroupsFixture(['p1', 'p2', 'p3', 'p4'])).toThrow(
        /Cantidad inválida de participantes para fase de grupos: 4/
      );
      expect(() =>
        generateGroupsFixture(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'])
      ).toThrow(/Cantidad inválida de participantes para fase de grupos: 7/);
      expect(() =>
        generateGroupsFixture([
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
        ])
      ).toThrow(/Cantidad inválida de participantes para fase de grupos: 10/);
    });

    it('throws error if duplicate participants are passed', () => {
      expect(() =>
        generateGroupsFixture(['p1', 'p2', 'p3', 'p4', 'p5', 'p1'])
      ).toThrow(/No se pueden generar grupos con participantes duplicados/);
    });

    it('generates 2 groups of 3 for 6 participants (single match)', () => {
      // Identity RNG to preserve order
      const fixture = generateGroupsFixture(p6, 'single_match', () => 0.999);

      expect(Object.keys(fixture.groups)).toEqual(['A', 'B']);
      expect(fixture.groups.A!.length).toBe(3);
      expect(fixture.groups.B!.length).toBe(3);

      // Single match: 3 matches per group = 6 total
      expect(fixture.matches.length).toBe(6);

      const matchesA = fixture.matches.filter((m) => m.groupId === 'A');
      const matchesB = fixture.matches.filter((m) => m.groupId === 'B');
      expect(matchesA.length).toBe(3);
      expect(matchesB.length).toBe(3);

      // Check rounds: 3 rounds, each with 1 match from A and 1 from B
      expect(fixture.matches.map((m) => m.round)).toEqual([1, 1, 2, 2, 3, 3]);

      // Each player in group A plays 2 matches (1 home, 1 away)
      const groupAPlayers = fixture.groups.A!;
      for (const p of groupAPlayers) {
        const homeCount = matchesA.filter((m) => m.playerA === p).length;
        const awayCount = matchesA.filter((m) => m.playerB === p).length;
        expect(homeCount).toBe(1);
        expect(awayCount).toBe(1);
      }
    });

    it('generates 2 groups of 3 for 6 participants (two-legged)', () => {
      const fixture = generateGroupsFixture(p6, 'two_legged', () => 0.999);

      // Two-legged: 6 matches per group = 12 total matches across 6 rounds
      expect(fixture.matches.length).toBe(12);

      const matchesA = fixture.matches.filter((m) => m.groupId === 'A');
      expect(matchesA.length).toBe(6);

      const groupAPlayers = fixture.groups.A!;
      for (const p of groupAPlayers) {
        const homeCount = matchesA.filter((m) => m.playerA === p).length;
        const awayCount = matchesA.filter((m) => m.playerB === p).length;
        expect(homeCount).toBe(2);
        expect(awayCount).toBe(2);
      }
    });

    it('generates 3 groups of 3 for 9 participants (single match)', () => {
      const fixture = generateGroupsFixture(p9, 'single_match', () => 0.999);

      expect(Object.keys(fixture.groups)).toEqual(['A', 'B', 'C']);
      expect(fixture.groups.A!.length).toBe(3);
      expect(fixture.groups.B!.length).toBe(3);
      expect(fixture.groups.C!.length).toBe(3);

      // Single match: 3 matches per group = 9 total
      expect(fixture.matches.length).toBe(9);
      expect(fixture.matches.map((m) => m.round)).toEqual([
        1, 1, 1, 2, 2, 2, 3, 3, 3,
      ]);
    });

    it('generates 3 groups of 3 for 9 participants (two-legged)', () => {
      const fixture = generateGroupsFixture(p9, 'two_legged', () => 0.999);

      // Two-legged: 6 matches per group = 18 total across 6 rounds
      expect(fixture.matches.length).toBe(18);
    });
  });

  describe('computeGroupStandings & computeAllGroupStandings', () => {
    it('computes standings accurately with points, goal difference and Fair Play', () => {
      const players: Player[] = [
        { id: 'p1', firstName: 'Juan', lastName: 'Perez', createdAt: '' },
        { id: 'p2', firstName: 'Carlos', lastName: 'Gomez', createdAt: '' },
        { id: 'p3', firstName: 'Martin', lastName: 'Diaz', createdAt: '' },
      ];
      const groupParticipants = ['p1', 'p2', 'p3'];

      const matches: GroupMatch[] = [
        {
          id: 'GA_R1_M1',
          groupId: 'A',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 2,
          scoreB: 1,
          cardsA: { yellow: 1, red: 0 },
          cardsB: { yellow: 0, red: 0 },
          confirmed: true,
        },
        {
          id: 'GA_R2_M1',
          groupId: 'A',
          round: 2,
          playerA: 'p3',
          playerB: 'p1',
          scoreA: 0,
          scoreB: 2,
          cardsA: { yellow: 0, red: 0 },
          cardsB: { yellow: 0, red: 0 },
          confirmed: true,
        },
        {
          id: 'GA_R3_M1',
          groupId: 'A',
          round: 3,
          playerA: 'p2',
          playerB: 'p3',
          scoreA: 3,
          scoreB: 0,
          cardsA: { yellow: 0, red: 0 },
          cardsB: { yellow: 0, red: 1 },
          confirmed: true,
        },
      ];

      const standings = computeGroupStandings(
        matches,
        groupParticipants,
        { p1: 'Boca', p2: 'River', p3: 'Racing' },
        players
      );

      expect(standings.length).toBe(3);
      // p1 won 2 matches -> 6 pts
      expect(standings[0]?.playerId).toBe('p1');
      expect(standings[0]?.pts).toBe(6);
      expect(standings[0]?.rank).toBe(1);

      // p2 won 1, lost 1 -> 3 pts
      expect(standings[1]?.playerId).toBe('p2');
      expect(standings[1]?.pts).toBe(3);
      expect(standings[1]?.rank).toBe(2);

      // p3 lost 2 -> 0 pts
      expect(standings[2]?.playerId).toBe('p3');
      expect(standings[2]?.pts).toBe(0);
      expect(standings[2]?.rank).toBe(3);
    });

    it('computes standings for all groups simultaneously with computeAllGroupStandings', () => {
      const groups = {
        A: ['p1', 'p2', 'p3'],
        B: ['p4', 'p5', 'p6'],
      };

      const matches: GroupMatch[] = [
        {
          id: 'GA_R1_M1',
          groupId: 'A',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 1,
          scoreB: 0,
          confirmed: true,
        },
        {
          id: 'GB_R1_M1',
          groupId: 'B',
          round: 1,
          playerA: 'p4',
          playerB: 'p5',
          scoreA: 2,
          scoreB: 0,
          confirmed: true,
        },
      ];

      const allStandings = computeAllGroupStandings(matches, groups);
      expect(allStandings.A.length).toBe(3);
      expect(allStandings.B.length).toBe(3);
      expect(allStandings.A[0]?.playerId).toBe('p1');
      expect(allStandings.B[0]?.playerId).toBe('p4');
    });
  });

  describe('sortCrossGroupStandings & getBestRunnerUp (RF-67 tiebreakers)', () => {
    function makeRow(
      playerId: PlayerId,
      pts: number,
      dg: number,
      pg: number,
      redCards: number,
      yellowCards: number,
      gf = 0,
      displayName = playerId
    ): LeagueStandingRow {
      return {
        playerId,
        displayName,
        team: 'Equipo',
        pts,
        pj: 2,
        pg,
        pe: 0,
        pp: 2 - pg,
        gf,
        gc: gf - dg,
        dg,
        redCards,
        yellowCards,
        rank: 2,
      };
    }

    it('breaks ties by Points first', () => {
      const r1 = makeRow('r1', 4, 2, 1, 0, 0);
      const r2 = makeRow('r2', 6, 1, 2, 0, 0);

      const sorted = sortCrossGroupStandings([r1, r2]);
      expect(sorted[0]?.playerId).toBe('r2');
    });

    it('breaks ties by Goal Difference second', () => {
      const r1 = makeRow('r1', 4, 3, 1, 0, 0);
      const r2 = makeRow('r2', 4, 1, 1, 0, 0);

      const sorted = sortCrossGroupStandings([r2, r1]);
      expect(sorted[0]?.playerId).toBe('r1');
    });

    it('breaks ties by Matches Won (PG) third', () => {
      const r1 = makeRow('r1', 4, 2, 1, 0, 0);
      const r2 = makeRow('r2', 4, 2, 0, 0, 0);

      const sorted = sortCrossGroupStandings([r2, r1]);
      expect(sorted[0]?.playerId).toBe('r1');
    });

    it('breaks ties by Less Red Cards fourth', () => {
      const r1 = makeRow('r1', 4, 2, 1, 0, 0);
      const r2 = makeRow('r2', 4, 2, 1, 1, 0);

      const sorted = sortCrossGroupStandings([r2, r1]);
      expect(sorted[0]?.playerId).toBe('r1');
    });

    it('breaks ties by Less Yellow Cards fifth', () => {
      const r1 = makeRow('r1', 4, 2, 1, 0, 1);
      const r2 = makeRow('r2', 4, 2, 1, 0, 3);

      const sorted = sortCrossGroupStandings([r2, r1]);
      expect(sorted[0]?.playerId).toBe('r1');
    });

    it('breaks ties by Goals For (GF) sixth', () => {
      const r1 = makeRow('r1', 4, 2, 1, 0, 1, 5);
      const r2 = makeRow('r2', 4, 2, 1, 0, 1, 3);

      const sorted = sortCrossGroupStandings([r2, r1]);
      expect(sorted[0]?.playerId).toBe('r1');
    });

    it('getBestRunnerUp selects the top runner up', () => {
      const rA = makeRow('rA', 3, 1, 1, 0, 2);
      const rB = makeRow('rB', 4, 2, 1, 0, 1); // Best
      const rC = makeRow('rC', 3, 0, 1, 1, 0);

      const best = getBestRunnerUp([rA, rB, rC]);
      expect(best.playerId).toBe('rB');
    });

    it('getBestRunnerUp throws if list is empty', () => {
      expect(() => getBestRunnerUp([])).toThrow(
        /No hay participantes segundos para comparar/
      );
    });
  });

  describe('isGroupStageComplete', () => {
    it('returns false if matches list is empty or any match is unconfirmed', () => {
      expect(isGroupStageComplete([])).toBe(false);

      const matches: GroupMatch[] = [
        {
          id: 'GA_R1_M1',
          groupId: 'A',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 1,
          scoreB: 0,
          confirmed: true,
        },
        {
          id: 'GA_R2_M1',
          groupId: 'A',
          round: 2,
          playerA: 'p3',
          playerB: 'p1',
          scoreA: null,
          scoreB: null,
          confirmed: false,
        },
      ];

      expect(isGroupStageComplete(matches)).toBe(false);
    });

    it('returns true when all matches are confirmed', () => {
      const matches: GroupMatch[] = [
        {
          id: 'GA_R1_M1',
          groupId: 'A',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 1,
          scoreB: 0,
          confirmed: true,
        },
        {
          id: 'GA_R2_M1',
          groupId: 'A',
          round: 2,
          playerA: 'p3',
          playerB: 'p1',
          scoreA: 2,
          scoreB: 2,
          confirmed: true,
        },
      ];

      expect(isGroupStageComplete(matches)).toBe(true);
    });
  });

  describe('generateGroupPlayoffs (RF-67)', () => {
    function makeRow(
      playerId: PlayerId,
      pts: number,
      dg: number,
      rank: number
    ): LeagueStandingRow {
      return {
        playerId,
        displayName: playerId,
        team: 'Equipo',
        pts,
        pj: 2,
        pg: pts > 3 ? 2 : 1,
        pe: 0,
        pp: 0,
        gf: dg + 1,
        gc: 1,
        dg,
        rank,
      };
    }

    it('generates crossed semifinals for 6 participants (1°A vs 2°B, 1°B vs 2°A)', () => {
      const standings: Record<GroupId, LeagueStandingRow[]> = {
        A: [makeRow('p1', 6, 4, 1), makeRow('p2', 3, 1, 2)],
        B: [makeRow('p4', 6, 3, 1), makeRow('p5', 3, 0, 2)],
      } as Record<GroupId, LeagueStandingRow[]>;

      const playoffs = generateGroupPlayoffs(standings);

      expect(playoffs.length).toBe(4);
      const [sf1, sf2, finalSeries, tpSeries] = playoffs;

      // SF1: 1°A ('p1') vs 2°B ('p5')
      expect(sf1?.id).toBe('SF1');
      expect(sf1?.playerA).toBe('p1');
      expect(sf1?.playerB).toBe('p5');
      expect(sf1?.winnerTo).toEqual({ seriesId: 'F', side: 'a' });
      expect(sf1?.loserTo).toEqual({ seriesId: 'TP', side: 'a' });

      // SF2: 1°B ('p4') vs 2°A ('p2')
      expect(sf2?.id).toBe('SF2');
      expect(sf2?.playerA).toBe('p4');
      expect(sf2?.playerB).toBe('p2');
      expect(sf2?.winnerTo).toEqual({ seriesId: 'F', side: 'b' });
      expect(sf2?.loserTo).toEqual({ seriesId: 'TP', side: 'b' });

      // Final & TP
      expect(finalSeries?.id).toBe('F');
      expect(finalSeries?.playerA).toBeNull();
      expect(finalSeries?.playerB).toBeNull();
      expect(tpSeries?.id).toBe('TP');
      expect(tpSeries?.playerA).toBeNull();
      expect(tpSeries?.playerB).toBeNull();
    });

    it('generates semifinals for 9 participants (Mejor 1° vs Mejor 2°, 2° 1° vs 3° 1°)', () => {
      const standings: Record<GroupId, LeagueStandingRow[]> = {
        A: [
          makeRow('winnerA', 6, 5, 1), // Best 1st (DG +5)
          makeRow('runnerA', 3, 2, 2), // Best 2nd (DG +2)
        ],
        B: [
          makeRow('winnerB', 6, 3, 1), // 2nd Best 1st (DG +3)
          makeRow('runnerB', 3, 0, 2),
        ],
        C: [
          makeRow('winnerC', 4, 1, 1), // 3rd Best 1st (4 pts)
          makeRow('runnerC', 3, -1, 2),
        ],
      } as Record<GroupId, LeagueStandingRow[]>;

      const playoffs = generateGroupPlayoffs(standings);

      expect(playoffs.length).toBe(4);
      const [sf1, sf2, finalSeries, tpSeries] = playoffs;

      // SF1: Mejor 1° ('winnerA') vs Mejor 2° ('runnerA')
      expect(sf1?.id).toBe('SF1');
      expect(sf1?.playerA).toBe('winnerA');
      expect(sf1?.playerB).toBe('runnerA');
      expect(sf1?.winnerTo).toEqual({ seriesId: 'F', side: 'a' });
      expect(sf1?.loserTo).toEqual({ seriesId: 'TP', side: 'a' });

      // SF2: 2° Mejor 1° ('winnerB') vs 3° Mejor 1° ('winnerC')
      expect(sf2?.id).toBe('SF2');
      expect(sf2?.playerA).toBe('winnerB');
      expect(sf2?.playerB).toBe('winnerC');
      expect(sf2?.winnerTo).toEqual({ seriesId: 'F', side: 'b' });
      expect(sf2?.loserTo).toEqual({ seriesId: 'TP', side: 'b' });

      // Final & TP
      expect(finalSeries?.id).toBe('F');
      expect(tpSeries?.id).toBe('TP');
    });

    it('throws error if standings structure is invalid', () => {
      expect(() => generateGroupPlayoffs({})).toThrow(
        /La fase de grupos requiere 2 grupos \(A y B\) o 3 grupos \(A, B y C\)/
      );

      expect(() =>
        generateGroupPlayoffs({
          A: [makeRow('p1', 3, 0, 1)],
          B: [makeRow('p2', 3, 0, 1)],
        } as Record<GroupId, LeagueStandingRow[]>)
      ).toThrow(
        /Los grupos A y B deben tener al menos 2 participantes para generar los playoffs/
      );
    });
  });
});

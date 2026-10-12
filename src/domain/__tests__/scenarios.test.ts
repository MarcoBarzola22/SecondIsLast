import { describe, expect, it } from 'vitest';
import {
  calculateMathematicalElimination,
  calculateMathematicalQualification,
  getDetailedQualificationStatus,
  getMatchScenarioGuidance,
  isLastRounds,
  isPlayerMathematicallyEliminated,
  isPlayerMathematicallyQualified,
} from '../scenarios';
import type { LeagueMatch, LeagueStandingRow } from '../types';

function createRow(
  playerId: string,
  pts: number,
  dg: number,
  rank: number,
  displayName = `${playerId}, Test`
): LeagueStandingRow {
  return {
    playerId,
    displayName,
    team: 'Team ' + playerId,
    pts,
    pj: 3,
    pg: Math.floor(pts / 3),
    pe: pts % 3,
    pp: 0,
    gf: 10 + dg,
    gc: 10,
    dg,
    rank,
  };
}

describe('domain - scenarios (Mathematical Qualification & Guidance RF-73..75)', () => {
  describe('calculateMathematicalQualification and isPlayerMathematicallyQualified', () => {
    it('detects mathematically qualified leaders when rivals cannot reach their points', () => {
      // 4-player league with 2 qualifying spots (Playoffs)
      // p1 has 9 pts with 1 match remaining (max 12)
      // p2 has 6 pts with 1 match remaining (max 9)
      // p3 has 1 pt with 1 match remaining (max 4)
      // p4 has 1 pt with 1 match remaining (max 4)
      const standings: LeagueStandingRow[] = [
        createRow('p1', 9, 5, 1),
        createRow('p2', 6, 2, 2),
        createRow('p3', 1, -3, 3),
        createRow('p4', 1, -4, 4),
      ];

      const remainingMatches: LeagueMatch[] = [
        {
          id: 'R3_M1',
          round: 3,
          playerA: 'p1',
          playerB: 'p4',
          scoreA: null,
          scoreB: null,
          confirmed: false,
        },
        {
          id: 'R3_M2',
          round: 3,
          playerA: 'p2',
          playerB: 'p3',
          scoreA: null,
          scoreB: null,
          confirmed: false,
        },
      ];

      const qualification = calculateMathematicalQualification(
        standings,
        remainingMatches,
        2
      );

      // p1 is guaranteed top 2 (only p2 could reach 9 pts)
      expect(qualification['p1']).toBe(true);
      // p2 is guaranteed top 2 (only p1 has >= 6 pts, p3 and p4 can reach at most 4 pts)
      expect(qualification['p2']).toBe(true);
      // p3 and p4 cannot qualify
      expect(qualification['p3']).toBe(false);
      expect(qualification['p4']).toBe(false);

      // p3 and p4 are mathematically eliminated from top 2
      expect(
        isPlayerMathematicallyEliminated('p3', standings, remainingMatches, 2)
      ).toBe(true);
      expect(
        isPlayerMathematicallyEliminated('p4', standings, remainingMatches, 2)
      ).toBe(true);
    });

    it('resolves mutual head-to-head collision between threatening rivals', () => {
      // Leader has 10 pts.
      // R1 has 8 pts, R2 has 8 pts.
      // R3 has 0 pts.
      // R1 and R2 play against each other in the only remaining match!
      // Independently, R1 could reach 11 and R2 could reach 11.
      // But mutually, at most one can reach >= 10 pts!
      const standings: LeagueStandingRow[] = [
        createRow('leader', 10, 4, 1),
        createRow('r1', 8, 2, 2),
        createRow('r2', 8, 2, 3),
        createRow('r3', 0, -8, 4),
      ];

      const remainingMatches: LeagueMatch[] = [
        {
          id: 'FINAL_M',
          round: 3,
          playerA: 'r1',
          playerB: 'r2',
          scoreA: null,
          scoreB: null,
          confirmed: false,
        },
      ];

      // Top 2 qualify:
      // Since at most ONE of {r1, r2} can reach >= 10, leader is 100% guaranteed top 2!
      expect(
        isPlayerMathematicallyQualified(
          'leader',
          standings,
          remainingMatches,
          2
        )
      ).toBe(true);
    });

    it('identifies guaranteed champion when no rival can reach 1st place points', () => {
      const standings: LeagueStandingRow[] = [
        createRow('p1', 12, 8, 1),
        createRow('p2', 6, 1, 2),
        createRow('p3', 6, 0, 3),
        createRow('p4', 0, -9, 4),
      ];

      const remainingMatches: LeagueMatch[] = [
        {
          id: 'R4_M1',
          round: 4,
          playerA: 'p2',
          playerB: 'p3',
          scoreA: null,
          scoreB: null,
          confirmed: false,
        },
      ];

      const qualificationFor1st = calculateMathematicalQualification(
        standings,
        remainingMatches,
        1
      );

      expect(qualificationFor1st['p1']).toBe(true);
      expect(qualificationFor1st['p2']).toBe(false);
      expect(qualificationFor1st['p3']).toBe(false);
    });

    it('returns detailed qualification status with accurate fields', () => {
      const standings: LeagueStandingRow[] = [
        createRow('p1', 9, 4, 1),
        createRow('p2', 3, 0, 2),
        createRow('p3', 0, -4, 3),
      ];

      const remainingMatches: LeagueMatch[] = [
        {
          id: 'M1',
          round: 2,
          playerA: 'p2',
          playerB: 'p3',
          scoreA: null,
          scoreB: null,
          confirmed: false,
        },
      ];

      const details = getDetailedQualificationStatus(
        standings,
        remainingMatches,
        1
      );

      expect(details['p1']?.isQualified).toBe(true);
      expect(details['p1']?.isChampionSecured).toBe(true);
      expect(details['p1']?.remainingMatchesCount).toBe(0);

      expect(details['p2']?.isQualified).toBe(false);
      expect(details['p2']?.isEliminated).toBe(true);
      expect(details['p2']?.maxPoints).toBe(6);
    });
  });

  describe('getMatchScenarioGuidance (Contextual match scenarios RF-75)', () => {
    it('returns "1° puesto asegurado" if player has already locked the title', () => {
      const standings: LeagueStandingRow[] = [
        createRow('p1', 15, 10, 1),
        createRow('p2', 6, 0, 2),
      ];
      const match: LeagueMatch = {
        id: 'M1',
        round: 5,
        playerA: 'p1',
        playerB: 'p2',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      };

      const { guidanceA } = getMatchScenarioGuidance(
        match,
        standings,
        [match],
        1
      );
      expect(guidanceA).toBe('1° puesto asegurado');
    });

    it('returns "Con un triunfo asegura el 1° puesto" when a win locks 1st place', () => {
      // Leader has 10 pts with 0 matches left.
      // p1 has 8 pts with 1 match left against p2.
      // If p1 wins: p1 reaches 11 pts > 10 pts (locks 1st place).
      // If p1 draws: p1 reaches 9 pts < 10 pts (does not lock 1st place).
      const standings: LeagueStandingRow[] = [
        createRow('leader', 10, 5, 1),
        createRow('p1', 8, 3, 2),
        createRow('p2', 0, -8, 3),
      ];
      const match: LeagueMatch = {
        id: 'M1',
        round: 5,
        playerA: 'p1',
        playerB: 'p2',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      };

      const { guidanceA } = getMatchScenarioGuidance(
        match,
        standings,
        [match],
        1
      );
      expect(guidanceA).toBe('Con un triunfo asegura el 1° puesto');
    });

    it('returns "Un empate le asegura clasificar" when a draw guarantees qualification', () => {
      // 4 teams, top 2 qualify.
      // p1: 6 pts (1 match left vs p2)
      // p2: 4 pts (1 match left vs p1)
      // p3: 4 pts (0 matches left)
      // p4: 0 pts (0 matches left)
      // If p2 ties: p2 gets 5 pts, surpasses p3 (4 pts) and guarantees top 2!
      const standings: LeagueStandingRow[] = [
        createRow('p1', 6, 2, 1),
        createRow('p2', 4, 1, 2),
        createRow('p3', 4, 0, 3),
        createRow('p4', 0, -3, 4),
      ];
      const match: LeagueMatch = {
        id: 'FINAL',
        round: 3,
        playerA: 'p1',
        playerB: 'p2',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      };

      const { guidanceB } = getMatchScenarioGuidance(
        match,
        standings,
        [match],
        2
      );
      expect(guidanceB).toBe('Un empate le asegura clasificar');
    });

    it('returns "Con un triunfo asegura la clasificación" when win is required to lock top spots', () => {
      // 4 teams, top 2 qualify.
      // p1 has 7 pts (already qualified)
      // p2 has 4 pts, p3 has 4 pts.
      // p2 plays p4 (0 pts). p3 has no matches left.
      // If p2 wins: p2 reaches 7 pts, locking 2nd place.
      // If p2 draws: p2 reaches 5 pts, locking 2nd place too.
      // What if p3 has 5 pts and p2 has 3 pts?
      // If p2 wins: p2 gets 6 pts (passes p3). If p2 draws: p2 gets 4 pts (stays behind p3).
      const standings: LeagueStandingRow[] = [
        createRow('p1', 7, 4, 1),
        createRow('p3', 5, 1, 2),
        createRow('p2', 3, 0, 3),
        createRow('p4', 0, -5, 4),
      ];
      const match: LeagueMatch = {
        id: 'M_P2',
        round: 3,
        playerA: 'p2',
        playerB: 'p4',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      };

      const { guidanceA } = getMatchScenarioGuidance(
        match,
        standings,
        [match],
        2
      );
      expect(guidanceA).toBe('Con un triunfo asegura la clasificación');
    });

    it('returns "Obligado a ganar para seguir con chances" when a loss results in elimination', () => {
      // Top 2 qualify.
      // p1: 12 pts, p2: 7 pts, p3: 6 pts, p4: 5 pts.
      // Remaining matches: p4 vs p2 (M_CRUCIAL), p3 vs p1 (M_OTHER).
      // If p4 wins: reaches 8 pts > 7 pts (p2), but p3 can reach 9 pts, so p4 does not lock qualification.
      // If p4 loses: p2 reaches 10 pts, leaving p4 with 5 pts eliminated!
      const standings: LeagueStandingRow[] = [
        createRow('p1', 12, 5, 1),
        createRow('p2', 7, 3, 2),
        createRow('p3', 6, 0, 3),
        createRow('p4', 5, -2, 4),
      ];
      const matchCrucial: LeagueMatch = {
        id: 'M_CRUCIAL',
        round: 5,
        playerA: 'p4',
        playerB: 'p2',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      };
      const matchOther: LeagueMatch = {
        id: 'M_OTHER',
        round: 5,
        playerA: 'p3',
        playerB: 'p1',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      };

      const { guidanceA } = getMatchScenarioGuidance(
        matchCrucial,
        standings,
        [matchCrucial, matchOther],
        2
      );
      expect(guidanceA).toBe('Obligado a ganar para seguir con chances');
    });

    it('returns "Eliminado matemáticamente" when a player has no mathematical chance to qualify (RF-85)', () => {
      // Top 2 qualify.
      // p1: 10 pts, p2: 8 pts, p3: 6 pts, p4: 3 pts.
      // p4 has 1 match left against p2. Max points = 6 < 8 (p2).
      const standings: LeagueStandingRow[] = [
        createRow('p1', 10, 5, 1),
        createRow('p2', 8, 3, 2),
        createRow('p3', 6, 0, 3),
        createRow('p4', 3, -2, 4),
      ];
      const match: LeagueMatch = {
        id: 'M_CRUCIAL',
        round: 5,
        playerA: 'p4',
        playerB: 'p2',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      };

      const { guidanceA } = getMatchScenarioGuidance(
        match,
        standings,
        [match],
        2
      );
      expect(guidanceA).toBe('Eliminado matemáticamente');
    });

    it('suggests goal difference requirements in direct duels', () => {
      // p2 has 6 pts, DG +3
      // p3 has 3 pts, DG +1
      // p3 plays p2.
      // To surpass p2 in DG upon tying in points (3 pts each),
      // diff = 3 - 1 = 2. Goals needed = floor(2/2) + 1 = 2 goals.
      const standings: LeagueStandingRow[] = [
        createRow('p1', 9, 6, 1),
        createRow('p2', 6, 3, 2, 'Rival, Pedro'),
        createRow('p3', 3, 1, 3, 'Gomez, Juan'),
        createRow('p4', 0, -10, 4),
      ];
      const match: LeagueMatch = {
        id: 'M_DG',
        round: 3,
        playerA: 'p3',
        playerB: 'p2',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      };

      const { guidanceA } = getMatchScenarioGuidance(
        match,
        standings,
        [match],
        2
      );
      expect(guidanceA).toContain('Necesita ganar por 2 goles');
      expect(guidanceA).toContain('Rival');
    });

    it('returns null guidance for already confirmed matches', () => {
      const standings = [createRow('p1', 3, 1, 1), createRow('p2', 0, -1, 2)];
      const match: LeagueMatch = {
        id: 'M_DONE',
        round: 1,
        playerA: 'p1',
        playerB: 'p2',
        scoreA: 2,
        scoreB: 1,
        confirmed: true,
      };

      const { guidanceA, guidanceB } = getMatchScenarioGuidance(
        match,
        standings,
        []
      );
      expect(guidanceA).toBeNull();
      expect(guidanceB).toBeNull();
    });
  });

  describe('isLastRounds helper (RF-75)', () => {
    it('returns true for all rounds when tournament has 3 or fewer rounds', () => {
      expect(isLastRounds(1, 3)).toBe(true);
      expect(isLastRounds(2, 3)).toBe(true);
      expect(isLastRounds(3, 3)).toBe(true);

      expect(isLastRounds(1, 2)).toBe(true);
      expect(isLastRounds(2, 2)).toBe(true);
    });

    it('returns true only for the final 3 rounds when tournament has more than 3 rounds', () => {
      // 5 rounds: rounds 3, 4, 5 are the last rounds
      expect(isLastRounds(1, 5)).toBe(false);
      expect(isLastRounds(2, 5)).toBe(false);
      expect(isLastRounds(3, 5)).toBe(true);
      expect(isLastRounds(4, 5)).toBe(true);
      expect(isLastRounds(5, 5)).toBe(true);

      // 7 rounds: rounds 5, 6, 7 are the last rounds
      expect(isLastRounds(4, 7)).toBe(false);
      expect(isLastRounds(5, 7)).toBe(true);
      expect(isLastRounds(6, 7)).toBe(true);
      expect(isLastRounds(7, 7)).toBe(true);
    });
  });

  describe('calculateMathematicalElimination (RF-83)', () => {
    it('marks players with no mathematical chance as eliminated in 6-player league with top 4 cutoff', () => {
      // 6 players, top 4 qualify to playoffs.
      // p1: 12 pts (1 match left, max 15)
      // p2: 10 pts (1 match left, max 13)
      // p3: 9 pts (1 match left, max 12)
      // p4: 8 pts (1 match left, max 11)
      // p5: 3 pts (1 match left, max 6) -> 4 rivals already have >= 8 pts!
      // p6: 1 pt (1 match left, max 4) -> 4 rivals already have >= 8 pts!
      const standings: LeagueStandingRow[] = [
        createRow('p1', 12, 6, 1),
        createRow('p2', 10, 4, 2),
        createRow('p3', 9, 3, 3),
        createRow('p4', 8, 1, 4),
        createRow('p5', 3, -5, 5),
        createRow('p6', 1, -9, 6),
      ];

      const remainingMatches: LeagueMatch[] = [
        { id: 'm1', round: 5, playerA: 'p1', playerB: 'p6', scoreA: null, scoreB: null, confirmed: false },
        { id: 'm2', round: 5, playerA: 'p2', playerB: 'p5', scoreA: null, scoreB: null, confirmed: false },
        { id: 'm3', round: 5, playerA: 'p3', playerB: 'p4', scoreA: null, scoreB: null, confirmed: false },
      ];

      const eliminated = calculateMathematicalElimination(standings, remainingMatches, 4);

      expect(eliminated['p1']).toBe(false);
      expect(eliminated['p2']).toBe(false);
      expect(eliminated['p3']).toBe(false);
      expect(eliminated['p4']).toBe(false);
      expect(eliminated['p5']).toBe(true); // Max 6, 4 rivals have >= 8 pts
      expect(eliminated['p6']).toBe(true); // Max 4, 4 rivals have >= 8 pts
    });

    it('keeps a player alive if their max points can reach or surpass the 4th position', () => {
      // p4 has 7 pts (0 matches left, max 7)
      // p5 has 5 pts (1 match left, max 8)
      const standings: LeagueStandingRow[] = [
        createRow('p1', 12, 6, 1),
        createRow('p2', 10, 4, 2),
        createRow('p3', 9, 3, 3),
        createRow('p4', 7, 0, 4),
        createRow('p5', 5, -2, 5),
        createRow('p6', 0, -11, 6),
      ];

      const remainingMatches: LeagueMatch[] = [
        { id: 'm1', round: 5, playerA: 'p5', playerB: 'p6', scoreA: null, scoreB: null, confirmed: false },
      ];

      const eliminated = calculateMathematicalElimination(standings, remainingMatches, 4);

      // p5 can reach 8 pts, which beats p4's 7 pts -> p5 is NOT eliminated!
      expect(eliminated['p5']).toBe(false);
      // p6 max 3 pts, 4 rivals already have >= 7 pts -> p6 is eliminated!
      expect(eliminated['p6']).toBe(true);
    });

    it('marks players outside qualifying spots as eliminated when all matches are finished', () => {
      const standings: LeagueStandingRow[] = [
        createRow('p1', 9, 4, 1),
        createRow('p2', 6, 1, 2),
        createRow('p3', 3, -1, 3),
        createRow('p4', 0, -4, 4),
      ];

      // No matches left in tournament
      const eliminated = calculateMathematicalElimination(standings, [], 2);

      expect(eliminated['p1']).toBe(false);
      expect(eliminated['p2']).toBe(false);
      expect(eliminated['p3']).toBe(true);
      expect(eliminated['p4']).toBe(true);
    });

    it('uses correct default qualifying spots based on participants count', () => {
      // <= 4 participants defaults to 2 qualifying spots
      const standings4: LeagueStandingRow[] = [
        createRow('p1', 6, 3, 1),
        createRow('p2', 6, 2, 2),
        createRow('p3', 0, -2, 3),
        createRow('p4', 0, -3, 4),
      ];
      const eliminated4 = calculateMathematicalElimination(standings4, []);
      expect(eliminated4['p1']).toBe(false);
      expect(eliminated4['p2']).toBe(false);
      expect(eliminated4['p3']).toBe(true);
      expect(eliminated4['p4']).toBe(true);
    });
  });
});

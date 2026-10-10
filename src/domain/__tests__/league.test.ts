import { describe, expect, it } from 'vitest';
import {
  computeLeagueTable,
  confirmLeagueMatch,
  generateLeagueFixture,
  getLeaguePodium,
  isLeagueComplete,
  reopenLeagueMatch,
  setLeagueMatchScore,
} from '../league';
import type { LeagueMatch, Player } from '../types';

describe('league - domain logic (RF-50, RF-51, RF-53, RF-54, RF-55)', () => {
  const p4 = ['p1', 'p2', 'p3', 'p4'];
  const p5 = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const p6 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const p7 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
  const p8 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const p9 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'];
  const p10 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'];

  describe('generateLeagueFixture (RF-50)', () => {
    it('throws error for invalid participant counts (< 4 or > 10)', () => {
      expect(() => generateLeagueFixture(['p1', 'p2', 'p3'])).toThrow(
        /Cantidad inválida de participantes/
      );
      expect(() =>
        generateLeagueFixture([
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
      ).toThrow(/Cantidad inválida de participantes/);
    });

    it('generates complete Round Robin for 4 participants (3 rounds, 6 matches)', () => {
      const fixture = generateLeagueFixture(p4, () => 0.5);
      expect(fixture).toHaveLength(6);

      // Check rounds: 3 rounds, 2 matches each
      const rounds = new Set(fixture.map((m) => m.round));
      expect(rounds).toEqual(new Set([1, 2, 3]));
      expect(fixture.filter((m) => m.round === 1)).toHaveLength(2);
      expect(fixture.filter((m) => m.round === 2)).toHaveLength(2);
      expect(fixture.filter((m) => m.round === 3)).toHaveLength(2);

      // Verify every pair of players meets exactly once
      const pairs = new Set<string>();
      for (const m of fixture) {
        expect(m.playerA).not.toBe(m.playerB);
        const pairKey = [m.playerA, m.playerB].sort().join('_vs_');
        expect(pairs.has(pairKey)).toBe(false);
        pairs.add(pairKey);
      }
      expect(pairs.size).toBe(6); // 4 * 3 / 2 = 6
    });

    it('generates complete Round Robin for 5 participants (5 rounds, 10 matches, 1 bye per round)', () => {
      const fixture = generateLeagueFixture(p5, () => 0.5);
      expect(fixture).toHaveLength(10);

      // 5 rounds, 2 matches each (1 bye per round)
      const rounds = new Set(fixture.map((m) => m.round));
      expect(rounds).toEqual(new Set([1, 2, 3, 4, 5]));
      for (let r = 1; r <= 5; r++) {
        const roundMatches = fixture.filter((m) => m.round === r);
        expect(roundMatches).toHaveLength(2);

        // In each round, exactly 4 distinct players play, and 1 rests
        const playing = new Set<string>();
        roundMatches.forEach((m) => {
          playing.add(m.playerA);
          playing.add(m.playerB);
        });
        expect(playing.size).toBe(4);
      }

      // Verify all 10 unique pairs exist
      const pairs = new Set<string>();
      for (const m of fixture) {
        const pairKey = [m.playerA, m.playerB].sort().join('_vs_');
        expect(pairs.has(pairKey)).toBe(false);
        pairs.add(pairKey);
      }
      expect(pairs.size).toBe(10); // 5 * 4 / 2 = 10
    });

    it('generates complete Round Robin for 6 participants (5 rounds, 15 matches)', () => {
      const fixture = generateLeagueFixture(p6, () => 0.5);
      expect(fixture).toHaveLength(15);

      // 5 rounds, 3 matches each
      for (let r = 1; r <= 5; r++) {
        expect(fixture.filter((m) => m.round === r)).toHaveLength(3);
      }

      const pairs = new Set<string>();
      for (const m of fixture) {
        const pairKey = [m.playerA, m.playerB].sort().join('_vs_');
        expect(pairs.has(pairKey)).toBe(false);
        pairs.add(pairKey);
      }
      expect(pairs.size).toBe(15); // 6 * 5 / 2 = 15
    });

    it('generates complete Round Robin for 7 participants (7 rounds, 21 matches, 1 bye per round)', () => {
      const fixture = generateLeagueFixture(p7, () => 0.5);
      expect(fixture).toHaveLength(21);

      // 7 rounds, 3 matches each (1 bye per round)
      const rounds = new Set(fixture.map((m) => m.round));
      expect(rounds).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
      const restedPlayers = new Set<string>();

      for (let r = 1; r <= 7; r++) {
        const roundMatches = fixture.filter((m) => m.round === r);
        expect(roundMatches).toHaveLength(3);

        const playing = new Set<string>();
        roundMatches.forEach((m) => {
          playing.add(m.playerA);
          playing.add(m.playerB);
        });
        expect(playing.size).toBe(6);

        // Find the resting player
        const resting = p7.filter((p) => !playing.has(p));
        expect(resting).toHaveLength(1);
        restedPlayers.add(resting[0]!);
      }

      // Every player rests exactly once across the 7 rounds
      expect(restedPlayers.size).toBe(7);

      const pairs = new Set<string>();
      for (const m of fixture) {
        const pairKey = [m.playerA, m.playerB].sort().join('_vs_');
        expect(pairs.has(pairKey)).toBe(false);
        pairs.add(pairKey);
      }
      expect(pairs.size).toBe(21); // 7 * 6 / 2 = 21
    });

    it('generates complete Round Robin for 8 participants (7 rounds, 28 matches, 0 byes)', () => {
      const fixture = generateLeagueFixture(p8, () => 0.5);
      expect(fixture).toHaveLength(28);

      for (let r = 1; r <= 7; r++) {
        const roundMatches = fixture.filter((m) => m.round === r);
        expect(roundMatches).toHaveLength(4);
        const playing = new Set<string>();
        roundMatches.forEach((m) => {
          playing.add(m.playerA);
          playing.add(m.playerB);
        });
        expect(playing.size).toBe(8);
      }

      const pairs = new Set<string>();
      for (const m of fixture) {
        const pairKey = [m.playerA, m.playerB].sort().join('_vs_');
        expect(pairs.has(pairKey)).toBe(false);
        pairs.add(pairKey);
      }
      expect(pairs.size).toBe(28); // 8 * 7 / 2 = 28
    });

    it('generates complete Round Robin for 9 participants (9 rounds, 36 matches, 1 bye per round)', () => {
      const fixture = generateLeagueFixture(p9, () => 0.5);
      expect(fixture).toHaveLength(36);

      const restedPlayers = new Set<string>();
      for (let r = 1; r <= 9; r++) {
        const roundMatches = fixture.filter((m) => m.round === r);
        expect(roundMatches).toHaveLength(4);

        const playing = new Set<string>();
        roundMatches.forEach((m) => {
          playing.add(m.playerA);
          playing.add(m.playerB);
        });
        expect(playing.size).toBe(8);

        const resting = p9.filter((p) => !playing.has(p));
        expect(resting).toHaveLength(1);
        restedPlayers.add(resting[0]!);
      }

      expect(restedPlayers.size).toBe(9);

      const pairs = new Set<string>();
      for (const m of fixture) {
        const pairKey = [m.playerA, m.playerB].sort().join('_vs_');
        expect(pairs.has(pairKey)).toBe(false);
        pairs.add(pairKey);
      }
      expect(pairs.size).toBe(36); // 9 * 8 / 2 = 36
    });

    it('generates complete Round Robin for 10 participants (9 rounds, 45 matches, 0 byes)', () => {
      const fixture = generateLeagueFixture(p10, () => 0.5);
      expect(fixture).toHaveLength(45);

      for (let r = 1; r <= 9; r++) {
        const roundMatches = fixture.filter((m) => m.round === r);
        expect(roundMatches).toHaveLength(5);
        const playing = new Set<string>();
        roundMatches.forEach((m) => {
          playing.add(m.playerA);
          playing.add(m.playerB);
        });
        expect(playing.size).toBe(10);
      }

      const pairs = new Set<string>();
      for (const m of fixture) {
        const pairKey = [m.playerA, m.playerB].sort().join('_vs_');
        expect(pairs.has(pairKey)).toBe(false);
        pairs.add(pairKey);
      }
      expect(pairs.size).toBe(45); // 10 * 9 / 2 = 45
    });

    describe('two_legged format (RF-49, RF-50)', () => {
      it('generates double round robin for 4 participants (6 rounds, 12 matches, inverted legs)', () => {
        const fixture = generateLeagueFixture(p4, 'two_legged', () => 0.5);
        expect(fixture).toHaveLength(12);

        // 6 rounds, 2 matches each
        const rounds = new Set(fixture.map((m) => m.round));
        expect(rounds).toEqual(new Set([1, 2, 3, 4, 5, 6]));
        for (let r = 1; r <= 6; r++) {
          expect(fixture.filter((m) => m.round === r)).toHaveLength(2);
        }

        // Check mirror between leg 1 (rounds 1-3) and leg 2 (rounds 4-6)
        for (let r = 1; r <= 3; r++) {
          const leg1Matches = fixture.filter((m) => m.round === r);
          const leg2Matches = fixture.filter((m) => m.round === r + 3);

          expect(leg1Matches).toHaveLength(2);
          expect(leg2Matches).toHaveLength(2);

          leg1Matches.forEach((m1, idx) => {
            const m2 = leg2Matches[idx]!;
            expect(m2.id).toBe(`R${r + 3}_M${idx + 1}`);
            expect(m2.playerA).toBe(m1.playerB);
            expect(m2.playerB).toBe(m1.playerA);
          });
        }

        // Each ordered pair (A -> B) occurs exactly once, so each unordered pair occurs twice (1 home, 1 away)
        const orderedPairs = new Set<string>();
        for (const m of fixture) {
          const key = `${m.playerA}->${m.playerB}`;
          expect(orderedPairs.has(key)).toBe(false);
          orderedPairs.add(key);
        }
        expect(orderedPairs.size).toBe(12); // 4 * 3 = 12 matches
      });

      it('generates double round robin for 5 participants (10 rounds, 20 matches, 1 bye per round)', () => {
        const fixture = generateLeagueFixture(p5, 'two_legged', () => 0.5);
        expect(fixture).toHaveLength(20);

        const rounds = new Set(fixture.map((m) => m.round));
        expect(rounds).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
        for (let r = 1; r <= 10; r++) {
          const roundMatches = fixture.filter((m) => m.round === r);
          expect(roundMatches).toHaveLength(2);
          const playing = new Set<string>();
          roundMatches.forEach((m) => {
            playing.add(m.playerA);
            playing.add(m.playerB);
          });
          expect(playing.size).toBe(4);
        }

        // Check leg 2 mirrors leg 1 with inverted home/away
        for (let r = 1; r <= 5; r++) {
          const leg1Matches = fixture.filter((m) => m.round === r);
          const leg2Matches = fixture.filter((m) => m.round === r + 5);

          expect(leg1Matches).toHaveLength(2);
          expect(leg2Matches).toHaveLength(2);

          leg1Matches.forEach((m1, idx) => {
            const m2 = leg2Matches[idx]!;
            expect(m2.id).toBe(`R${r + 5}_M${idx + 1}`);
            expect(m2.playerA).toBe(m1.playerB);
            expect(m2.playerB).toBe(m1.playerA);
          });
        }

        const orderedPairs = new Set<string>();
        for (const m of fixture) {
          const key = `${m.playerA}->${m.playerB}`;
          expect(orderedPairs.has(key)).toBe(false);
          orderedPairs.add(key);
        }
        expect(orderedPairs.size).toBe(20); // 5 * 4 = 20 matches
      });

      it('generates double round robin for 6 participants (10 rounds, 30 matches, inverted legs)', () => {
        const fixture = generateLeagueFixture(p6, 'two_legged', () => 0.5);
        expect(fixture).toHaveLength(30);

        const rounds = new Set(fixture.map((m) => m.round));
        expect(rounds).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
        for (let r = 1; r <= 10; r++) {
          expect(fixture.filter((m) => m.round === r)).toHaveLength(3);
        }

        // Check leg 2 mirrors leg 1 with inverted home/away
        for (let r = 1; r <= 5; r++) {
          const leg1Matches = fixture.filter((m) => m.round === r);
          const leg2Matches = fixture.filter((m) => m.round === r + 5);

          expect(leg1Matches).toHaveLength(3);
          expect(leg2Matches).toHaveLength(3);

          leg1Matches.forEach((m1, idx) => {
            const m2 = leg2Matches[idx]!;
            expect(m2.id).toBe(`R${r + 5}_M${idx + 1}`);
            expect(m2.playerA).toBe(m1.playerB);
            expect(m2.playerB).toBe(m1.playerA);
          });
        }

        const orderedPairs = new Set<string>();
        for (const m of fixture) {
          const key = `${m.playerA}->${m.playerB}`;
          expect(orderedPairs.has(key)).toBe(false);
          orderedPairs.add(key);
        }
        expect(orderedPairs.size).toBe(30); // 6 * 5 = 30 matches
      });

      it('generates double round robin for 7 participants (14 rounds, 42 matches, 1 bye per round)', () => {
        const fixture = generateLeagueFixture(p7, 'two_legged', () => 0.5);
        expect(fixture).toHaveLength(42);

        const rounds = new Set(fixture.map((m) => m.round));
        expect(rounds.size).toBe(14);

        for (let r = 1; r <= 14; r++) {
          const roundMatches = fixture.filter((m) => m.round === r);
          expect(roundMatches).toHaveLength(3);
          const playing = new Set<string>();
          roundMatches.forEach((m) => {
            playing.add(m.playerA);
            playing.add(m.playerB);
          });
          expect(playing.size).toBe(6);
        }

        // Check leg 2 mirrors leg 1 with inverted home/away
        for (let r = 1; r <= 7; r++) {
          const leg1Matches = fixture.filter((m) => m.round === r);
          const leg2Matches = fixture.filter((m) => m.round === r + 7);

          expect(leg1Matches).toHaveLength(3);
          expect(leg2Matches).toHaveLength(3);

          leg1Matches.forEach((m1, idx) => {
            const m2 = leg2Matches[idx]!;
            expect(m2.id).toBe(`R${r + 7}_M${idx + 1}`);
            expect(m2.playerA).toBe(m1.playerB);
            expect(m2.playerB).toBe(m1.playerA);
          });
        }

        const orderedPairs = new Set<string>();
        for (const m of fixture) {
          const key = `${m.playerA}->${m.playerB}`;
          expect(orderedPairs.has(key)).toBe(false);
          orderedPairs.add(key);
        }
        expect(orderedPairs.size).toBe(42); // 7 * 6 = 42 matches
      });

      it('generates double round robin for 8 participants (14 rounds, 56 matches, 0 byes)', () => {
        const fixture = generateLeagueFixture(p8, 'two_legged', () => 0.5);
        expect(fixture).toHaveLength(56);

        const rounds = new Set(fixture.map((m) => m.round));
        expect(rounds.size).toBe(14);

        for (let r = 1; r <= 14; r++) {
          const roundMatches = fixture.filter((m) => m.round === r);
          expect(roundMatches).toHaveLength(4);
        }

        // Check leg 2 mirrors leg 1
        for (let r = 1; r <= 7; r++) {
          const leg1Matches = fixture.filter((m) => m.round === r);
          const leg2Matches = fixture.filter((m) => m.round === r + 7);

          leg1Matches.forEach((m1, idx) => {
            const m2 = leg2Matches[idx]!;
            expect(m2.id).toBe(`R${r + 7}_M${idx + 1}`);
            expect(m2.playerA).toBe(m1.playerB);
            expect(m2.playerB).toBe(m1.playerA);
          });
        }

        const orderedPairs = new Set<string>();
        for (const m of fixture) {
          const key = `${m.playerA}->${m.playerB}`;
          expect(orderedPairs.has(key)).toBe(false);
          orderedPairs.add(key);
        }
        expect(orderedPairs.size).toBe(56); // 8 * 7 = 56 matches
      });

      it('generates double round robin for 9 participants (18 rounds, 72 matches, 1 bye per round)', () => {
        const fixture = generateLeagueFixture(p9, 'two_legged', () => 0.5);
        expect(fixture).toHaveLength(72);

        const rounds = new Set(fixture.map((m) => m.round));
        expect(rounds.size).toBe(18);

        for (let r = 1; r <= 18; r++) {
          const roundMatches = fixture.filter((m) => m.round === r);
          expect(roundMatches).toHaveLength(4);
          const playing = new Set<string>();
          roundMatches.forEach((m) => {
            playing.add(m.playerA);
            playing.add(m.playerB);
          });
          expect(playing.size).toBe(8);
        }

        // Check leg 2 mirrors leg 1
        for (let r = 1; r <= 9; r++) {
          const leg1Matches = fixture.filter((m) => m.round === r);
          const leg2Matches = fixture.filter((m) => m.round === r + 9);

          leg1Matches.forEach((m1, idx) => {
            const m2 = leg2Matches[idx]!;
            expect(m2.id).toBe(`R${r + 9}_M${idx + 1}`);
            expect(m2.playerA).toBe(m1.playerB);
            expect(m2.playerB).toBe(m1.playerA);
          });
        }

        const orderedPairs = new Set<string>();
        for (const m of fixture) {
          const key = `${m.playerA}->${m.playerB}`;
          expect(orderedPairs.has(key)).toBe(false);
          orderedPairs.add(key);
        }
        expect(orderedPairs.size).toBe(72); // 9 * 8 = 72 matches
      });

      it('generates double round robin for 10 participants (18 rounds, 90 matches, 0 byes)', () => {
        const fixture = generateLeagueFixture(p10, 'two_legged', () => 0.5);
        expect(fixture).toHaveLength(90);

        const rounds = new Set(fixture.map((m) => m.round));
        expect(rounds.size).toBe(18);

        for (let r = 1; r <= 18; r++) {
          const roundMatches = fixture.filter((m) => m.round === r);
          expect(roundMatches).toHaveLength(5);
        }

        // Check leg 2 mirrors leg 1
        for (let r = 1; r <= 9; r++) {
          const leg1Matches = fixture.filter((m) => m.round === r);
          const leg2Matches = fixture.filter((m) => m.round === r + 9);

          leg1Matches.forEach((m1, idx) => {
            const m2 = leg2Matches[idx]!;
            expect(m2.id).toBe(`R${r + 9}_M${idx + 1}`);
            expect(m2.playerA).toBe(m1.playerB);
            expect(m2.playerB).toBe(m1.playerA);
          });
        }

        const orderedPairs = new Set<string>();
        for (const m of fixture) {
          const key = `${m.playerA}->${m.playerB}`;
          expect(orderedPairs.has(key)).toBe(false);
          orderedPairs.add(key);
        }
        expect(orderedPairs.size).toBe(90); // 10 * 9 = 90 matches
      });
    });
  });

  describe('setLeagueMatchScore, confirmLeagueMatch and reopenLeagueMatch (RF-51, RF-54)', () => {
    const sampleMatches: LeagueMatch[] = [
      {
        id: 'R1_M1',
        round: 1,
        playerA: 'p1',
        playerB: 'p2',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      },
    ];

    it('sets score and validates goal inputs', () => {
      const updated = setLeagueMatchScore(sampleMatches, 'R1_M1', 3, 1);
      expect(updated[0]!.scoreA).toBe(3);
      expect(updated[0]!.scoreB).toBe(1);
      expect(sampleMatches[0]!.scoreA).toBeNull(); // immutability

      expect(() => setLeagueMatchScore(sampleMatches, 'R1_M1', -1, 0)).toThrow(
        /Goles inválidos/
      );
      expect(() => setLeagueMatchScore(sampleMatches, 'R1_M1', 1, 100)).toThrow(
        /Goles inválidos/
      );
    });

    it('confirms and reopens match', () => {
      expect(() => confirmLeagueMatch(sampleMatches, 'R1_M1')).toThrow(
        /No se puede confirmar/
      );

      const withScores = setLeagueMatchScore(sampleMatches, 'R1_M1', 2, 2);
      const confirmed = confirmLeagueMatch(withScores, 'R1_M1');
      expect(confirmed[0]!.confirmed).toBe(true);

      const reopened = reopenLeagueMatch(confirmed, 'R1_M1');
      expect(reopened[0]!.confirmed).toBe(false);
    });
  });

  describe('isLeagueComplete (RF-55)', () => {
    it('returns true only when all matches are confirmed', () => {
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
          confirmed: false,
        },
      ];

      expect(isLeagueComplete(matches)).toBe(false);

      const allConfirmed = matches.map((m) => ({ ...m, confirmed: true }));
      expect(isLeagueComplete(allConfirmed)).toBe(true);
    });
  });

  describe('computeLeagueTable (RF-53)', () => {
    const players: Player[] = [
      { id: 'p1', firstName: 'Marco', lastName: 'Barzola', createdAt: '2026-10-09' },
      { id: 'p2', firstName: 'Lucas', lastName: 'Fernández', createdAt: '2026-10-09' },
      { id: 'p3', firstName: 'Nico', lastName: 'Gómez', createdAt: '2026-10-09' },
      { id: 'p4', firstName: 'Fede', lastName: 'Álvarez', createdAt: '2026-10-09' },
    ];

    const teams = {
      p1: 'Boca',
      p2: 'River',
      p3: 'Vélez',
      p4: 'Racing',
    };

    it('calculates points correctly (win = 3, draw = 1, loss = 0) and sorts standings', () => {
      // Matches scenario:
      // Match 1: p1 2 - 1 p2 (p1 wins -> 3 pts; p2 loss -> 0 pts)
      // Match 2: p3 1 - 1 p4 (p3 draw -> 1 pt; p4 draw -> 1 pt)
      // Match 3: p1 3 - 0 p3 (p1 wins -> 3 pts, total 6; p3 loss -> total 1)
      const matches: LeagueMatch[] = [
        {
          id: 'R1_M1',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 2,
          scoreB: 1,
          confirmed: true,
        },
        {
          id: 'R1_M2',
          round: 1,
          playerA: 'p3',
          playerB: 'p4',
          scoreA: 1,
          scoreB: 1,
          confirmed: true,
        },
        {
          id: 'R2_M1',
          round: 2,
          playerA: 'p1',
          playerB: 'p3',
          scoreA: 3,
          scoreB: 0,
          confirmed: true,
        },
      ];

      const table = computeLeagueTable(matches, ['p1', 'p2', 'p3', 'p4'], teams, players);

      // P1: 2 PJ, 2 PG, 0 PE, 0 PP, 5 GF, 1 GC, +4 DG, 6 PTS (Rank 1)
      expect(table[0]).toEqual({
        playerId: 'p1',
        displayName: 'Barzola, Marco',
        team: 'Boca',
        pts: 6,
        pj: 2,
        pg: 2,
        pe: 0,
        pp: 0,
        gf: 5,
        gc: 1,
        dg: 4,
        rank: 1,
      });

      // P4: 1 PJ, 0 PG, 1 PE, 0 PP, 1 GF, 1 GC, 0 DG, 1 PTS (Rank 2)
      expect(table[1]!.playerId).toBe('p4');
      expect(table[1]!.pts).toBe(1);
      expect(table[1]!.dg).toBe(0);
      expect(table[1]!.rank).toBe(2);

      // P3: 2 PJ, 0 PG, 1 PE, 1 PP, 1 GF, 4 GC, -3 DG, 1 PTS (Rank 3)
      expect(table[2]!.playerId).toBe('p3');
      expect(table[2]!.pts).toBe(1);
      expect(table[2]!.dg).toBe(-3);
      expect(table[2]!.rank).toBe(3);

      // P2: 1 PJ, 0 PG, 0 PE, 1 PP, 1 GF, 2 GC, -1 DG, 0 PTS (Rank 4)
      expect(table[3]!.playerId).toBe('p2');
      expect(table[3]!.pts).toBe(0);
      expect(table[3]!.dg).toBe(-1);
      expect(table[3]!.rank).toBe(4);
    });
  });

  describe('getLeaguePodium (RF-55)', () => {
    it('derives champion, runnerUp, 3rd, and 4th from standings', () => {
      const mockStandings = [
        { playerId: 'p1' },
        { playerId: 'p2' },
        { playerId: 'p3' },
        { playerId: 'p4' },
      ] as any;

      const podium = getLeaguePodium(mockStandings);
      expect(podium).toEqual({
        champion: 'p1',
        runnerUp: 'p2',
        third: 'p3',
        fourth: 'p4',
      });
    });

    it('throws if fewer than 4 standings exist', () => {
      expect(() => getLeaguePodium([] as any)).toThrow(/Se requieren al menos 4/);
    });
  });
});

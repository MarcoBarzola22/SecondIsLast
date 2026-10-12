import { describe, expect, it } from 'vitest';
import {
  computeAnnualRanking,
  computePlayerAwards,
  getHeadToHeadBetween,
  getHeadToHeadKey,
  getSortedAnnualRanking,
  getTournamentPointsDistribution,
  updateHeadToHead,
} from '../awardsAndRankings';
import type {
  LeagueMatch,
  Player,
  Series,
  TournamentSummary,
} from '../types';

describe('awardsAndRankings domain module', () => {
  const dummyPlayers: Player[] = [
    { id: 'p1', firstName: 'Lionel', lastName: 'Messi', createdAt: '2026-01-01' },
    { id: 'p2', firstName: 'Cristiano', lastName: 'Ronaldo', createdAt: '2026-01-01' },
    { id: 'p3', firstName: 'Neymar', lastName: 'Junior', createdAt: '2026-01-01' },
    { id: 'p4', firstName: 'Kylian', lastName: 'Mbappe', createdAt: '2026-01-01' },
    { id: 'p5', firstName: 'Erling', lastName: 'Haaland', createdAt: '2026-01-01' },
    { id: 'p6', firstName: 'Luka', lastName: 'Modric', createdAt: '2026-01-01' },
    { id: 'p7', firstName: 'Kevin', lastName: 'De Bruyne', createdAt: '2026-01-01' },
    { id: 'p8', firstName: 'Vinicius', lastName: 'Junior', createdAt: '2026-01-01' },
  ];

  describe('Head-to-Head (RF-76)', () => {
    it('generates consistent canonical keys regardless of player ID order', () => {
      expect(getHeadToHeadKey('p1', 'p2')).toBe('p1_p2');
      expect(getHeadToHeadKey('p2', 'p1')).toBe('p1_p2');
      expect(getHeadToHeadKey('abc', 'xyz')).toBe('abc_xyz');
      expect(getHeadToHeadKey('xyz', 'abc')).toBe('abc_xyz');
    });

    it('updates H2H stats from league matches and preserves immutability', () => {
      const matches: LeagueMatch[] = [
        {
          id: 'm1',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 3,
          scoreB: 1,
          confirmed: true,
        },
        {
          id: 'm2',
          round: 2,
          playerA: 'p2',
          playerB: 'p1',
          scoreA: 2,
          scoreB: 2,
          confirmed: true,
        },
        {
          id: 'm3',
          round: 3,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 0,
          scoreB: 1,
          confirmed: true,
        },
      ];

      const initialH2H = {};
      const updated = updateHeadToHead(initialH2H, matches);

      expect(initialH2H).toEqual({});
      const rec = updated['p1_p2'];
      expect(rec).toBeDefined();
      expect(rec.playerA).toBe('p1');
      expect(rec.playerB).toBe('p2');
      expect(rec.played).toBe(3);
      expect(rec.winsA).toBe(1); // m1: p1 won 3-1
      expect(rec.draws).toBe(1); // m2: 2-2
      expect(rec.winsB).toBe(1); // m3: p2 won 1-0
      expect(rec.goalsA).toBe(5); // 3 + 2 + 0
      expect(rec.goalsB).toBe(4); // 1 + 2 + 1
    });

    it('ignores unconfirmed or incomplete matches', () => {
      const matches: LeagueMatch[] = [
        {
          id: 'm1',
          round: 1,
          playerA: 'p1',
          playerB: 'p3',
          scoreA: 2,
          scoreB: 0,
          confirmed: true,
        },
        {
          id: 'm2',
          round: 2,
          playerA: 'p1',
          playerB: 'p3',
          scoreA: 5,
          scoreB: 1,
          confirmed: false, // Unconfirmed
        },
        {
          id: 'm3',
          round: 3,
          playerA: 'p1',
          playerB: 'p3',
          scoreA: null,
          scoreB: null,
          confirmed: true,
        },
      ];

      const h2h = updateHeadToHead(null, matches);
      const rec = h2h['p1_p3'];
      expect(rec.played).toBe(1);
      expect(rec.winsA).toBe(1);
      expect(rec.goalsA).toBe(2);
      expect(rec.goalsB).toBe(0);
    });

    it('processes Series with two legs properly into H2H', () => {
      const seriesList: Series[] = [
        {
          id: 'S1',
          round: 'quarterfinal',
          playerA: 'p1',
          playerB: 'p2',
          leg1: { a: 2, b: 0 },
          leg2: { a: 1, b: 2 },
          confirmed: true,
          penaltyWinner: null,
          winnerTo: null,
          loserTo: null,
        },
      ];

      const h2h = updateHeadToHead(null, seriesList);
      const rec = h2h['p1_p2'];
      expect(rec.played).toBe(2); // 2 legs
      expect(rec.winsA).toBe(1); // leg1: 2-0
      expect(rec.winsB).toBe(1); // leg2: 1-2
      expect(rec.goalsA).toBe(3);
      expect(rec.goalsB).toBe(2);
    });

    it('retrieves H2H query regardless of player argument ordering', () => {
      const h2h = updateHeadToHead(null, [
        {
          id: 'm1',
          round: 1,
          playerA: 'p1',
          playerB: 'p4',
          scoreA: 4,
          scoreB: 1,
          confirmed: true,
        },
      ]);

      const q1 = getHeadToHeadBetween(h2h, 'p1', 'p4');
      const q2 = getHeadToHeadBetween(h2h, 'p4', 'p1');

      expect(q1).toEqual(q2);
      expect(q1?.played).toBe(1);
      expect(getHeadToHeadBetween(h2h, 'p1', 'p1')).toBeNull();
      expect(getHeadToHeadBetween(h2h, 'p1', 'p99')).toBeNull();
    });
  });

  describe('Annual Rankings Scaling (RF-78)', () => {
    it('scales points by N / 4 correctly for 4 participants (multiplier 1.0)', () => {
      const history: TournamentSummary[] = [
        {
          id: 't-4p',
          finishedAt: '2026-03-15T18:00:00Z',
          theme: 'Champions',
          participants: [
            { playerId: 'p1', team: 'Real Madrid' },
            { playerId: 'p2', team: 'Barcelona' },
            { playerId: 'p3', team: 'PSG' },
            { playerId: 'p4', team: 'Bayern' },
          ],
          podium: {
            champion: 'p1',
            runnerUp: 'p2',
            third: 'p3',
            fourth: 'p4',
          },
        },
      ];

      const ranking = computeAnnualRanking(history, 2026);

      // Multiplier = 4 / 4 = 1
      expect(ranking['p1'].pts).toBe(10);
      expect(ranking['p1'].championships).toBe(1);
      expect(ranking['p2'].pts).toBe(7);
      expect(ranking['p2'].runnerUps).toBe(1);
      expect(ranking['p3'].pts).toBe(5);
      expect(ranking['p4'].pts).toBe(3);
    });

    it('scales points by N / 4 correctly for 6 participants (multiplier 1.5) and awards +1 to remaining participants', () => {
      const history: TournamentSummary[] = [
        {
          id: 't-6p',
          finishedAt: '2026-04-20T18:00:00Z',
          theme: 'Mundial',
          participants: [
            { playerId: 'p1', team: 'Argentina' },
            { playerId: 'p2', team: 'Francia' },
            { playerId: 'p3', team: 'Brasil' },
            { playerId: 'p4', team: 'Inglaterra' },
            { playerId: 'p5', team: 'Alemania' },
            { playerId: 'p6', team: 'Espana' },
          ],
          podium: {
            champion: 'p1',
            runnerUp: 'p2',
            third: 'p3',
            fourth: 'p4',
          },
        },
      ];

      const ranking = computeAnnualRanking(history, 2026);

      // Multiplier = 6 / 4 = 1.5, Math.round strictly integer (RF-85)
      expect(ranking['p1'].pts).toBe(15); // 10 * 1.5
      expect(ranking['p1'].podiums).toBe(1);
      expect(ranking['p2'].pts).toBe(11); // Math.round(7 * 1.5 = 10.5) = 11
      expect(ranking['p2'].podiums).toBe(1);
      expect(ranking['p3'].pts).toBe(8);  // Math.round(5 * 1.5 = 7.5) = 8
      expect(ranking['p3'].podiums).toBe(1);
      expect(ranking['p4'].pts).toBe(5);  // Math.round(3 * 1.5 = 4.5) = 5
      expect(ranking['p4'].podiums).toBe(0);
      // Non-podium participants receive +1 point
      expect(ranking['p5'].pts).toBe(1);
      expect(ranking['p5'].podiums).toBe(0);
      expect(ranking['p6'].pts).toBe(1);
      expect(ranking['p6'].podiums).toBe(0);
    });

    it('scales points by N / 4 correctly for 8 participants (multiplier 2.0)', () => {
      const history: TournamentSummary[] = [
        {
          id: 't-8p',
          finishedAt: '2026-05-10T18:00:00Z',
          theme: 'Libertadores',
          participants: [
            { playerId: 'p1', team: 'Boca' },
            { playerId: 'p2', team: 'River' },
            { playerId: 'p3', team: 'Palmeiras' },
            { playerId: 'p4', team: 'Flamengo' },
            { playerId: 'p5', team: 'Gremio' },
            { playerId: 'p6', team: 'Santos' },
            { playerId: 'p7', team: 'Nacional' },
            { playerId: 'p8', team: 'Penarol' },
          ],
          podium: {
            champion: 'p1',
            runnerUp: 'p2',
            third: 'p3',
            fourth: 'p4',
          },
        },
      ];

      const ranking = computeAnnualRanking(history, 2026);

      // Multiplier = 8 / 4 = 2.0
      expect(ranking['p1'].pts).toBe(20);
      expect(ranking['p2'].pts).toBe(14);
      expect(ranking['p3'].pts).toBe(10);
      expect(ranking['p4'].pts).toBe(6);
      expect(ranking['p5'].pts).toBe(1);
      expect(ranking['p6'].pts).toBe(1);
      expect(ranking['p7'].pts).toBe(1);
      expect(ranking['p8'].pts).toBe(1);
    });

    it('filters strictly by calendar year', () => {
      const history: TournamentSummary[] = [
        {
          id: 't-2025',
          finishedAt: '2025-11-20T18:00:00Z',
          theme: '2025 Tourney',
          participants: [
            { playerId: 'p1', team: 'A' },
            { playerId: 'p2', team: 'B' },
            { playerId: 'p3', team: 'C' },
            { playerId: 'p4', team: 'D' },
          ],
          podium: { champion: 'p1', runnerUp: 'p2', third: 'p3', fourth: 'p4' },
        },
        {
          id: 't-2026',
          finishedAt: '2026-02-15T18:00:00Z',
          theme: '2026 Tourney',
          participants: [
            { playerId: 'p1', team: 'A' },
            { playerId: 'p2', team: 'B' },
            { playerId: 'p3', team: 'C' },
            { playerId: 'p4', team: 'D' },
          ],
          podium: { champion: 'p2', runnerUp: 'p1', third: 'p3', fourth: 'p4' },
        },
      ];

      const rank2026 = computeAnnualRanking(history, 2026);
      expect(rank2026['p1'].pts).toBe(7); // Runner-up in 2026
      expect(rank2026['p2'].pts).toBe(10); // Champion in 2026

      const rank2025 = computeAnnualRanking(history, 2025);
      expect(rank2025['p1'].pts).toBe(10); // Champion in 2025
      expect(rank2025['p2'].pts).toBe(7);
    });

    it('sorts annual ranking entries correctly and breaks ties', () => {
      const rankings = {
        p1: { playerId: 'p1', pts: 15, tournamentsPlayed: 1, championships: 1, runnerUps: 0 },
        p2: { playerId: 'p2', pts: 20, tournamentsPlayed: 2, championships: 1, runnerUps: 1 },
        p3: { playerId: 'p3', pts: 15, tournamentsPlayed: 2, championships: 0, runnerUps: 1 },
      };

      const sorted = getSortedAnnualRanking(rankings, dummyPlayers);
      expect(sorted[0].playerId).toBe('p2'); // 20 pts -> Rank 1
      expect(sorted[0].rank).toBe(1);
      expect(sorted[1].playerId).toBe('p1'); // 15 pts, 1 championship -> Rank 2
      expect(sorted[1].rank).toBe(2);
      expect(sorted[2].playerId).toBe('p3'); // 15 pts, 0 championships -> Rank 3
      expect(sorted[2].rank).toBe(3);
    });
  });

  describe('Player Awards and Distinctions (RF-77)', () => {
    it('computes Golden Boot (Bota de Oro), Wooden Spoon (Madera) and Clean Sheet (Valla Invicta)', () => {
      const matches: LeagueMatch[] = [
        // Match 1: p1 beats p2 4-0 (p1 has 4 goals & clean sheet; p2 has 1 loss & 0-4 DG)
        { id: '1', round: 1, playerA: 'p1', playerB: 'p2', scoreA: 4, scoreB: 0, confirmed: true },
        // Match 2: p3 beats p2 3-0 (p3 has 3 goals & clean sheet; p2 has 2 losses & 0-7 DG)
        { id: '2', round: 1, playerA: 'p3', playerB: 'p2', scoreA: 3, scoreB: 0, confirmed: true },
        // Match 3: p1 beats p4 2-1 (p1 reaches 6 goals, conceded 1)
        { id: '3', round: 2, playerA: 'p1', playerB: 'p4', scoreA: 2, scoreB: 1, confirmed: true },
        // Match 4: p4 beats p2 1-0 (p4 has clean sheet; p2 reaches 3 losses)
        { id: '4', round: 2, playerA: 'p4', playerB: 'p2', scoreA: 1, scoreB: 0, confirmed: true },
      ];

      const awards = computePlayerAwards(dummyPlayers, matches);

      // Bota de Oro: p1 with 6 goals (4 + 2)
      expect(awards.goldenBoot).toEqual({
        playerId: 'p1',
        goals: 6,
      });

      // Premio de Madera: p2 with 3 losses
      expect(awards.woodenSpoon).toEqual({
        playerId: 'p2',
        losses: 3,
      });

      // Valla Invicta: p1, p3, p4 each have 1 clean sheet, but p3 conceded 0 goals total!
      expect(awards.cleanSheet).toBeDefined();
      expect(awards.cleanSheet?.cleanSheets).toBe(1);
      // p3 conceded 0 goals, so p3 wins the tiebreaker over p1 (conceded 1) and p4 (conceded 2)
      expect(awards.cleanSheet?.playerId).toBe('p3');
    });

    it('returns null awards when no matches are provided or played', () => {
      const awards = computePlayerAwards(dummyPlayers, []);
      expect(awards.goldenBoot).toBeNull();
      expect(awards.woodenSpoon).toBeNull();
      expect(awards.cleanSheet).toBeNull();
    });
  });

  describe('Tournament Points Distribution (RF-84)', () => {
    it('calculates exact points distribution for 4 participants', () => {
      const dist = getTournamentPointsDistribution(4);
      expect(dist.participantCount).toBe(4);
      expect(dist.multiplier).toBe(1);
      expect(dist.champion).toBe(10);
      expect(dist.runnerUp).toBe(7);
      expect(dist.third).toBe(5);
      expect(dist.fourth).toBe(3);
      expect(dist.participation).toBe(1);
    });

    it('calculates exact points distribution for 8 participants', () => {
      const dist = getTournamentPointsDistribution(8);
      expect(dist.participantCount).toBe(8);
      expect(dist.multiplier).toBe(2);
      expect(dist.champion).toBe(20);
      expect(dist.runnerUp).toBe(14);
      expect(dist.third).toBe(10);
      expect(dist.fourth).toBe(6);
      expect(dist.participation).toBe(1);
    });

    it('calculates scaled points distribution for 6 participants', () => {
      const dist = getTournamentPointsDistribution(6);
      expect(dist.participantCount).toBe(6);
      expect(dist.multiplier).toBe(1.5);
      expect(dist.champion).toBe(15);
      expect(dist.runnerUp).toBe(11); // Math.round(7 * 1.5) = 11
      expect(dist.third).toBe(8);     // Math.round(5 * 1.5) = 8
      expect(dist.fourth).toBe(5);    // Math.round(3 * 1.5) = 5
      expect(dist.participation).toBe(1);
    });

    it('calculates scaled points distribution for 9 and 10 participants', () => {
      const dist9 = getTournamentPointsDistribution(9);
      expect(dist9.multiplier).toBe(2.25);
      expect(dist9.champion).toBe(23); // Math.round(10 * 2.25) = 23
      expect(dist9.runnerUp).toBe(16); // Math.round(7 * 2.25) = 16

      const dist10 = getTournamentPointsDistribution(10);
      expect(dist10.multiplier).toBe(2.5);
      expect(dist10.champion).toBe(25);
      expect(dist10.runnerUp).toBe(18); // Math.round(7 * 2.5) = 18
      expect(dist10.third).toBe(13);    // Math.round(5 * 2.5) = 13
      expect(dist10.fourth).toBe(8);    // Math.round(3 * 2.5) = 8
    });

    it('handles 0 or edge cases safely', () => {
      const dist = getTournamentPointsDistribution(0);
      expect(dist.participantCount).toBe(0);
      expect(dist.multiplier).toBe(0);
      expect(dist.champion).toBe(0);
      expect(dist.participation).toBe(0);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { generateBracket } from '../bracket';
import { computeLeagueTable, generateLeagueFixture } from '../league';
import type { ActiveTournament, Player, Series } from '../types';
import {
  applyWalkoverToLeagueMatches,
  applyWalkoverToSeries,
  applyWalkoverToTournament,
  isMatchLockedByWalkover,
  isPlayerWalkover,
} from '../walkover';

const samplePlayers: Player[] = [
  { id: 'p1', firstName: 'Juan', lastName: 'Pérez', createdAt: '2026-01-01' },
  { id: 'p2', firstName: 'Carlos', lastName: 'Gómez', createdAt: '2026-01-01' },
  { id: 'p3', firstName: 'Martín', lastName: 'Díaz', createdAt: '2026-01-01' },
  { id: 'p4', firstName: 'Lucas', lastName: 'Silva', createdAt: '2026-01-01' },
  { id: 'p5', firstName: 'Diego', lastName: 'Torres', createdAt: '2026-01-01' },
  { id: 'p6', firstName: 'Marcos', lastName: 'Ríos', createdAt: '2026-01-01' },
];

const sampleTeams: Record<string, string> = {
  p1: 'Boca',
  p2: 'River',
  p3: 'Racing',
  p4: 'Independiente',
  p5: 'San Lorenzo',
  p6: 'Vélez',
};

describe('walkover domain logic (RF-64, RF-65, RF-66)', () => {
  describe('applyWalkoverToTournament validations', () => {
    it('throws when the player is not part of the tournament', () => {
      const tournament: ActiveTournament = {
        id: 't1',
        createdAt: '2026-01-01',
        phase: 'league',
        tournamentType: 'league',
        matchFormat: 'single_match',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        theme: 'Clubes',
        draftOrder: ['p1', 'p2', 'p3', 'p4'],
        teams: sampleTeams,
        byes: [],
        series: [],
        leagueMatches: [],
      };

      expect(() => applyWalkoverToTournament(tournament, 'p99')).toThrow(
        'El jugador no es participante de este torneo.'
      );
    });

    it('throws when the player has already abandoned the tournament', () => {
      const tournament: ActiveTournament = {
        id: 't1',
        createdAt: '2026-01-01',
        phase: 'league',
        tournamentType: 'league',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        theme: 'Clubes',
        draftOrder: ['p1', 'p2', 'p3', 'p4'],
        teams: sampleTeams,
        byes: [],
        series: [],
        walkoverPlayerIds: ['p1'],
      };

      expect(() => applyWalkoverToTournament(tournament, 'p1')).toThrow(
        'El jugador ya abandonó el torneo.'
      );
    });

    it('throws if called before matches have started (in theme or draft phase)', () => {
      const draftTournament: ActiveTournament = {
        id: 't1',
        createdAt: '2026-01-01',
        phase: 'draft',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        theme: 'Clubes',
        draftOrder: ['p1', 'p2', 'p3', 'p4'],
        teams: {},
        byes: [],
        series: [],
      };

      expect(() => applyWalkoverToTournament(draftTournament, 'p1')).toThrow(
        'No se puede declarar abandono antes de iniciar la competencia.'
      );
    });
  });

  describe('League matches walkover (RF-65)', () => {
    it('overwrites all unplayed and played matches of the desertor with 0-3 against', () => {
      const participantIds = ['p1', 'p2', 'p3', 'p4'];
      const rawMatches = generateLeagueFixture(participantIds, 'single_match', () => 0.5);

      // Simulate match 1 already played with p1 winning 5-1 against p2
      const matches = rawMatches.map((m) => {
        if (
          (m.playerA === 'p1' && m.playerB === 'p2') ||
          (m.playerA === 'p2' && m.playerB === 'p1')
        ) {
          return {
            ...m,
            scoreA: m.playerA === 'p1' ? 5 : 1,
            scoreB: m.playerB === 'p1' ? 5 : 1,
            confirmed: true,
            cardsA: { yellow: 1, red: 0 },
            cardsB: { yellow: 2, red: 1 },
          };
        }
        return m;
      });

      const updated = applyWalkoverToLeagueMatches(matches, 'p1');

      // Every match involving p1 must be 0-3 against p1
      for (const m of updated) {
        if (m.playerA === 'p1') {
          expect(m.scoreA).toBe(0);
          expect(m.scoreB).toBe(3);
          expect(m.confirmed).toBe(true);
          expect(m.cardsA).toEqual({ yellow: 0, red: 0 });
          expect(m.cardsB).toEqual({ yellow: 0, red: 0 });
        } else if (m.playerB === 'p1') {
          expect(m.scoreA).toBe(3);
          expect(m.scoreB).toBe(0);
          expect(m.confirmed).toBe(true);
          expect(m.cardsA).toEqual({ yellow: 0, red: 0 });
          expect(m.cardsB).toEqual({ yellow: 0, red: 0 });
        }
      }

      // Matches not involving p1 should remain unconfirmed and unchanged
      const unaffected = updated.filter(
        (m) => m.playerA !== 'p1' && m.playerB !== 'p1'
      );
      expect(unaffected.length).toBeGreaterThan(0);
      for (const m of unaffected) {
        expect(m.scoreA).toBeNull();
        expect(m.scoreB).toBeNull();
        expect(m.confirmed).toBe(false);
      }
    });

    it('correctly recalculates the live standings table when a player abandons (RF-65)', () => {
      const participantIds = ['p1', 'p2', 'p3', 'p4'];
      const rawMatches = generateLeagueFixture(participantIds, 'single_match', () => 0.5);

      const tournament: ActiveTournament = {
        id: 't-league',
        createdAt: '2026-01-01',
        phase: 'league',
        tournamentType: 'league',
        matchFormat: 'single_match',
        participantIds,
        theme: 'Clubes',
        draftOrder: participantIds,
        teams: sampleTeams,
        byes: [],
        series: [],
        leagueMatches: rawMatches,
      };

      const updatedTournament = applyWalkoverToTournament(tournament, 'p1');

      expect(updatedTournament.walkoverPlayerIds).toEqual(['p1']);

      // Compute table
      const standings = computeLeagueTable(
        updatedTournament.leagueMatches!,
        participantIds,
        sampleTeams,
        samplePlayers
      );

      // p1 played 3 matches (against p2, p3, p4), all 0-3 defeats
      const p1Row = standings.find((r) => r.playerId === 'p1')!;
      expect(p1Row.pj).toBe(3);
      expect(p1Row.pg).toBe(0);
      expect(p1Row.pe).toBe(0);
      expect(p1Row.pp).toBe(3);
      expect(p1Row.pts).toBe(0);
      expect(p1Row.gf).toBe(0);
      expect(p1Row.gc).toBe(9);
      expect(p1Row.dg).toBe(-9);

      // Each rival received 1 match with 3-0 win against p1 (+3 pts, +3 GF, 0 GC, +3 DG)
      for (const rivalId of ['p2', 'p3', 'p4']) {
        const rivalRow = standings.find((r) => r.playerId === rivalId)!;
        expect(rivalRow.pts).toBe(3);
        expect(rivalRow.pj).toBe(1);
        expect(rivalRow.pg).toBe(1);
        expect(rivalRow.gf).toBe(3);
        expect(rivalRow.gc).toBe(0);
        expect(rivalRow.dg).toBe(3);
      }
    });

    it('assigns 0-0 when two players abandon sequentially and play each other', () => {
      const participantIds = ['p1', 'p2', 'p3', 'p4'];
      const rawMatches = generateLeagueFixture(participantIds, 'single_match', () => 0.5);

      const tournament: ActiveTournament = {
        id: 't-league-multi',
        createdAt: '2026-01-01',
        phase: 'league',
        tournamentType: 'league',
        participantIds,
        theme: 'Clubes',
        draftOrder: participantIds,
        teams: sampleTeams,
        byes: [],
        series: [],
        leagueMatches: rawMatches,
      };

      // p1 abandons
      const afterP1 = applyWalkoverToTournament(tournament, 'p1');
      // p2 abandons
      const afterP2 = applyWalkoverToTournament(afterP1, 'p2');

      const matchBetweenDesertors = afterP2.leagueMatches!.find(
        (m) =>
          (m.playerA === 'p1' && m.playerB === 'p2') ||
          (m.playerA === 'p2' && m.playerB === 'p1')
      )!;

      expect(matchBetweenDesertors.scoreA).toBe(0);
      expect(matchBetweenDesertors.scoreB).toBe(0);
      expect(matchBetweenDesertors.confirmed).toBe(true);
    });
  });

  describe('Knockout Bracket walkover (RF-65)', () => {
    function createStandard4PlayerSeries(): Series[] {
      return [
        {
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
          winner: null,
          loser: null,
        },
        {
          id: 'SF2',
          round: 'semifinal',
          playerA: 'p3',
          playerB: 'p4',
          leg1: { a: null, b: null },
          leg2: { a: null, b: null },
          penaltyWinner: null,
          confirmed: false,
          winnerTo: { seriesId: 'F', side: 'b' },
          loserTo: { seriesId: 'TP', side: 'b' },
          winner: null,
          loser: null,
        },
        {
          id: 'F',
          round: 'final',
          playerA: null,
          playerB: null,
          leg1: { a: null, b: null },
          leg2: { a: null, b: null },
          penaltyWinner: null,
          confirmed: false,
          winnerTo: null,
          loserTo: null,
          winner: null,
          loser: null,
        },
        {
          id: 'TP',
          round: 'third_place',
          playerA: null,
          playerB: null,
          leg1: { a: null, b: null },
          leg2: { a: null, b: null },
          penaltyWinner: null,
          confirmed: false,
          winnerTo: null,
          loserTo: null,
          winner: null,
          loser: null,
        },
      ];
    }

    it('directly updates series array via applyWalkoverToSeries', () => {
      const series = createStandard4PlayerSeries();
      const updated = applyWalkoverToSeries(series, 'p1', 'two_legged');
      const sf1 = updated.find((s) => s.id === 'SF1')!;
      expect(sf1.confirmed).toBe(true);
      expect(sf1.winner).toBe('p2');
      expect(sf1.loser).toBe('p1');
    });

    it('advances rival automatically with 3-0 in both legs in two_legged bracket', () => {
      const participantIds = ['p1', 'p2', 'p3', 'p4'];
      const series = createStandard4PlayerSeries();

      const tournament: ActiveTournament = {
        id: 't-bracket',
        createdAt: '2026-01-01',
        phase: 'bracket',
        tournamentType: 'bracket',
        matchFormat: 'two_legged',
        participantIds,
        theme: 'Clubes',
        draftOrder: participantIds,
        teams: sampleTeams,
        byes: [],
        series,
      };

      // p1 is in SF1 against p2
      const updated = applyWalkoverToTournament(tournament, 'p1');

      const sf1 = updated.series.find((s) => s.id === 'SF1')!;
      expect(sf1.confirmed).toBe(true);
      expect(sf1.winner).toBe('p2');
      expect(sf1.loser).toBe('p1');
      // In two_legged, both legs are 0-3 against p1
      expect(sf1.leg1.a).toBe(0);
      expect(sf1.leg1.b).toBe(3);
      expect(sf1.leg2.a).toBe(0);
      expect(sf1.leg2.b).toBe(3);

      // p2 advanced to Final (F)
      const finalSeries = updated.series.find((s) => s.id === 'F')!;
      expect(finalSeries.playerA).toBe('p2');

      // p1 was sent to Third Place (TP)
      const tpSeries = updated.series.find((s) => s.id === 'TP')!;
      expect(tpSeries.playerA).toBe('p1');
    });

    it('advances rival automatically with 3-0 in single_match format', () => {
      const participantIds = ['p1', 'p2', 'p3', 'p4'];
      const series = createStandard4PlayerSeries();

      const tournament: ActiveTournament = {
        id: 't-bracket-single',
        createdAt: '2026-01-01',
        phase: 'bracket',
        tournamentType: 'bracket',
        matchFormat: 'single_match',
        participantIds,
        theme: 'Clubes',
        draftOrder: participantIds,
        teams: sampleTeams,
        byes: [],
        series,
      };

      const updated = applyWalkoverToTournament(tournament, 'p1');
      const sf1 = updated.series.find((s) => s.id === 'SF1')!;
      expect(sf1.confirmed).toBe(true);
      expect(sf1.winner).toBe('p2');
      expect(sf1.loser).toBe('p1');
      expect(sf1.leg1.a).toBe(0);
      expect(sf1.leg1.b).toBe(3);
    });

    it('settles Third Place automatically if the rival is already known when desertor arrives', () => {
      const participantIds = ['p1', 'p2', 'p3', 'p4'];
      const bracketSeries = createStandard4PlayerSeries();

      // SF2 was already played: p3 beat p4 (p4 sent to TP as playerB)
      const seriesWithSF2Done = bracketSeries.map((s) => {
        if (s.id === 'SF2') {
          return {
            ...s,
            confirmed: true,
            winner: 'p3',
            loser: 'p4',
            leg1: { a: 2, b: 0 },
            leg2: { a: 1, b: 0 },
          };
        }
        if (s.id === 'F') {
          return { ...s, playerB: 'p3' };
        }
        if (s.id === 'TP') {
          return { ...s, playerB: 'p4' };
        }
        return s;
      });

      const tournament: ActiveTournament = {
        id: 't-bracket-cascade',
        createdAt: '2026-01-01',
        phase: 'bracket',
        tournamentType: 'bracket',
        matchFormat: 'two_legged',
        participantIds,
        theme: 'Clubes',
        draftOrder: participantIds,
        teams: sampleTeams,
        byes: [],
        series: seriesWithSF2Done,
      };

      // p1 abandons in SF1
      const updated = applyWalkoverToTournament(tournament, 'p1');

      // SF1: p2 wins by walkover and advances to F
      const sf1 = updated.series.find((s) => s.id === 'SF1')!;
      expect(sf1.confirmed).toBe(true);
      expect(sf1.winner).toBe('p2');

      // Final: p2 vs p3
      const f = updated.series.find((s) => s.id === 'F')!;
      expect(f.playerA).toBe('p2');
      expect(f.playerB).toBe('p3');

      // TP: p1 sent to TP against p4, so TP is ALSO automatically settled 3-0 for p4!
      const tp = updated.series.find((s) => s.id === 'TP')!;
      expect(tp.confirmed).toBe(true);
      expect(tp.winner).toBe('p4');
      expect(tp.loser).toBe('p1');
      expect(tp.leg1.a).toBe(0);
      expect(tp.leg1.b).toBe(3);
    });

    it('settles current round directly without reopening previous rounds if desertor already advanced (RF-65)', () => {
      const participantIds = ['p1', 'p2', 'p3', 'p4'];
      const bracketSeries = createStandard4PlayerSeries();

      // Both SFs completed: p1 won SF1 (2-0, 1-0) against p2.
      // p3 won SF2 against p4.
      // Final is p1 vs p3. TP is p2 vs p4.
      const seriesReadyForFinal = bracketSeries.map((s) => {
        if (s.id === 'SF1') {
          return {
            ...s,
            confirmed: true,
            winner: 'p1',
            loser: 'p2',
            leg1: { a: 2, b: 0 },
            leg2: { a: 1, b: 0 },
          };
        }
        if (s.id === 'SF2') {
          return {
            ...s,
            confirmed: true,
            winner: 'p3',
            loser: 'p4',
            leg1: { a: 1, b: 0 },
            leg2: { a: 0, b: 0 },
          };
        }
        if (s.id === 'F') {
          return { ...s, playerA: 'p1', playerB: 'p3' };
        }
        if (s.id === 'TP') {
          return { ...s, playerA: 'p2', playerB: 'p4' };
        }
        return s;
      });

      const tournament: ActiveTournament = {
        id: 't-final-walkover',
        createdAt: '2026-01-01',
        phase: 'bracket',
        tournamentType: 'bracket',
        matchFormat: 'two_legged',
        participantIds,
        theme: 'Clubes',
        draftOrder: participantIds,
        teams: sampleTeams,
        byes: [],
        series: seriesReadyForFinal,
      };

      // p1 abandons while in the Final
      const updated = applyWalkoverToTournament(tournament, 'p1');

      // SF1 remains confirmed with p1 as historical winner (p2 stays in Third Place)
      const sf1 = updated.series.find((s) => s.id === 'SF1')!;
      expect(sf1.winner).toBe('p1');
      expect(sf1.leg1.a).toBe(2);

      // Final is won directly by p3 (ronda actual)
      const finalSeries = updated.series.find((s) => s.id === 'F')!;
      expect(finalSeries.confirmed).toBe(true);
      expect(finalSeries.winner).toBe('p3');
      expect(finalSeries.loser).toBe('p1');
      expect(finalSeries.leg1.a).toBe(0);
      expect(finalSeries.leg1.b).toBe(3);
      expect(finalSeries.leg2.a).toBe(0);
      expect(finalSeries.leg2.b).toBe(3);
    });

    it('advances rival to Semifinals when desertor is in Quarterfinals (6-player bracket)', () => {
      const participantIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
      const bracket = generateBracket(participantIds);

      const tournament: ActiveTournament = {
        id: 't-6p-bracket',
        createdAt: '2026-01-01',
        phase: 'bracket',
        tournamentType: 'bracket',
        matchFormat: 'two_legged',
        participantIds,
        theme: 'Clubes',
        draftOrder: participantIds,
        teams: sampleTeams,
        byes: bracket.byes,
        series: bracket.series,
      };

      // Find a QF series and its players
      const qf = bracket.series.find((s) => s.round === 'quarterfinal')!;
      const desertor = qf.playerA!;
      const rivalId = qf.playerB!;

      const updated = applyWalkoverToTournament(tournament, desertor);

      const updatedQf = updated.series.find((s) => s.id === qf.id)!;
      expect(updatedQf.confirmed).toBe(true);
      expect(updatedQf.winner).toBe(rivalId);
      expect(updatedQf.loser).toBe(desertor);

      // Rival must have advanced to the corresponding Semifinal
      const targetSfId = qf.winnerTo!.seriesId;
      const sf = updated.series.find((s) => s.id === targetSfId)!;
      const slot = qf.winnerTo!.side === 'a' ? sf.playerA : sf.playerB;
      expect(slot).toBe(rivalId);
    });
  });

  describe('Walkover UI lock helpers (RF-66)', () => {
    it('isPlayerWalkover accurately identifies desertors', () => {
      const tournament: ActiveTournament = {
        id: 't-helpers',
        createdAt: '2026-01-01',
        phase: 'league',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        theme: 'Clubes',
        draftOrder: ['p1', 'p2', 'p3', 'p4'],
        teams: sampleTeams,
        byes: [],
        series: [],
        walkoverPlayerIds: ['p2'],
      };

      expect(isPlayerWalkover(tournament, 'p2')).toBe(true);
      expect(isPlayerWalkover(tournament, 'p1')).toBe(false);
    });

    it('isMatchLockedByWalkover returns true if any player in the match has abandoned', () => {
      const walkoverList = ['p1'];

      expect(
        isMatchLockedByWalkover(
          { playerA: 'p1', playerB: 'p2' },
          walkoverList
        )
      ).toBe(true);

      expect(
        isMatchLockedByWalkover(
          { playerA: 'p2', playerB: 'p1' },
          walkoverList
        )
      ).toBe(true);

      expect(
        isMatchLockedByWalkover(
          { playerA: 'p2', playerB: 'p3' },
          walkoverList
        )
      ).toBe(false);

      expect(
        isMatchLockedByWalkover(
          { playerA: null, playerB: 'p3' },
          walkoverList
        )
      ).toBe(false);
    });
  });
});

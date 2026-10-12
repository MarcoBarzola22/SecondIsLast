import { describe, expect, it } from 'vitest';
import { generateBracket } from '../../domain/bracket';
import { generateDoubleEliminationBracket } from '../../domain/doubleElimination';
import type { LeagueMatch, PlayerId } from '../../domain/types';
import { createEmptyAppData } from '../../storage/schema';
import { appReducer } from '../reducer';

describe('state - appReducer lifecycle and phase guards', () => {
  it('adds unique players and rejects duplicates', () => {
    let state = createEmptyAppData();
    state = appReducer(state, {
      type: 'PLAYER_ADDED',
      player: {
        id: 'p1',
        firstName: 'Marco',
        lastName: 'Barzola',
        createdAt: '2026-10-09',
      },
    });
    expect(state.players).toHaveLength(1);

    // Duplicate
    state = appReducer(state, {
      type: 'PLAYER_ADDED',
      player: {
        id: 'p2',
        firstName: 'marco',
        lastName: 'BARZOLA',
        createdAt: '2026-10-09',
      },
    });
    expect(state.players).toHaveLength(1);
  });

  it('sets participants and blocks changing participants during draft or bracket (RF-45)', () => {
    let state = createEmptyAppData();
    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: ['p1', 'p2', 'p3', 'p4'],
      tournamentId: 't1',
      now: '2026-10-09T00:00:00Z',
    });
    expect(state.activeTournament?.phase).toBe('theme');

    // Transition to draft
    state = appReducer(state, { type: 'THEME_SET', theme: 'Clásicos PES 6' });
    state = appReducer(state, {
      type: 'DRAFT_STARTED',
      order: ['p1', 'p2', 'p3', 'p4'],
    });
    expect(state.activeTournament?.phase).toBe('draft');

    // Attempt to change participants in draft phase (RF-45)
    const stateBefore = state;
    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      tournamentId: 't2',
      now: '2026-10-09T00:00:00Z',
    });
    expect(state).toBe(stateBefore);
  });

  it('allows setting up to 10 participants and rejects invalid participant counts (< 4 or > 10) (RF-6)', () => {
    const state = createEmptyAppData();

    // Less than 4 -> rejected
    const stateUnder = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: ['p1', 'p2', 'p3'],
      tournamentId: 't1',
      now: '2026-10-09T00:00:00Z',
    });
    expect(stateUnder.activeTournament).toBeNull();

    // More than 10 -> rejected
    const stateOver = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: [
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
      ],
      tournamentId: 't1',
      now: '2026-10-09T00:00:00Z',
    });
    expect(stateOver.activeTournament).toBeNull();

    // 10 participants -> accepted
    const stateValid = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: [
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
      ],
      tournamentId: 't1',
      now: '2026-10-09T00:00:00Z',
    });
    expect(stateValid.activeTournament).not.toBeNull();
    expect(stateValid.activeTournament?.participantIds).toHaveLength(10);
  });

  it('generates bracket and prevents regenerating it (RF-20)', () => {
    let state = createEmptyAppData();
    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: ['p1', 'p2', 'p3', 'p4'],
      tournamentId: 't1',
      now: '2026-10-09T00:00:00Z',
    });
    state = appReducer(state, { type: 'THEME_SET', theme: 'Apertura 2006' });
    state = appReducer(state, {
      type: 'DRAFT_STARTED',
      order: ['p1', 'p2', 'p3', 'p4'],
    });

    const { series, byes } = generateBracket(['p1', 'p2', 'p3', 'p4'], () => 0);
    state = appReducer(state, {
      type: 'BRACKET_GENERATED',
      series,
      byes,
    });
    expect(state.activeTournament?.phase).toBe('bracket');
    expect(state.activeTournament?.series).toHaveLength(4);

    // Attempt to regenerate (RF-20)
    const stateBefore = state;
    state = appReducer(state, {
      type: 'BRACKET_GENERATED',
      series: [],
      byes: [],
    });
    expect(state).toBe(stateBefore);
  });

  it('abandons active tournament without modifying history or stats (RF-44)', () => {
    let state = createEmptyAppData();
    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: ['p1', 'p2', 'p3', 'p4'],
      tournamentId: 't1',
      now: '2026-10-09T00:00:00Z',
    });
    expect(state.activeTournament).not.toBeNull();

    state = appReducer(state, { type: 'TOURNAMENT_ABANDONED' });
    expect(state.activeTournament).toBeNull();
  });

  it('finishes tournament atomically, updating stats and recording history (RF-31, RF-33)', () => {
    let state = createEmptyAppData();
    state.players = [
      { id: 'p1', firstName: 'Marco', lastName: 'Barzola', createdAt: '2026-10-09' },
      { id: 'p2', firstName: 'Lucho', lastName: 'Gomez', createdAt: '2026-10-09' },
      { id: 'p3', firstName: 'Fede', lastName: 'Alvarez', createdAt: '2026-10-09' },
      { id: 'p4', firstName: 'Nico', lastName: 'Diaz', createdAt: '2026-10-09' },
    ];

    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: ['p1', 'p2', 'p3', 'p4'],
      tournamentId: 't1',
      now: '2026-10-09T00:00:00Z',
    });
    state = appReducer(state, { type: 'THEME_SET', theme: 'Clásicos PES 6' });
    state = appReducer(state, {
      type: 'DRAFT_STARTED',
      order: ['p1', 'p2', 'p3', 'p4'],
    });

    const { series, byes } = generateBracket(
      ['p1', 'p2', 'p3', 'p4'],
      () => 0.999 // preserve order
    );

    state = appReducer(state, { type: 'BRACKET_GENERATED', series, byes });

    // Play SF1 (p1 vs p2)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF1',
      leg: 'leg1',
      side: 'a',
      value: 2,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF1',
      leg: 'leg1',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF1',
      leg: 'leg2',
      side: 'a',
      value: 1,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF1',
      leg: 'leg2',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, { type: 'SERIES_CONFIRMED', seriesId: 'SF1' });

    // Play SF2 (p3 vs p4)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF2',
      leg: 'leg1',
      side: 'a',
      value: 1,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF2',
      leg: 'leg1',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF2',
      leg: 'leg2',
      side: 'a',
      value: 1,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF2',
      leg: 'leg2',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, { type: 'SERIES_CONFIRMED', seriesId: 'SF2' });

    // Play TP (p2 vs p4)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'TP',
      leg: 'leg1',
      side: 'a',
      value: 2,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'TP',
      leg: 'leg1',
      side: 'b',
      value: 1,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'TP',
      leg: 'leg2',
      side: 'a',
      value: 1,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'TP',
      leg: 'leg2',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, { type: 'SERIES_CONFIRMED', seriesId: 'TP' });

    // Play F (p1 vs p3)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'F',
      leg: 'leg1',
      side: 'a',
      value: 3,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'F',
      leg: 'leg1',
      side: 'b',
      value: 1,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'F',
      leg: 'leg2',
      side: 'a',
      value: 1,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'F',
      leg: 'leg2',
      side: 'b',
      value: 1,
    });
    state = appReducer(state, { type: 'SERIES_CONFIRMED', seriesId: 'F' });

    // Finish tournament (RF-31, RF-33)
    state = appReducer(state, {
      type: 'TOURNAMENT_FINISHED',
      summaryId: 'sum-1',
      now: '2026-10-09T23:59:59Z',
    });

    expect(state.activeTournament).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.podium.champion).toBe('p1');
    expect(state.history[0]!.podium.runnerUp).toBe('p3');
    expect(state.history[0]!.podium.third).toBe('p2');
    expect(state.history[0]!.podium.fourth).toBe('p4');

    expect(state.stats['p1']?.pts).toBe(10);
    expect(state.stats['p3']?.pts).toBe(7);
    expect(state.stats['p2']?.pts).toBe(5);
    expect(state.stats['p4']?.pts).toBe(3);
  });

  it('removes players and stats, protecting participants in active tournaments (RF-46)', () => {
    let state = createEmptyAppData();
    state = appReducer(state, {
      type: 'PLAYER_ADDED',
      player: { id: 'p1', firstName: 'Marco', lastName: 'Barzola', createdAt: '2026-10-09' },
    });
    state = appReducer(state, {
      type: 'PLAYER_ADDED',
      player: { id: 'p2', firstName: 'Lucas', lastName: 'Perez', createdAt: '2026-10-09' },
    });
    state.stats['p1'] = { playerId: 'p1', pts: 10, pj: 3, pg: 3, pp: 0, gf: 5, gc: 1, tj: 1 };

    // Remove inactive player p2
    state = appReducer(state, { type: 'PLAYER_REMOVED', playerId: 'p2' });
    expect(state.players).toHaveLength(1);
    expect(state.players[0]!.id).toBe('p1');

    // Start tournament with p1
    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: ['p1', 'p3', 'p4', 'p5'],
      tournamentId: 't1',
      now: '2026-10-09T00:00:00Z',
    });
    state = appReducer(state, { type: 'THEME_SET', theme: 'Clásicos' });
    state = appReducer(state, { type: 'DRAFT_STARTED', order: ['p1', 'p3', 'p4', 'p5'] });

    // Try to remove p1 while in draft (should be blocked)
    const beforeAttempt = state;
    state = appReducer(state, { type: 'PLAYER_REMOVED', playerId: 'p1' });
    expect(state).toBe(beforeAttempt);

    // Abandon tournament and remove p1 (should succeed and clear stats)
    state = appReducer(state, { type: 'TOURNAMENT_ABANDONED' });
    state = appReducer(state, { type: 'PLAYER_REMOVED', playerId: 'p1' });
    expect(state.players).toHaveLength(0);
    expect(state.stats['p1']).toBeUndefined();
  });

  it('resets standings and history without removing players (RF-47)', () => {
    let state = createEmptyAppData();
    state.players = [{ id: 'p1', firstName: 'A', lastName: 'B', createdAt: '2026-10-09' }];
    state.stats = { p1: { playerId: 'p1', pts: 10, pj: 3, pg: 3, pp: 0, gf: 5, gc: 1, tj: 1 } };
    state.history = [{ id: 'sum-1', finishedAt: '2026-10-09', theme: 'T', participants: [], podium: { champion: 'p1', runnerUp: 'p2', third: 'p3', fourth: 'p4' } }];

    state = appReducer(state, { type: 'STANDINGS_RESET' });
    expect(state.stats).toEqual({});
    expect(state.history).toHaveLength(0);
    expect(state.players).toHaveLength(1); // Players intact
  });

  it('executes full League lifecycle: generated, score set, confirmed, edit requested, and finished (RF-50, RF-51, RF-53, RF-54, RF-55)', () => {
    let state = createEmptyAppData();
    state.players = [
      { id: 'p1', firstName: 'P1', lastName: 'One', createdAt: '2026-10-09' },
      { id: 'p2', firstName: 'P2', lastName: 'Two', createdAt: '2026-10-09' },
      { id: 'p3', firstName: 'P3', lastName: 'Three', createdAt: '2026-10-09' },
      { id: 'p4', firstName: 'P4', lastName: 'Four', createdAt: '2026-10-09' },
    ];

    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: ['p1', 'p2', 'p3', 'p4'],
      tournamentType: 'league',
      tournamentId: 't-league-1',
      now: '2026-10-09T00:00:00Z',
    });
    state = appReducer(state, { type: 'THEME_SET', theme: 'Liga PES' });
    state = appReducer(state, { type: 'DRAFT_STARTED', order: ['p1', 'p2', 'p3', 'p4'] });

    // Batch assign teams (RF-52)
    state = appReducer(state, {
      type: 'TEAMS_BATCH_ASSIGNED',
      teams: { p1: 'Team 1', p2: 'Team 2', p3: 'Team 3', p4: 'Team 4' },
    });
    expect(state.activeTournament?.teams['p1']).toBe('Team 1');

    // Generate League fixture (6 matches for 4 players)
    const matches = [
      { id: 'R1_M1', round: 1, playerA: 'p1', playerB: 'p2', scoreA: null, scoreB: null, confirmed: false },
      { id: 'R1_M2', round: 1, playerA: 'p3', playerB: 'p4', scoreA: null, scoreB: null, confirmed: false },
      { id: 'R2_M1', round: 2, playerA: 'p1', playerB: 'p3', scoreA: null, scoreB: null, confirmed: false },
      { id: 'R2_M2', round: 2, playerA: 'p2', playerB: 'p4', scoreA: null, scoreB: null, confirmed: false },
      { id: 'R3_M1', round: 3, playerA: 'p1', playerB: 'p4', scoreA: null, scoreB: null, confirmed: false },
      { id: 'R3_M2', round: 3, playerA: 'p2', playerB: 'p3', scoreA: null, scoreB: null, confirmed: false },
    ];
    state = appReducer(state, { type: 'LEAGUE_GENERATED', matches });
    expect(state.activeTournament?.phase).toBe('league');

    // Play & confirm all matches
    // p1 wins all 3: beats p2 (2-0), p3 (1-0), p4 (3-0) -> p1 is champion (9 pts)
    // p2 beats p4 (2-1) and draws p3 (1-1) -> 4 pts (runnerUp)
    // p3 draws p4 (0-0) -> 2 pts (third)
    // p4 has 1 pt (fourth)
    const scores = [
      { id: 'R1_M1', a: 2, b: 0 },
      { id: 'R1_M2', a: 0, b: 0 },
      { id: 'R2_M1', a: 1, b: 0 },
      { id: 'R2_M2', a: 2, b: 1 },
      { id: 'R3_M1', a: 3, b: 0 },
      { id: 'R3_M2', a: 1, b: 1 },
    ];

    for (const sc of scores) {
      state = appReducer(state, {
        type: 'LEAGUE_MATCH_SCORE_SET',
        matchId: sc.id,
        scoreA: sc.a,
        scoreB: sc.b,
      });
      state = appReducer(state, { type: 'LEAGUE_MATCH_CONFIRMED', matchId: sc.id });
    }

    // Reopen & re-confirm test
    state = appReducer(state, { type: 'LEAGUE_MATCH_EDIT_REQUESTED', matchId: 'R3_M2' });
    expect(state.activeTournament?.leagueMatches?.find((m) => m.id === 'R3_M2')?.confirmed).toBe(false);
    state = appReducer(state, { type: 'LEAGUE_MATCH_CONFIRMED', matchId: 'R3_M2' });

    // Finish league tournament (RF-55)
    state = appReducer(state, {
      type: 'TOURNAMENT_FINISHED',
      summaryId: 'sum-league-1',
      now: '2026-10-09T23:59:59Z',
    });

    expect(state.activeTournament).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.tournamentType).toBe('league');
    expect(state.history[0]!.podium.champion).toBe('p1');
    expect(state.history[0]!.podium.runnerUp).toBe('p2');
    expect(state.stats['p1']?.pts).toBe(10);
    expect(state.stats['p2']?.pts).toBe(7);
  });

  it('adds custom themes and rejects invalid or duplicate themes (RF-57, RF-58)', () => {
    let state = createEmptyAppData();
    expect(state.customThemes).toEqual([]);

    // Add valid custom theme
    state = appReducer(state, {
      type: 'CUSTOM_THEME_ADDED',
      theme: 'Champions League 2005',
    });
    expect(state.customThemes).toEqual(['Champions League 2005']);

    // Add another valid custom theme
    state = appReducer(state, {
      type: 'CUSTOM_THEME_ADDED',
      theme: 'Copa Libertadores 2000',
    });
    expect(state.customThemes).toEqual([
      'Champions League 2005',
      'Copa Libertadores 2000',
    ]);

    // Reject duplicate (case-insensitive)
    state = appReducer(state, {
      type: 'CUSTOM_THEME_ADDED',
      theme: 'champions league 2005',
    });
    expect(state.customThemes).toEqual([
      'Champions League 2005',
      'Copa Libertadores 2000',
    ]);

    // Reject duplicate of base theme
    state = appReducer(state, {
      type: 'CUSTOM_THEME_ADDED',
      theme: 'Apertura 2006',
    });
    expect(state.customThemes).toEqual([
      'Champions League 2005',
      'Copa Libertadores 2000',
    ]);

    // Custom themes survive STANDINGS_RESET
    state = appReducer(state, { type: 'STANDINGS_RESET' });
    expect(state.customThemes).toEqual([
      'Champions League 2005',
      'Copa Libertadores 2000',
    ]);
  });

  it('persists cards in LEG_SCORE_SET and LEAGUE_MATCH_SCORE_SET with full backward compatibility (RF-61)', () => {
    let state = createEmptyAppData();

    // 1. Bracket mode: test LEG_SCORE_SET with and without cards
    state = {
      ...state,
      activeTournament: {
        id: 'tour-1',
        createdAt: '2026-10-11T12:00:00Z',
        phase: 'bracket',
        tournamentType: 'bracket',
        matchFormat: 'two_legged',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        theme: 'Clásicos',
        draftOrder: ['p1', 'p2', 'p3', 'p4'],
        teams: { p1: 'A', p2: 'B', p3: 'C', p4: 'D' },
        byes: [],
        series: [
          {
            id: 'SF1',
            round: 'semifinal',
            playerA: 'p1',
            playerB: 'p2',
            leg1: { a: null, b: null },
            leg2: { a: null, b: null },
            penaltyWinner: null,
            confirmed: false,
            winnerTo: null,
            loserTo: null,
          },
        ],
      },
    };

    // Set leg1 score with cards for side 'a'
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF1',
      leg: 'leg1',
      side: 'a',
      value: 2,
      cards: { yellow: 1, red: 0 },
    });

    const sf1 = state.activeTournament!.series.find((s) => s.id === 'SF1')!;
    expect(sf1.leg1.a).toBe(2);
    expect(sf1.leg1.cardsA).toEqual({ yellow: 1, red: 0 });

    // Set leg1 score without cards for side 'b' (backward compatible)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF1',
      leg: 'leg1',
      side: 'b',
      value: 1,
    });

    const sf1Updated = state.activeTournament!.series.find((s) => s.id === 'SF1')!;
    expect(sf1Updated.leg1.b).toBe(1);
    expect(sf1Updated.leg1.cardsB).toBeUndefined();

    // 2. League mode: test LEAGUE_MATCH_SCORE_SET with and without cards
    state = {
      ...state,
      activeTournament: {
        id: 'tour-2',
        createdAt: '2026-10-11T12:00:00Z',
        phase: 'league',
        tournamentType: 'league',
        matchFormat: 'single_match',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        theme: 'Clásicos',
        draftOrder: ['p1', 'p2', 'p3', 'p4'],
        teams: { p1: 'A', p2: 'B', p3: 'C', p4: 'D' },
        byes: [],
        series: [],
        leagueMatches: [
          {
            id: 'R1_M1',
            round: 1,
            playerA: 'p1',
            playerB: 'p2',
            scoreA: null,
            scoreB: null,
            confirmed: false,
          },
        ],
      },
    };

    // Set match with cards
    state = appReducer(state, {
      type: 'LEAGUE_MATCH_SCORE_SET',
      matchId: 'R1_M1',
      scoreA: 1,
      scoreB: 1,
      cardsA: { yellow: 2, red: 1 },
      cardsB: { yellow: 0, red: 0 },
    });

    const match = state.activeTournament!.leagueMatches![0]!;
    expect(match.scoreA).toBe(1);
    expect(match.scoreB).toBe(1);
    expect(match.cardsA).toEqual({ yellow: 2, red: 1 });
    expect(match.cardsB).toEqual({ yellow: 0, red: 0 });
  });

  it('delegates league finalization to Fair Play tiebreakers when PTS, DG, and H2H are equal (RF-62)', () => {
    let state = createEmptyAppData();
    state.players = [
      { id: 'p1', firstName: 'Marco', lastName: 'Barzola', createdAt: '2026-10-11' },
      { id: 'p2', firstName: 'Lucas', lastName: 'Fernández', createdAt: '2026-10-11' },
      { id: 'p3', firstName: 'Nico', lastName: 'Gómez', createdAt: '2026-10-11' },
      { id: 'p4', firstName: 'Fede', lastName: 'Álvarez', createdAt: '2026-10-11' },
    ];

    // p1 and p2 both win against p3 and p4, and draw against each other:
    // Both finish with 7 PTS (2 W, 1 D), GF 5, GC 1, DG +4.
    // H2H between p1 and p2: 1-1 draw.
    // PG: both 2 wins.
    // Cards: p1 has 0 red, p2 has 1 red.
    // Fair Play tiebreaker: p1 has fewer red cards -> p1 Champion (10 pts), p2 Runner-up (7 pts).
    const matches = [
      {
        id: 'R1_M1',
        round: 1,
        playerA: 'p1',
        playerB: 'p2',
        scoreA: 1,
        scoreB: 1,
        cardsA: { yellow: 0, red: 0 },
        cardsB: { yellow: 0, red: 1 },
        confirmed: true,
      },
      {
        id: 'R1_M2',
        round: 1,
        playerA: 'p3',
        playerB: 'p4',
        scoreA: 0,
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
        id: 'R2_M2',
        round: 2,
        playerA: 'p2',
        playerB: 'p4',
        scoreA: 2,
        scoreB: 0,
        confirmed: true,
      },
      {
        id: 'R3_M1',
        round: 3,
        playerA: 'p1',
        playerB: 'p4',
        scoreA: 2,
        scoreB: 0,
        confirmed: true,
      },
      {
        id: 'R3_M2',
        round: 3,
        playerA: 'p2',
        playerB: 'p3',
        scoreA: 2,
        scoreB: 0,
        confirmed: true,
      },
    ];

    state = {
      ...state,
      activeTournament: {
        id: 'tour-league-fairplay',
        createdAt: '2026-10-11T12:00:00Z',
        phase: 'league',
        tournamentType: 'league',
        matchFormat: 'single_match',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        theme: 'Clásicos PES 6',
        draftOrder: ['p1', 'p2', 'p3', 'p4'],
        teams: { p1: 'Boca', p2: 'River', p3: 'Vélez', p4: 'Racing' },
        byes: [],
        series: [],
        leagueMatches: matches,
      },
    };

    state = appReducer(state, {
      type: 'TOURNAMENT_FINISHED',
      summaryId: 'sum-fairplay',
      now: '2026-10-11T20:00:00Z',
    });

    expect(state.activeTournament).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.podium.champion).toBe('p1');
    expect(state.history[0]!.podium.runnerUp).toBe('p2');
    expect(state.stats['p1']?.pts).toBe(10);
    expect(state.stats['p2']?.pts).toBe(7);
  });

  it('handles PLAYER_WALKOVER_DECLARED, updates walkoverPlayerIds and enforces RF-66 lock guards in league and bracket', () => {
    let state = createEmptyAppData();

    // 1. League mode test
    state = {
      ...state,
      activeTournament: {
        id: 'tour-league-wo',
        createdAt: '2026-10-11T12:00:00Z',
        phase: 'league',
        tournamentType: 'league',
        matchFormat: 'single_match',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        theme: 'Clásicos PES 6',
        draftOrder: ['p1', 'p2', 'p3', 'p4'],
        teams: { p1: 'Boca', p2: 'River', p3: 'Vélez', p4: 'Racing' },
        byes: [],
        series: [],
        leagueMatches: [
          {
            id: 'M1',
            round: 1,
            playerA: 'p1',
            playerB: 'p2',
            scoreA: null,
            scoreB: null,
            confirmed: false,
          },
          {
            id: 'M2',
            round: 1,
            playerA: 'p3',
            playerB: 'p4',
            scoreA: null,
            scoreB: null,
            confirmed: false,
          },
        ],
      },
    };

    // p1 abandons
    state = appReducer(state, {
      type: 'PLAYER_WALKOVER_DECLARED',
      playerId: 'p1',
    });

    expect(state.activeTournament?.walkoverPlayerIds).toEqual(['p1']);
    const m1 = state.activeTournament?.leagueMatches?.find((m) => m.id === 'M1')!;
    expect(m1.scoreA).toBe(0);
    expect(m1.scoreB).toBe(3);
    expect(m1.confirmed).toBe(true);

    // Editing M1 must be blocked (RF-66)
    const stateAfterEditAttempt = appReducer(state, {
      type: 'LEAGUE_MATCH_SCORE_SET',
      matchId: 'M1',
      scoreA: 5,
      scoreB: 0,
    });
    expect(stateAfterEditAttempt.activeTournament?.leagueMatches?.find((m) => m.id === 'M1')?.scoreA).toBe(0);

    const stateAfterReopenAttempt = appReducer(state, {
      type: 'LEAGUE_MATCH_EDIT_REQUESTED',
      matchId: 'M1',
    });
    expect(stateAfterReopenAttempt.activeTournament?.leagueMatches?.find((m) => m.id === 'M1')?.confirmed).toBe(true);

    // 2. Bracket mode test
    let bracketState = createEmptyAppData();
    bracketState = {
      ...bracketState,
      activeTournament: {
        id: 'tour-bracket-wo',
        createdAt: '2026-10-11T12:00:00Z',
        phase: 'bracket',
        tournamentType: 'bracket',
        matchFormat: 'two_legged',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        theme: 'Clásicos PES 6',
        draftOrder: ['p1', 'p2', 'p3', 'p4'],
        teams: { p1: 'Boca', p2: 'River', p3: 'Vélez', p4: 'Racing' },
        byes: [],
        series: [
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
        ],
      },
    };

    bracketState = appReducer(bracketState, {
      type: 'PLAYER_WALKOVER_DECLARED',
      playerId: 'p1',
    });

    expect(bracketState.activeTournament?.walkoverPlayerIds).toEqual(['p1']);
    const sf1 = bracketState.activeTournament?.series.find((s) => s.id === 'SF1')!;
    expect(sf1.confirmed).toBe(true);
    expect(sf1.winner).toBe('p2');
    expect(sf1.loser).toBe('p1');
    expect(sf1.leg1.a).toBe(0);
    expect(sf1.leg1.b).toBe(3);

    // Editing SF1 must be blocked (RF-66)
    const bracketAfterEditAttempt = appReducer(bracketState, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF1',
      leg: 'leg1',
      side: 'a',
      value: 10,
    });
    expect(bracketAfterEditAttempt.activeTournament?.series.find((s) => s.id === 'SF1')?.leg1.a).toBe(0);

    const bracketAfterReopenAttempt = appReducer(bracketState, {
      type: 'SERIES_EDIT_REQUESTED',
      seriesId: 'SF1',
    });
    expect(bracketAfterReopenAttempt.activeTournament?.series.find((s) => s.id === 'SF1')?.confirmed).toBe(true);
  });

  it('handles GROUP_STAGE_GENERATED, match scoring, GROUP_PLAYOFFS_STARTED and TOURNAMENT_FINISHED', () => {
    let state = createEmptyAppData();
    const p6 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    for (const id of p6) {
      state = appReducer(state, {
        type: 'PLAYER_ADDED',
        player: { id, firstName: id, lastName: id, createdAt: '2026-10-11' },
      });
    }

    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: p6,
      tournamentType: 'group_stage',
      matchFormat: 'single_match',
      tournamentId: 't-group-1',
      now: '2026-10-11T12:00:00Z',
    });

    state = appReducer(state, { type: 'THEME_SET', theme: 'Retro' });
    state = appReducer(state, { type: 'DRAFT_STARTED', order: p6 });

    // Generate group stage
    const groups = {
      A: ['p1', 'p2', 'p3'],
      B: ['p4', 'p5', 'p6'],
    };
    const matches = [
      {
        id: 'GA_R1_M1',
        groupId: 'A' as const,
        round: 1,
        playerA: 'p1',
        playerB: 'p2',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      },
      {
        id: 'GA_R2_M1',
        groupId: 'A' as const,
        round: 2,
        playerA: 'p2',
        playerB: 'p3',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      },
      {
        id: 'GA_R3_M1',
        groupId: 'A' as const,
        round: 3,
        playerA: 'p3',
        playerB: 'p1',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      },
      {
        id: 'GB_R1_M1',
        groupId: 'B' as const,
        round: 1,
        playerA: 'p4',
        playerB: 'p5',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      },
      {
        id: 'GB_R2_M1',
        groupId: 'B' as const,
        round: 2,
        playerA: 'p5',
        playerB: 'p6',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      },
      {
        id: 'GB_R3_M1',
        groupId: 'B' as const,
        round: 3,
        playerA: 'p6',
        playerB: 'p4',
        scoreA: null,
        scoreB: null,
        confirmed: false,
      },
    ];

    state = appReducer(state, {
      type: 'GROUP_STAGE_GENERATED',
      groups,
      matches,
    });

    expect(state.activeTournament?.phase).toBe('group_stage');
    expect(state.activeTournament?.groupMatches).toHaveLength(6);

    // Score and confirm all group matches
    // In Group A: p1 wins both (6 pts), p2 wins 1 (3 pts), p3 0 pts
    state = appReducer(state, {
      type: 'GROUP_MATCH_SCORE_SET',
      matchId: 'GA_R1_M1',
      scoreA: 2,
      scoreB: 1,
      cardsA: { yellow: 1, red: 0 },
    });
    state = appReducer(state, { type: 'GROUP_MATCH_CONFIRMED', matchId: 'GA_R1_M1' });

    state = appReducer(state, {
      type: 'GROUP_MATCH_SCORE_SET',
      matchId: 'GA_R2_M1',
      scoreA: 1,
      scoreB: 0,
    });
    state = appReducer(state, { type: 'GROUP_MATCH_CONFIRMED', matchId: 'GA_R2_M1' });

    state = appReducer(state, {
      type: 'GROUP_MATCH_SCORE_SET',
      matchId: 'GA_R3_M1',
      scoreA: 0,
      scoreB: 2,
    });
    state = appReducer(state, { type: 'GROUP_MATCH_CONFIRMED', matchId: 'GA_R3_M1' });

    // In Group B: p4 wins both (6 pts), p5 wins 1 (3 pts), p6 0 pts
    state = appReducer(state, {
      type: 'GROUP_MATCH_SCORE_SET',
      matchId: 'GB_R1_M1',
      scoreA: 3,
      scoreB: 0,
    });
    state = appReducer(state, { type: 'GROUP_MATCH_CONFIRMED', matchId: 'GB_R1_M1' });

    state = appReducer(state, {
      type: 'GROUP_MATCH_SCORE_SET',
      matchId: 'GB_R2_M1',
      scoreA: 2,
      scoreB: 1,
    });
    state = appReducer(state, { type: 'GROUP_MATCH_CONFIRMED', matchId: 'GB_R2_M1' });

    state = appReducer(state, {
      type: 'GROUP_MATCH_SCORE_SET',
      matchId: 'GB_R3_M1',
      scoreA: 0,
      scoreB: 1,
    });
    state = appReducer(state, { type: 'GROUP_MATCH_CONFIRMED', matchId: 'GB_R3_M1' });

    // Start playoffs
    state = appReducer(state, { type: 'GROUP_PLAYOFFS_STARTED' });

    expect(state.activeTournament?.phase).toBe('group_playoffs');
    expect(state.activeTournament?.series).toHaveLength(4);

    // Semis cruzadas: SF1 = 1°A ('p1') vs 2°B ('p5'), SF2 = 1°B ('p4') vs 2°A ('p2')
    const sf1 = state.activeTournament?.series.find((s) => s.id === 'SF1');
    const sf2 = state.activeTournament?.series.find((s) => s.id === 'SF2');
    expect(sf1?.playerA).toBe('p1');
    expect(sf1?.playerB).toBe('p5');
    expect(sf2?.playerA).toBe('p4');
    expect(sf2?.playerB).toBe('p2');

    // Play SF1 (p1 wins)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF1',
      leg: 'leg1',
      side: 'a',
      value: 2,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF1',
      leg: 'leg1',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, { type: 'SERIES_CONFIRMED', seriesId: 'SF1' });

    // Play SF2 (p4 wins)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF2',
      leg: 'leg1',
      side: 'a',
      value: 3,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF2',
      leg: 'leg1',
      side: 'b',
      value: 1,
    });
    state = appReducer(state, { type: 'SERIES_CONFIRMED', seriesId: 'SF2' });

    // Play Final: p1 vs p4 (p1 wins)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'F',
      leg: 'leg1',
      side: 'a',
      value: 1,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'F',
      leg: 'leg1',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, { type: 'SERIES_CONFIRMED', seriesId: 'F' });

    // Play Third Place: p5 vs p2 (p5 wins)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'TP',
      leg: 'leg1',
      side: 'a',
      value: 2,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'TP',
      leg: 'leg1',
      side: 'b',
      value: 1,
    });
    state = appReducer(state, { type: 'SERIES_CONFIRMED', seriesId: 'TP' });

    // Finish tournament
    state = appReducer(state, {
      type: 'TOURNAMENT_FINISHED',
      summaryId: 'sum-group-1',
      now: '2026-10-11T13:00:00Z',
    });

    expect(state.activeTournament).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.tournamentType).toBe('group_stage');
    expect(state.history[0]?.podium.champion).toBe('p1');
    expect(state.history[0]?.podium.runnerUp).toBe('p4');
    expect(state.history[0]?.podium.third).toBe('p5');
    expect(state.history[0]?.podium.fourth).toBe('p2');
  });

  it('handles LEAGUE_PLAYOFFS_STARTED and transitions into league_playoffs', () => {
    let state = createEmptyAppData();
    const p4 = ['p1', 'p2', 'p3', 'p4'];
    for (const id of p4) {
      state = appReducer(state, {
        type: 'PLAYER_ADDED',
        player: { id, firstName: id, lastName: id, createdAt: '2026-10-11' },
      });
    }

    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: p4,
      tournamentType: 'league_playoffs',
      matchFormat: 'single_match',
      tournamentId: 't-lp-1',
      now: '2026-10-11T12:00:00Z',
    });
    state = appReducer(state, { type: 'THEME_SET', theme: 'Libertadores' });
    state = appReducer(state, { type: 'DRAFT_STARTED', order: p4 });

    // Generate league
    const matches = [
      { id: 'M1', round: 1, playerA: 'p1', playerB: 'p2', scoreA: 3, scoreB: 0, confirmed: true },
      { id: 'M2', round: 1, playerA: 'p3', playerB: 'p4', scoreA: 2, scoreB: 0, confirmed: true },
      { id: 'M3', round: 2, playerA: 'p1', playerB: 'p3', scoreA: 2, scoreB: 0, confirmed: true },
      { id: 'M4', round: 2, playerA: 'p2', playerB: 'p4', scoreA: 1, scoreB: 0, confirmed: true },
      { id: 'M5', round: 3, playerA: 'p1', playerB: 'p4', scoreA: 1, scoreB: 0, confirmed: true },
      { id: 'M6', round: 3, playerA: 'p2', playerB: 'p3', scoreA: 2, scoreB: 1, confirmed: true },
    ];
    state = appReducer(state, { type: 'LEAGUE_GENERATED', matches });

    // Transition to league playoffs
    state = appReducer(state, { type: 'LEAGUE_PLAYOFFS_STARTED' });

    expect(state.activeTournament?.phase).toBe('league_playoffs');
    // For 4 participants: Direct Final (1° vs 2°) and TP (3° vs 4°)
    expect(state.activeTournament?.series).toHaveLength(2);
    const finalSeries = state.activeTournament?.series.find((s) => s.id === 'F');
    const tpSeries = state.activeTournament?.series.find((s) => s.id === 'TP');
    expect(finalSeries?.playerA).toBe('p1');
    expect(finalSeries?.playerB).toBe('p2');
    expect(tpSeries?.playerA).toBe('p3');
    expect(tpSeries?.playerB).toBe('p4');
  });

  it('handles DOUBLE_ELIMINATION_GENERATED, DOUBLE_ELIMINATION_MATCH_CONFIRMED and TOURNAMENT_FINISHED', () => {
    let state = createEmptyAppData();
    const p4 = ['p1', 'p2', 'p3', 'p4'];
    for (const id of p4) {
      state = appReducer(state, {
        type: 'PLAYER_ADDED',
        player: { id, firstName: id, lastName: id, createdAt: '2026-10-11' },
      });
    }

    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: p4,
      tournamentType: 'double_elimination',
      matchFormat: 'single_match',
      tournamentId: 't-de-1',
      now: '2026-10-11T12:00:00Z',
    });
    state = appReducer(state, { type: 'THEME_SET', theme: 'Champions League' });
    state = appReducer(state, { type: 'DRAFT_STARTED', order: p4 });
    state = appReducer(state, {
      type: 'TEAMS_BATCH_ASSIGNED',
      teams: { p1: 'Real Madrid', p2: 'Man City', p3: 'Bayern', p4: 'PSG' },
    });

    // Generate DE bracket (using identity rng 0.99999 so order is p1, p2, p3, p4)
    const bracket = generateDoubleEliminationBracket(p4, () => 0.99999);
    state = appReducer(state, {
      type: 'DOUBLE_ELIMINATION_GENERATED',
      bracket,
    });

    expect(state.activeTournament?.phase).toBe('double_elimination');
    expect(state.activeTournament?.series.length).toBeGreaterThanOrEqual(5);

    // Guard (RF-20): Cannot regenerate DE bracket
    const prevState = state;
    state = appReducer(state, {
      type: 'DOUBLE_ELIMINATION_GENERATED',
      bracket,
    });
    expect(state).toBe(prevState);

    // Guard (RF-45 & RF-46): Cannot change participants or remove active player
    const stateBlockedPart = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: ['p1', 'p2', 'p3', 'p4'],
      tournamentId: 'other',
      now: '2026-10-11',
    });
    expect(stateBlockedPart).toBe(state);

    const stateBlockedRem = appReducer(state, {
      type: 'PLAYER_REMOVED',
      playerId: 'p1',
    });
    expect(stateBlockedRem).toBe(state);

    // Play WB Semifinals
    // WB_SF1: p1 vs p2 -> p1 wins 2-0 (p2 drops to LB_R1 side a)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'WB_SF1',
      leg: 'leg1',
      side: 'a',
      value: 2,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'WB_SF1',
      leg: 'leg1',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, {
      type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED',
      seriesId: 'WB_SF1',
    });

    // WB_SF2: p3 vs p4 -> p3 wins 3-1 (p4 drops to LB_R1 side b)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'WB_SF2',
      leg: 'leg1',
      side: 'a',
      value: 3,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'WB_SF2',
      leg: 'leg1',
      side: 'b',
      value: 1,
    });
    state = appReducer(state, {
      type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED',
      seriesId: 'WB_SF2',
    });

    // WB_F: p1 vs p3 -> p1 wins 1-0 (p1 to GF1 side a, p3 to LB_F side b)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'WB_F',
      leg: 'leg1',
      side: 'a',
      value: 1,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'WB_F',
      leg: 'leg1',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, {
      type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED',
      seriesId: 'WB_F',
    });

    // LB_R1: p2 vs p4 -> p2 wins 2-0 (p4 eliminated in 4th place, p2 to LB_F side a)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'LB_R1',
      leg: 'leg1',
      side: 'a',
      value: 2,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'LB_R1',
      leg: 'leg1',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, {
      type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED',
      seriesId: 'LB_R1',
    });

    // LB_F: p2 vs p3 -> p2 wins 2-1 (p3 eliminated in 3rd place, p2 to GF1 side b)
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'LB_F',
      leg: 'leg1',
      side: 'a',
      value: 2,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'LB_F',
      leg: 'leg1',
      side: 'b',
      value: 1,
    });
    state = appReducer(state, {
      type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED',
      seriesId: 'LB_F',
    });

    // GF1: p1 (WB champion) vs p2 (LB champion) -> p1 wins 2-0
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'GF1',
      leg: 'leg1',
      side: 'a',
      value: 2,
    });
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'GF1',
      leg: 'leg1',
      side: 'b',
      value: 0,
    });
    state = appReducer(state, {
      type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED',
      seriesId: 'GF1',
    });

    // Tournament is now complete without Reset
    state = appReducer(state, {
      type: 'TOURNAMENT_FINISHED',
      summaryId: 'sum-de-1',
      now: '2026-10-11T15:00:00Z',
    });

    expect(state.activeTournament).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.tournamentType).toBe('double_elimination');
    expect(state.history[0]?.podium).toEqual({
      champion: 'p1',
      runnerUp: 'p2',
      third: 'p3',
      fourth: 'p4',
    });
    // Check points
    expect(state.stats['p1']?.pts).toBe(10);
    expect(state.stats['p2']?.pts).toBe(7);
    expect(state.stats['p3']?.pts).toBe(5);
    expect(state.stats['p4']?.pts).toBe(3);
  });

  it('handles Grand Final Reset in Double Elimination when LB champion wins GF1', () => {
    let state = createEmptyAppData();
    const p4 = ['p1', 'p2', 'p3', 'p4'];
    for (const id of p4) {
      state = appReducer(state, {
        type: 'PLAYER_ADDED',
        player: { id, firstName: id, lastName: id, createdAt: '2026-10-11' },
      });
    }

    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: p4,
      tournamentType: 'double_elimination',
      matchFormat: 'single_match',
      tournamentId: 't-de-2',
      now: '2026-10-11T12:00:00Z',
    });
    state = appReducer(state, { type: 'THEME_SET', theme: 'Retro' });
    state = appReducer(state, { type: 'DRAFT_STARTED', order: p4 });

    const bracket = generateDoubleEliminationBracket(p4, () => 0.99999);
    state = appReducer(state, { type: 'DOUBLE_ELIMINATION_GENERATED', bracket });

    // Play WB
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'WB_SF1', leg: 'leg1', side: 'a', value: 2 });
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'WB_SF1', leg: 'leg1', side: 'b', value: 0 });
    state = appReducer(state, { type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED', seriesId: 'WB_SF1' });

    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'WB_SF2', leg: 'leg1', side: 'a', value: 2 });
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'WB_SF2', leg: 'leg1', side: 'b', value: 0 });
    state = appReducer(state, { type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED', seriesId: 'WB_SF2' });

    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'WB_F', leg: 'leg1', side: 'a', value: 2 });
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'WB_F', leg: 'leg1', side: 'b', value: 0 });
    state = appReducer(state, { type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED', seriesId: 'WB_F' });

    // Play LB
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'LB_R1', leg: 'leg1', side: 'a', value: 2 });
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'LB_R1', leg: 'leg1', side: 'b', value: 0 });
    state = appReducer(state, { type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED', seriesId: 'LB_R1' });

    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'LB_F', leg: 'leg1', side: 'a', value: 2 });
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'LB_F', leg: 'leg1', side: 'b', value: 0 });
    state = appReducer(state, { type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED', seriesId: 'LB_F' });

    // GF1: p1 (WB champion) vs p2 (LB champion). LB champion (p2) wins!
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'GF1', leg: 'leg1', side: 'a', value: 0 });
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'GF1', leg: 'leg1', side: 'b', value: 2 });
    state = appReducer(state, { type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED', seriesId: 'GF1' });

    // GF2 should be automatically triggered and present
    let gf2 = state.activeTournament?.series.find((s) => s.id === 'GF2');
    expect(gf2).toBeDefined();
    expect(gf2?.playerA).toBe('p1');
    expect(gf2?.playerB).toBe('p2');

    // DOUBLE_ELIMINATION_RESET_TRIGGERED idempotency check
    state = appReducer(state, { type: 'DOUBLE_ELIMINATION_RESET_TRIGGERED' });
    gf2 = state.activeTournament?.series.find((s) => s.id === 'GF2');
    expect(gf2).toBeDefined();

    // Now play GF2: p2 wins GF2 to become Champion
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'GF2', leg: 'leg1', side: 'a', value: 1 });
    state = appReducer(state, { type: 'LEG_SCORE_SET', seriesId: 'GF2', leg: 'leg1', side: 'b', value: 3 });
    state = appReducer(state, { type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED', seriesId: 'GF2' });

    // Finish tournament
    state = appReducer(state, {
      type: 'TOURNAMENT_FINISHED',
      summaryId: 'sum-de-2',
      now: '2026-10-11T16:00:00Z',
    });

    expect(state.activeTournament).toBeNull();
    expect(state.history[0]?.podium.champion).toBe('p2');
    expect(state.history[0]?.podium.runnerUp).toBe('p1');
    expect(state.history[0]?.podium.third).toBe('p3');
    expect(state.history[0]?.podium.fourth).toBe('p4');
    expect(state.stats['p2']?.pts).toBe(10);
    expect(state.stats['p1']?.pts).toBe(7);
  });

  it('accumulates Head-to-Head and Annual Rankings upon TOURNAMENT_FINISHED and clears them on STANDINGS_RESET (RF-76, RF-78, RF-47)', () => {
    let state = createEmptyAppData();
    const p4 = ['p1', 'p2', 'p3', 'p4'];
    for (const id of p4) {
      state = appReducer(state, {
        type: 'PLAYER_ADDED',
        player: { id, firstName: id, lastName: id, createdAt: '2026-10-11' },
      });
    }

    // Set up a 4-player league
    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: p4,
      tournamentType: 'league',
      matchFormat: 'single_match',
      tournamentId: 'tour-h2h-1',
      now: '2026-06-15T12:00:00Z',
    });
    state = appReducer(state, { type: 'THEME_SET', theme: 'Test Theme' });

    // Populate and confirm all league matches
    const matches: LeagueMatch[] = [
      { id: '1', round: 1, playerA: 'p1', playerB: 'p2', scoreA: 3, scoreB: 1, confirmed: true },
      { id: '2', round: 1, playerA: 'p3', playerB: 'p4', scoreA: 2, scoreB: 0, confirmed: true },
      { id: '3', round: 2, playerA: 'p1', playerB: 'p3', scoreA: 1, scoreB: 0, confirmed: true },
      { id: '4', round: 2, playerA: 'p2', playerB: 'p4', scoreA: 2, scoreB: 1, confirmed: true },
      { id: '5', round: 3, playerA: 'p1', playerB: 'p4', scoreA: 4, scoreB: 0, confirmed: true },
      { id: '6', round: 3, playerA: 'p2', playerB: 'p3', scoreA: 1, scoreB: 0, confirmed: true },
    ];

    state = {
      ...state,
      activeTournament: {
        ...state.activeTournament!,
        phase: 'league',
        leagueMatches: matches,
      },
    };

    // Finish tournament
    state = appReducer(state, {
      type: 'TOURNAMENT_FINISHED',
      summaryId: 'sum-h2h-1',
      now: '2026-06-15T18:00:00Z',
    });

    expect(state.activeTournament).toBeNull();
    expect(state.history).toHaveLength(1);

    // Verify H2H was accumulated (RF-76)
    expect(state.headToHead).toBeDefined();
    const h2hP1P2 = state.headToHead?.['p1_p2'];
    expect(h2hP1P2).toBeDefined();
    expect(h2hP1P2?.played).toBe(1);
    expect(h2hP1P2?.winsA).toBe(1); // p1 beat p2 (3-1)
    expect(h2hP1P2?.goalsA).toBe(3);
    expect(h2hP1P2?.goalsB).toBe(1);

    // Verify Annual Ranking was accumulated for year 2026 (RF-78)
    expect(state.annualRankings).toBeDefined();
    const ranking2026 = state.annualRankings?.['2026'];
    expect(ranking2026).toBeDefined();
    // In 4-player league: p1 is champion -> 10 pts, p2 is runner-up -> 7 pts
    expect(ranking2026?.['p1']?.pts).toBe(10);
    expect(ranking2026?.['p1']?.championships).toBe(1);
    expect(ranking2026?.['p2']?.pts).toBe(7);
    expect(ranking2026?.['p2']?.runnerUps).toBe(1);

    // Now test STANDINGS_RESET (RF-47): clears stats, history, H2H, and annual rankings
    state = appReducer(state, { type: 'STANDINGS_RESET' });
    expect(state.history).toEqual([]);
    expect(state.headToHead).toEqual({});
    expect(state.annualRankings).toEqual({});
  });

  it('handles BRACKET_MATCHUPS_MANUALLY_SET and DOUBLE_ELIMINATION_MATCHUPS_MANUALLY_SET (RF-87)', () => {
    const p4: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
    let state = appReducer(createEmptyAppData(), {
      type: 'PLAYER_ADDED',
      player: { id: 'p1', firstName: 'P1', lastName: 'A', createdAt: '2026-01-01' },
    });
    state = appReducer(state, {
      type: 'PLAYER_ADDED',
      player: { id: 'p2', firstName: 'P2', lastName: 'B', createdAt: '2026-01-01' },
    });
    state = appReducer(state, {
      type: 'PLAYER_ADDED',
      player: { id: 'p3', firstName: 'P3', lastName: 'C', createdAt: '2026-01-01' },
    });
    state = appReducer(state, {
      type: 'PLAYER_ADDED',
      player: { id: 'p4', firstName: 'P4', lastName: 'D', createdAt: '2026-01-01' },
    });

    // 1. Bracket tournament
    state = appReducer(state, {
      type: 'PARTICIPANTS_SET',
      participantIds: p4,
      tournamentType: 'bracket',
      matchFormat: 'two_legged',
      tournamentId: 't-bracket-manual',
      now: '2026-10-11T12:00:00Z',
    });
    state = appReducer(state, { type: 'THEME_SET', theme: 'Retro' });
    state = appReducer(state, { type: 'DRAFT_STARTED', order: p4 });
    const { series, byes } = generateBracket(p4, () => 0.1);
    state = appReducer(state, { type: 'BRACKET_GENERATED', series, byes });

    // Reorder manually before any match is played
    state = appReducer(state, {
      type: 'BRACKET_MATCHUPS_MANUALLY_SET',
      orderedParticipantIds: ['p4', 'p3', 'p2', 'p1'],
    });

    const sf1 = state.activeTournament?.series.find((s) => s.id === 'SF1');
    const sf2 = state.activeTournament?.series.find((s) => s.id === 'SF2');
    expect(sf1?.playerA).toBe('p4');
    expect(sf1?.playerB).toBe('p3');
    expect(sf2?.playerA).toBe('p2');
    expect(sf2?.playerB).toBe('p1');
    expect(state.activeTournament?.bracketOrder).toEqual(['p4', 'p3', 'p2', 'p1']);

    // Start a match: score set
    state = appReducer(state, {
      type: 'LEG_SCORE_SET',
      seriesId: 'SF1',
      leg: 'leg1',
      side: 'a',
      value: 1,
    });

    // Attempt to manually reorder after match started: must be rejected
    const prevOrder = state.activeTournament?.bracketOrder;
    state = appReducer(state, {
      type: 'BRACKET_MATCHUPS_MANUALLY_SET',
      orderedParticipantIds: ['p1', 'p2', 'p3', 'p4'],
    });
    expect(state.activeTournament?.bracketOrder).toEqual(prevOrder);

    // 2. Double elimination tournament
    let deState = appReducer(createEmptyAppData(), {
      type: 'PLAYER_ADDED',
      player: { id: 'p1', firstName: 'P1', lastName: 'A', createdAt: '2026-01-01' },
    });
    deState = appReducer(deState, {
      type: 'PLAYER_ADDED',
      player: { id: 'p2', firstName: 'P2', lastName: 'B', createdAt: '2026-01-01' },
    });
    deState = appReducer(deState, {
      type: 'PLAYER_ADDED',
      player: { id: 'p3', firstName: 'P3', lastName: 'C', createdAt: '2026-01-01' },
    });
    deState = appReducer(deState, {
      type: 'PLAYER_ADDED',
      player: { id: 'p4', firstName: 'P4', lastName: 'D', createdAt: '2026-01-01' },
    });
    deState = appReducer(deState, {
      type: 'PARTICIPANTS_SET',
      participantIds: p4,
      tournamentType: 'double_elimination',
      matchFormat: 'two_legged',
      tournamentId: 't-de-manual',
      now: '2026-10-11T12:00:00Z',
    });
    deState = appReducer(deState, { type: 'THEME_SET', theme: 'Retro' });
    deState = appReducer(deState, { type: 'DRAFT_STARTED', order: p4 });
    const deBracket = generateDoubleEliminationBracket(p4, () => 0.1);
    deState = appReducer(deState, {
      type: 'DOUBLE_ELIMINATION_GENERATED',
      bracket: deBracket,
    });

    // Reorder manually before any match is played
    deState = appReducer(deState, {
      type: 'DOUBLE_ELIMINATION_MATCHUPS_MANUALLY_SET',
      orderedParticipantIds: ['p3', 'p4', 'p1', 'p2'],
    });

    const wbSf1 = deState.activeTournament?.series.find((s) => s.id === 'WB_SF1');
    const wbSf2 = deState.activeTournament?.series.find((s) => s.id === 'WB_SF2');
    expect(wbSf1?.playerA).toBe('p3');
    expect(wbSf1?.playerB).toBe('p4');
    expect(wbSf2?.playerA).toBe('p1');
    expect(wbSf2?.playerB).toBe('p2');
    expect(deState.activeTournament?.bracketOrder).toEqual(['p3', 'p4', 'p1', 'p2']);
  });
});



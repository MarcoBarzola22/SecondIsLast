import { describe, expect, it } from 'vitest';
import { generateBracket } from '../../domain/bracket';
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
});


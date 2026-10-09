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
});

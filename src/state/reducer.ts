import { isDuplicatePlayer } from '../domain/players';
import {
  confirmSeries,
  isBracketComplete,
  reopenSeries,
  setLegScore,
  setPenaltyWinner,
} from '../domain/series';
import { applyStats, computeTournamentStats } from '../domain/standings';
import type { ActiveTournament, TournamentSummary } from '../domain/types';
import type { AppData } from '../storage/schema';
import type { Action } from './actions';

/**
 * Root state reducer delegating all business logic to pure domain functions (Principle 3, D4).
 * Enforces phase lifecycle guards (RF-20, RF-45).
 */
export function appReducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'PLAYER_ADDED': {
      if (isDuplicatePlayer(action.player, state.players)) {
        console.warn(
          '[Reducer] Duplicate player rejected:',
          action.player.firstName,
          action.player.lastName
        );
        return state;
      }
      return {
        ...state,
        players: [...state.players, action.player],
      };
    }

    case 'PARTICIPANTS_SET': {
      // Guard (RF-45): Cannot change participants while tournament is in draft or bracket phase
      if (
        state.activeTournament &&
        (state.activeTournament.phase === 'draft' ||
          state.activeTournament.phase === 'bracket')
      ) {
        console.warn(
          '[Reducer] Cannot modify participants while tournament is active in draft or bracket phase.'
        );
        return state;
      }

      if (
        action.participantIds.length < 4 ||
        action.participantIds.length > 6
      ) {
        console.warn(
          '[Reducer] Invalid participants count:',
          action.participantIds.length
        );
        return state;
      }

      const activeTournament: ActiveTournament = {
        id: action.tournamentId,
        createdAt: action.now,
        phase: 'theme',
        participantIds: action.participantIds,
        theme: null,
        draftOrder: [],
        teams: {},
        byes: [],
        series: [],
      };

      return {
        ...state,
        activeTournament,
      };
    }

    case 'THEME_SET': {
      if (!state.activeTournament) {
        console.warn('[Reducer] No active tournament to set theme.');
        return state;
      }
      if (state.activeTournament.phase !== 'theme') {
        console.warn(
          '[Reducer] Cannot change theme outside theme phase (RF-45).'
        );
        return state;
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          theme: action.theme,
        },
      };
    }

    case 'DRAFT_STARTED': {
      if (!state.activeTournament || !state.activeTournament.theme) {
        console.warn('[Reducer] Cannot start draft without an active tournament and selected theme.');
        return state;
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          phase: 'draft',
          draftOrder: action.order,
        },
      };
    }

    case 'TEAM_ASSIGNED': {
      if (!state.activeTournament || state.activeTournament.phase !== 'draft') {
        console.warn('[Reducer] Cannot assign team outside draft phase.');
        return state;
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          teams: {
            ...state.activeTournament.teams,
            [action.playerId]: action.team,
          },
        },
      };
    }

    case 'BRACKET_GENERATED': {
      if (!state.activeTournament) {
        console.warn('[Reducer] No active tournament to set bracket.');
        return state;
      }
      // Guard (RF-20): Once generated, bracket cannot be regenerated in the active tournament
      if (state.activeTournament.series.length > 0) {
        console.warn(
          '[Reducer] Bracket already generated for this tournament (RF-20).'
        );
        return state;
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          phase: 'bracket',
          series: action.series,
          byes: action.byes,
        },
      };
    }

    case 'LEG_SCORE_SET': {
      if (!state.activeTournament || state.activeTournament.phase !== 'bracket') {
        return state;
      }

      try {
        const updatedSeries = setLegScore(
          state.activeTournament.series,
          action.seriesId,
          action.leg,
          action.side,
          action.value
        );
        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            series: updatedSeries,
          },
        };
      } catch (err) {
        console.error('[Reducer] Error updating leg score:', err);
        return state;
      }
    }

    case 'PENALTY_WINNER_SET': {
      if (!state.activeTournament || state.activeTournament.phase !== 'bracket') {
        return state;
      }

      try {
        const updatedSeries = setPenaltyWinner(
          state.activeTournament.series,
          action.seriesId,
          action.playerId
        );
        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            series: updatedSeries,
          },
        };
      } catch (err) {
        console.error('[Reducer] Error setting penalty winner:', err);
        return state;
      }
    }

    case 'SERIES_CONFIRMED': {
      if (!state.activeTournament || state.activeTournament.phase !== 'bracket') {
        return state;
      }

      try {
        const updatedSeries = confirmSeries(
          state.activeTournament.series,
          action.seriesId
        );
        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            series: updatedSeries,
          },
        };
      } catch (err) {
        console.error('[Reducer] Error confirming series:', err);
        return state;
      }
    }

    case 'SERIES_EDIT_REQUESTED': {
      if (!state.activeTournament || state.activeTournament.phase !== 'bracket') {
        return state;
      }

      try {
        const updatedSeries = reopenSeries(
          state.activeTournament.series,
          action.seriesId
        );
        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            series: updatedSeries,
          },
        };
      } catch (err) {
        console.error('[Reducer] Error reopening series for edit:', err);
        return state;
      }
    }

    case 'TOURNAMENT_FINISHED': {
      if (!state.activeTournament || state.activeTournament.phase !== 'bracket') {
        console.warn('[Reducer] Cannot finish tournament: no tournament in bracket phase.');
        return state;
      }

      if (!isBracketComplete(state.activeTournament.series)) {
        console.warn('[Reducer] Cannot finish tournament: Final and Third place must be confirmed.');
        return state;
      }

      try {
        const { stats: deltas, podium } = computeTournamentStats(
          state.activeTournament
        );
        const updatedStats = applyStats(state.stats, deltas);

        const summary: TournamentSummary = {
          id: action.summaryId,
          finishedAt: action.now,
          theme: state.activeTournament.theme ?? 'Sin temática',
          participants: state.activeTournament.participantIds.map((id) => ({
            playerId: id,
            team: state.activeTournament?.teams[id] ?? '',
          })),
          podium,
        };

        return {
          ...state,
          stats: updatedStats,
          history: [summary, ...state.history],
          activeTournament: null, // RF-33: Active tournament cleared atomically
        };
      } catch (err) {
        console.error('[Reducer] Error finalizing tournament:', err);
        return state;
      }
    }

    case 'TOURNAMENT_ABANDONED': {
      // RF-44: Abandons active tournament without touching stats or history
      return {
        ...state,
        activeTournament: null,
      };
    }

    default:
      return state;
  }
}

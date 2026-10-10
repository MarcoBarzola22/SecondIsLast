import {
  isDuplicatePlayer,
  removePlayer,
} from '../domain/players';
import { addCustomTheme } from '../domain/theme';
import {
  confirmLeagueMatch,
  computeLeagueTournamentStats,
  isLeagueComplete,
  reopenLeagueMatch,
  setLeagueMatchScore,
} from '../domain/league';
import {
  confirmSeries,
  isBracketComplete,
  reopenSeries,
  setLegScore,
  setPenaltyWinner,
} from '../domain/series';
import {
  applyStats,
  computeTournamentStats,
  removePlayerStats,
  resetStandings,
} from '../domain/standings';
import type {
  ActiveTournament,
  TournamentSummary,
} from '../domain/types';
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

    case 'PLAYER_REMOVED': {
      // Guard (RF-46): Cannot delete player who is an active participant in an ongoing tournament
      if (
        state.activeTournament &&
        (state.activeTournament.phase === 'draft' ||
          state.activeTournament.phase === 'bracket' ||
          state.activeTournament.phase === 'league') &&
        state.activeTournament.participantIds.includes(action.playerId)
      ) {
        console.warn(
          '[Reducer] Cannot remove player while participating in an active tournament in progress (RF-46).'
        );
        return state;
      }

      const updatedPlayers = removePlayer(state.players, action.playerId);
      const updatedStats = removePlayerStats(state.stats, action.playerId);

      let updatedActiveTournament = state.activeTournament;
      if (
        updatedActiveTournament &&
        updatedActiveTournament.participantIds.includes(action.playerId)
      ) {
        updatedActiveTournament = {
          ...updatedActiveTournament,
          participantIds: updatedActiveTournament.participantIds.filter(
            (id) => id !== action.playerId
          ),
        };
      }

      return {
        ...state,
        players: updatedPlayers,
        stats: updatedStats,
        activeTournament: updatedActiveTournament,
      };
    }

    case 'STANDINGS_RESET': {
      // RF-47: Clears all historical accumulated stats and tournament history atomically
      return {
        ...state,
        stats: resetStandings(),
        history: [],
      };
    }

    case 'PARTICIPANTS_SET': {
      // Guard (RF-45): Cannot change participants while tournament is in draft, bracket or league phase
      if (
        state.activeTournament &&
        (state.activeTournament.phase === 'draft' ||
          state.activeTournament.phase === 'bracket' ||
          state.activeTournament.phase === 'league')
      ) {
        console.warn(
          '[Reducer] Cannot modify participants while tournament is active in draft, bracket, or league phase.'
        );
        return state;
      }

      if (
        action.participantIds.length < 4 ||
        action.participantIds.length > 10
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
        tournamentType: action.tournamentType ?? 'bracket',
        matchFormat: action.matchFormat ?? 'two_legged',
        participantIds: action.participantIds,
        theme: null,
        draftOrder: [],
        teams: {},
        byes: [],
        series: [],
        leagueMatches: [],
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

    case 'TEAMS_BATCH_ASSIGNED': {
      // RF-52: Batch assignment from automatic team draw
      if (!state.activeTournament || state.activeTournament.phase !== 'draft') {
        console.warn('[Reducer] Cannot batch assign teams outside draft phase.');
        return state;
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          teams: {
            ...state.activeTournament.teams,
            ...action.teams,
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
          action.value,
          state.activeTournament.matchFormat ?? 'two_legged'
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
          action.seriesId,
          state.activeTournament.matchFormat ?? 'two_legged'
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
          action.seriesId,
          state.activeTournament.matchFormat ?? 'two_legged'
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

    case 'LEAGUE_GENERATED': {
      if (!state.activeTournament) {
        console.warn('[Reducer] No active tournament to set league.');
        return state;
      }
      if (
        state.activeTournament.leagueMatches &&
        state.activeTournament.leagueMatches.length > 0
      ) {
        console.warn('[Reducer] League fixture already generated.');
        return state;
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          phase: 'league',
          leagueMatches: action.matches,
        },
      };
    }

    case 'LEAGUE_MATCH_SCORE_SET': {
      if (
        !state.activeTournament ||
        state.activeTournament.phase !== 'league' ||
        !state.activeTournament.leagueMatches
      ) {
        return state;
      }

      try {
        const updated = setLeagueMatchScore(
          state.activeTournament.leagueMatches,
          action.matchId,
          action.scoreA,
          action.scoreB
        );
        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            leagueMatches: updated,
          },
        };
      } catch (err) {
        console.error('[Reducer] Error setting league match score:', err);
        return state;
      }
    }

    case 'LEAGUE_MATCH_CONFIRMED': {
      if (
        !state.activeTournament ||
        state.activeTournament.phase !== 'league' ||
        !state.activeTournament.leagueMatches
      ) {
        return state;
      }

      try {
        const updated = confirmLeagueMatch(
          state.activeTournament.leagueMatches,
          action.matchId
        );
        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            leagueMatches: updated,
          },
        };
      } catch (err) {
        console.error('[Reducer] Error confirming league match:', err);
        return state;
      }
    }

    case 'LEAGUE_MATCH_EDIT_REQUESTED': {
      if (
        !state.activeTournament ||
        state.activeTournament.phase !== 'league' ||
        !state.activeTournament.leagueMatches
      ) {
        return state;
      }

      try {
        const updated = reopenLeagueMatch(
          state.activeTournament.leagueMatches,
          action.matchId
        );
        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            leagueMatches: updated,
          },
        };
      } catch (err) {
        console.error('[Reducer] Error reopening league match:', err);
        return state;
      }
    }

    case 'TOURNAMENT_FINISHED': {
      if (!state.activeTournament) {
        console.warn('[Reducer] Cannot finish tournament: no active tournament.');
        return state;
      }

      if (state.activeTournament.phase === 'bracket') {
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
            tournamentType: 'bracket',
            matchFormat: state.activeTournament.matchFormat ?? 'two_legged',
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
          console.error('[Reducer] Error finalizing bracket tournament:', err);
          return state;
        }
      }

      if (state.activeTournament.phase === 'league') {
        const matches = state.activeTournament.leagueMatches ?? [];
        if (!isLeagueComplete(matches)) {
          console.warn('[Reducer] Cannot finish league tournament: all matches must be confirmed.');
          return state;
        }

        try {
          const { stats: deltas, podium } = computeLeagueTournamentStats(
            state.activeTournament.participantIds,
            matches,
            state.activeTournament.teams,
            state.players
          );
          const updatedStats = applyStats(state.stats, deltas);

          const summary: TournamentSummary = {
            id: action.summaryId,
            finishedAt: action.now,
            theme: state.activeTournament.theme ?? 'Sin temática',
            tournamentType: 'league',
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
            activeTournament: null, // RF-33 / RF-55
          };
        } catch (err) {
          console.error('[Reducer] Error finalizing league tournament:', err);
          return state;
        }
      }

      console.warn('[Reducer] Cannot finish tournament: tournament is neither in bracket nor league phase.');
      return state;
    }

    case 'TOURNAMENT_ABANDONED': {
      // RF-44: Abandons active tournament without touching stats or history
      return {
        ...state,
        activeTournament: null,
      };
    }

    case 'CUSTOM_THEME_ADDED': {
      try {
        const currentCustom = state.customThemes ?? [];
        const updatedCustom = addCustomTheme(currentCustom, action.theme);
        return {
          ...state,
          customThemes: updatedCustom,
        };
      } catch (err) {
        console.warn('[Reducer] Error adding custom theme:', err);
        return state;
      }
    }

    default:
      return state;
  }
}

import {
  isDuplicatePlayer,
  removePlayer,
} from '../domain/players';
import { addCustomTheme } from '../domain/theme';
import {
  computeLeagueTable,
  confirmLeagueMatch,
  computeLeagueTournamentStats,
  isLeagueComplete,
  reopenLeagueMatch,
  setLeagueMatchScore,
} from '../domain/league';
import {
  computeAllGroupStandings,
  generateGroupPlayoffs,
  isGroupStageComplete,
} from '../domain/groupStage';
import { generatePlayoffsBracketFromStandings } from '../domain/leaguePlayoffs';
import {
  advanceDoubleEliminationSeries,
  computeDoubleEliminationTournamentStats,
  createGrandFinalResetSeries,
  generateDoubleEliminationBracketFromOrder,
  isDoubleEliminationComplete,
} from '../domain/doubleElimination';
import { generateBracketFromOrder } from '../domain/bracket';
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
import {
  applyWalkoverToSeries,
  applyWalkoverToTournament,
  isMatchLockedByWalkover,
  resolvePendingWalkoverSeries,
} from '../domain/walkover';
import {
  computeAnnualRanking,
  updateHeadToHead,
} from '../domain/awardsAndRankings';
import type {
  ActiveTournament,
  GroupId,
  GroupMatch,
  LeagueMatch,
  MatchFormat,
  PlayerStats,
  Series,
  SeriesId,
  TournamentPhase,
  TournamentSummary,
  TournamentType,
} from '../domain/types';
import type { AppData } from '../storage/schema';
import type { Action } from './actions';

/**
 * Finalizes tournament state atomically, updating stats, history, H2H and Annual Rankings (RF-31, RF-33, RF-76, RF-78).
 */
function finalizeTournamentState(
  state: AppData,
  updatedStats: Record<string, PlayerStats>,
  summary: TournamentSummary,
  tournamentMatches: readonly (LeagueMatch | Series | GroupMatch)[]
): AppData {
  // 1. Calculate cards across all matches in this tournament
  const tournamentCards: Record<string, { yellow: number; red: number }> = {};
  for (const m of tournamentMatches) {
    if ('leg1' in m) {
      if (m.playerA) {
        tournamentCards[m.playerA] = tournamentCards[m.playerA] ?? { yellow: 0, red: 0 };
        tournamentCards[m.playerA].yellow += (m.leg1?.cardsA?.yellow ?? 0) + (m.leg2?.cardsA?.yellow ?? 0);
        tournamentCards[m.playerA].red += (m.leg1?.cardsA?.red ?? 0) + (m.leg2?.cardsA?.red ?? 0);
      }
      if (m.playerB) {
        tournamentCards[m.playerB] = tournamentCards[m.playerB] ?? { yellow: 0, red: 0 };
        tournamentCards[m.playerB].yellow += (m.leg1?.cardsB?.yellow ?? 0) + (m.leg2?.cardsB?.yellow ?? 0);
        tournamentCards[m.playerB].red += (m.leg1?.cardsB?.red ?? 0) + (m.leg2?.cardsB?.red ?? 0);
      }
    } else {
      if (m.playerA) {
        tournamentCards[m.playerA] = tournamentCards[m.playerA] ?? { yellow: 0, red: 0 };
        tournamentCards[m.playerA].yellow += m.cardsA?.yellow ?? 0;
        tournamentCards[m.playerA].red += m.cardsA?.red ?? 0;
      }
      if (m.playerB) {
        tournamentCards[m.playerB] = tournamentCards[m.playerB] ?? { yellow: 0, red: 0 };
        tournamentCards[m.playerB].yellow += m.cardsB?.yellow ?? 0;
        tournamentCards[m.playerB].red += m.cardsB?.red ?? 0;
      }
    }
  }

  // 2. Consolidate cards and podium count in accumulated stats
  const finalStats: Record<string, PlayerStats> = { ...updatedStats };
  const podiumSet = new Set([summary.podium.champion, summary.podium.runnerUp, summary.podium.third]);

  for (const [pId, stat] of Object.entries(finalStats)) {
    const cards = tournamentCards[pId] ?? { yellow: 0, red: 0 };
    finalStats[pId] = {
      ...stat,
      yellowCards: (state.stats[pId]?.yellowCards ?? 0) + cards.yellow,
      redCards: (state.stats[pId]?.redCards ?? 0) + cards.red,
      podiums: (state.stats[pId]?.podiums ?? 0) + (podiumSet.has(pId) ? 1 : 0),
    };
  }

  const summaryWithCards: TournamentSummary = {
    ...summary,
    cards: tournamentCards,
  };

  const updatedHistory = [summaryWithCards, ...state.history];
  const updatedH2H = updateHeadToHead(state.headToHead, tournamentMatches);
  const finishDate = new Date(summary.finishedAt);
  const year = isNaN(finishDate.getFullYear())
    ? parseInt(summary.finishedAt.slice(0, 4), 10) || new Date().getFullYear()
    : finishDate.getFullYear();
  const yearKey = String(year);

  const updatedAnnualRankings = {
    ...(state.annualRankings ?? {}),
    [yearKey]: computeAnnualRanking(updatedHistory, yearKey),
  };

  return {
    ...state,
    stats: finalStats,
    history: updatedHistory,
    headToHead: updatedH2H,
    annualRankings: updatedAnnualRankings,
    activeTournament: null, // RF-33: Active tournament cleared atomically
  };
}

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
          state.activeTournament.phase === 'league' ||
          state.activeTournament.phase === 'group_stage' ||
          state.activeTournament.phase === 'group_playoffs' ||
          state.activeTournament.phase === 'league_playoffs' ||
          state.activeTournament.phase === 'double_elimination') &&
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
      // RF-47: Clears all historical accumulated stats, H2H records, annual rankings and tournament history atomically
      return {
        ...state,
        stats: resetStandings(),
        history: [],
        headToHead: {},
        annualRankings: {},
      };
    }

    case 'PARTICIPANTS_SET': {
      // Guard (RF-45): Cannot change participants while tournament is in active phases
      if (
        state.activeTournament &&
        (state.activeTournament.phase === 'draft' ||
          state.activeTournament.phase === 'bracket' ||
          state.activeTournament.phase === 'league' ||
          state.activeTournament.phase === 'group_stage' ||
          state.activeTournament.phase === 'group_playoffs' ||
          state.activeTournament.phase === 'league_playoffs' ||
          state.activeTournament.phase === 'double_elimination')
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
        qualifyingSpots: action.qualifyingSpots,
        participantIds: action.participantIds,
        theme: null,
        draftOrder: [],
        teams: {},
        byes: [],
        series: [],
        leagueMatches: [],
        groupMatches: [],
        walkoverPlayerIds: [],
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
          bracketOrder: action.bracketOrder,
        },
      };
    }

    case 'BRACKET_MATCHUPS_MANUALLY_SET': {
      if (!state.activeTournament || state.activeTournament.phase !== 'bracket') {
        console.warn(
          '[Reducer] Cannot manually set bracket matchups outside bracket phase.'
        );
        return state;
      }

      const hasStarted = state.activeTournament.series.some(
        (s) =>
          s.confirmed ||
          s.leg1.a !== null ||
          s.leg1.b !== null ||
          s.leg2.a !== null ||
          s.leg2.b !== null
      );
      if (hasStarted) {
        console.warn(
          '[Reducer] Cannot manually set bracket matchups once matches have started (RF-87).'
        );
        return state;
      }

      try {
        const generated = generateBracketFromOrder(action.orderedParticipantIds);
        let series = generated.series;
        const byes = generated.byes;

        if (
          state.activeTournament.walkoverPlayerIds &&
          state.activeTournament.walkoverPlayerIds.length > 0
        ) {
          for (const woId of state.activeTournament.walkoverPlayerIds) {
            series = applyWalkoverToSeries(
              series,
              woId,
              state.activeTournament.matchFormat ?? 'two_legged',
              state.activeTournament.walkoverPlayerIds
            );
          }
        }

        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            series,
            byes,
            bracketOrder: action.orderedParticipantIds,
          },
        };
      } catch (err) {
        console.warn('[Reducer] Error setting manual bracket matchups:', err);
        return state;
      }
    }

    case 'LEG_SCORE_SET': {
      const isKnockoutPhase =
        state.activeTournament &&
        (state.activeTournament.phase === 'bracket' ||
          state.activeTournament.phase === 'group_playoffs' ||
          state.activeTournament.phase === 'league_playoffs' ||
          state.activeTournament.phase === 'double_elimination');

      if (!state.activeTournament || !isKnockoutPhase) {
        return state;
      }

      const targetSeries = state.activeTournament.series.find(
        (s) => s.id === action.seriesId
      );
      if (
        targetSeries &&
        isMatchLockedByWalkover(
          targetSeries,
          state.activeTournament.walkoverPlayerIds
        )
      ) {
        console.warn(
          '[Reducer] Cannot edit scores of a series locked by walkover (RF-66).'
        );
        return state;
      }

      try {
        const updatedSeries = setLegScore(
          state.activeTournament.series,
          action.seriesId,
          action.leg,
          action.side,
          action.value,
          state.activeTournament.matchFormat ?? 'two_legged',
          action.cards
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
      const isKnockoutPhase =
        state.activeTournament &&
        (state.activeTournament.phase === 'bracket' ||
          state.activeTournament.phase === 'group_playoffs' ||
          state.activeTournament.phase === 'league_playoffs' ||
          state.activeTournament.phase === 'double_elimination');

      if (!state.activeTournament || !isKnockoutPhase) {
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
      const isKnockoutPhase =
        state.activeTournament &&
        (state.activeTournament.phase === 'bracket' ||
          state.activeTournament.phase === 'group_playoffs' ||
          state.activeTournament.phase === 'league_playoffs' ||
          state.activeTournament.phase === 'double_elimination');

      if (!state.activeTournament || !isKnockoutPhase) {
        return state;
      }

      try {
        let updatedSeries =
          state.activeTournament.phase === 'double_elimination'
            ? advanceDoubleEliminationSeries(
                state.activeTournament.series,
                action.seriesId,
                state.activeTournament.matchFormat ?? 'two_legged'
              )
            : confirmSeries(
                state.activeTournament.series,
                action.seriesId,
                state.activeTournament.matchFormat ?? 'two_legged'
              );

        if (
          state.activeTournament.walkoverPlayerIds &&
          state.activeTournament.walkoverPlayerIds.length > 0
        ) {
          updatedSeries = resolvePendingWalkoverSeries(
            updatedSeries,
            state.activeTournament.walkoverPlayerIds,
            state.activeTournament.matchFormat ?? 'two_legged'
          );
        }

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
      const isKnockoutPhase =
        state.activeTournament &&
        (state.activeTournament.phase === 'bracket' ||
          state.activeTournament.phase === 'group_playoffs' ||
          state.activeTournament.phase === 'league_playoffs' ||
          state.activeTournament.phase === 'double_elimination');

      if (!state.activeTournament || !isKnockoutPhase) {
        return state;
      }

      const target = state.activeTournament.series.find(
        (s) => s.id === action.seriesId
      );
      if (
        target &&
        isMatchLockedByWalkover(
          target,
          state.activeTournament.walkoverPlayerIds
        )
      ) {
        console.warn(
          '[Reducer] Cannot reopen a series locked by walkover (RF-66).'
        );
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

      const targetMatch = state.activeTournament.leagueMatches.find(
        (m) => m.id === action.matchId
      );
      if (
        targetMatch &&
        isMatchLockedByWalkover(
          targetMatch,
          state.activeTournament.walkoverPlayerIds
        )
      ) {
        console.warn(
          '[Reducer] Cannot edit scores of a match locked by walkover (RF-66).'
        );
        return state;
      }

      try {
        const updated = setLeagueMatchScore(
          state.activeTournament.leagueMatches,
          action.matchId,
          action.scoreA,
          action.scoreB,
          action.cardsA,
          action.cardsB
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

      const targetMatch = state.activeTournament.leagueMatches.find(
        (m) => m.id === action.matchId
      );
      if (
        targetMatch &&
        isMatchLockedByWalkover(
          targetMatch,
          state.activeTournament.walkoverPlayerIds
        )
      ) {
        console.warn(
          '[Reducer] Cannot reopen a match locked by walkover (RF-66).'
        );
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

    case 'GROUP_STAGE_GENERATED': {
      if (!state.activeTournament) {
        console.warn('[Reducer] No active tournament to generate group stage.');
        return state;
      }
      if (state.activeTournament.phase !== 'draft') {
        console.warn(
          '[Reducer] Group stage can only be generated after draft phase.'
        );
        return state;
      }
      if (
        state.activeTournament.groupMatches &&
        state.activeTournament.groupMatches.length > 0
      ) {
        console.warn(
          '[Reducer] Group stage already generated for this tournament.'
        );
        return state;
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          phase: 'group_stage',
          groups: action.groups,
          groupMatches: action.matches,
        },
      };
    }

    case 'GROUP_MATCH_SCORE_SET': {
      if (
        !state.activeTournament ||
        state.activeTournament.phase !== 'group_stage' ||
        !state.activeTournament.groupMatches
      ) {
        return state;
      }

      const targetMatch = state.activeTournament.groupMatches.find(
        (m) => m.id === action.matchId
      );
      if (
        targetMatch &&
        isMatchLockedByWalkover(
          targetMatch,
          state.activeTournament.walkoverPlayerIds
        )
      ) {
        console.warn(
          '[Reducer] Cannot edit scores of a match locked by walkover (RF-66).'
        );
        return state;
      }

      try {
        const updated = setLeagueMatchScore(
          state.activeTournament.groupMatches,
          action.matchId,
          action.scoreA,
          action.scoreB,
          action.cardsA,
          action.cardsB
        ) as GroupMatch[];

        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            groupMatches: updated,
          },
        };
      } catch (err) {
        console.error('[Reducer] Error updating group match score:', err);
        return state;
      }
    }

    case 'GROUP_MATCH_CONFIRMED': {
      if (
        !state.activeTournament ||
        state.activeTournament.phase !== 'group_stage' ||
        !state.activeTournament.groupMatches
      ) {
        return state;
      }

      try {
        const updated = confirmLeagueMatch(
          state.activeTournament.groupMatches,
          action.matchId
        ) as GroupMatch[];

        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            groupMatches: updated,
          },
        };
      } catch (err) {
        console.error('[Reducer] Error confirming group match:', err);
        return state;
      }
    }

    case 'GROUP_MATCH_EDIT_REQUESTED': {
      if (
        !state.activeTournament ||
        state.activeTournament.phase !== 'group_stage' ||
        !state.activeTournament.groupMatches
      ) {
        return state;
      }

      const targetMatch = state.activeTournament.groupMatches.find(
        (m) => m.id === action.matchId
      );
      if (
        targetMatch &&
        isMatchLockedByWalkover(
          targetMatch,
          state.activeTournament.walkoverPlayerIds
        )
      ) {
        console.warn(
          '[Reducer] Cannot reopen a match locked by walkover (RF-66).'
        );
        return state;
      }

      try {
        const updated = reopenLeagueMatch(
          state.activeTournament.groupMatches,
          action.matchId
        ) as GroupMatch[];

        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            groupMatches: updated,
          },
        };
      } catch (err) {
        console.error('[Reducer] Error reopening group match:', err);
        return state;
      }
    }

    case 'GROUP_PLAYOFFS_STARTED': {
      if (!state.activeTournament) {
        console.warn('[Reducer] No active tournament to start group playoffs.');
        return state;
      }
      if (state.activeTournament.phase !== 'group_stage') {
        console.warn(
          '[Reducer] Group playoffs can only start from group_stage phase.'
        );
        return state;
      }
      const groupMatches = state.activeTournament.groupMatches ?? [];
      if (!isGroupStageComplete(groupMatches)) {
        console.warn(
          '[Reducer] Cannot start group playoffs: all group matches must be confirmed.'
        );
        return state;
      }

      let series = action.series;
      if (!series || series.length === 0) {
        const groups = state.activeTournament.groups ?? {};
        const standings = computeAllGroupStandings(
          groupMatches,
          groups,
          state.activeTournament.teams,
          state.players
        );
        series = generateGroupPlayoffs(standings);
      }

      // If any participant has abandoned, apply walkover resolution
      if (
        state.activeTournament.walkoverPlayerIds &&
        state.activeTournament.walkoverPlayerIds.length > 0
      ) {
        for (const woId of state.activeTournament.walkoverPlayerIds) {
          series = applyWalkoverToSeries(
            series,
            woId,
            state.activeTournament.matchFormat ?? 'two_legged',
            state.activeTournament.walkoverPlayerIds
          );
        }
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          phase: 'group_playoffs',
          series,
        },
      };
    }

    case 'LEAGUE_PLAYOFFS_STARTED': {
      if (!state.activeTournament) {
        console.warn('[Reducer] No active tournament to start league playoffs.');
        return state;
      }
      if (state.activeTournament.phase !== 'league') {
        console.warn(
          '[Reducer] League playoffs can only start from league phase.'
        );
        return state;
      }
      const leagueMatches = state.activeTournament.leagueMatches ?? [];
      if (!isLeagueComplete(leagueMatches)) {
        console.warn(
          '[Reducer] Cannot start league playoffs: all regular league matches must be confirmed.'
        );
        return state;
      }

      let series = action.series;
      if (!series || series.length === 0) {
        const standings = computeLeagueTable(
          leagueMatches,
          state.activeTournament.participantIds,
          state.activeTournament.teams,
          state.players
        );
        series = generatePlayoffsBracketFromStandings(
          standings,
          state.activeTournament.qualifyingSpots
        );
      }

      // If any participant has abandoned, apply walkover resolution
      if (
        state.activeTournament.walkoverPlayerIds &&
        state.activeTournament.walkoverPlayerIds.length > 0
      ) {
        for (const woId of state.activeTournament.walkoverPlayerIds) {
          series = applyWalkoverToSeries(
            series,
            woId,
            state.activeTournament.matchFormat ?? 'two_legged',
            state.activeTournament.walkoverPlayerIds
          );
        }
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          phase: 'league_playoffs',
          series,
        },
      };
    }

    case 'DOUBLE_ELIMINATION_GENERATED': {
      if (!state.activeTournament) {
        console.warn(
          '[Reducer] No active tournament to set double elimination bracket.'
        );
        return state;
      }
      // Guard (RF-20): Once generated, bracket cannot be regenerated in the active tournament
      if (state.activeTournament.series.length > 0) {
        console.warn(
          '[Reducer] Double elimination bracket already generated for this tournament (RF-20).'
        );
        return state;
      }

      let series = action.bracket?.series ?? action.series ?? [];
      const byes = action.bracket?.byes ?? action.byes ?? [];

      if (
        state.activeTournament.walkoverPlayerIds &&
        state.activeTournament.walkoverPlayerIds.length > 0
      ) {
        for (const woId of state.activeTournament.walkoverPlayerIds) {
          series = applyWalkoverToSeries(
            series,
            woId,
            state.activeTournament.matchFormat ?? 'two_legged',
            state.activeTournament.walkoverPlayerIds
          );
        }
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          phase: 'double_elimination',
          series,
          byes,
          bracketOrder: action.bracket?.shuffledOrder,
        },
      };
    }

    case 'DOUBLE_ELIMINATION_MATCH_CONFIRMED': {
      if (
        !state.activeTournament ||
        state.activeTournament.phase !== 'double_elimination'
      ) {
        console.warn(
          '[Reducer] Cannot confirm double elimination match outside double_elimination phase.'
        );
        return state;
      }

      const targetSeries = state.activeTournament.series.find(
        (s) => s.id === action.seriesId
      );
      if (
        targetSeries &&
        isMatchLockedByWalkover(
          targetSeries,
          state.activeTournament.walkoverPlayerIds
        )
      ) {
        console.warn(
          '[Reducer] Cannot edit scores of a series locked by walkover (RF-66).'
        );
        return state;
      }

      try {
        let updatedSeries = advanceDoubleEliminationSeries(
          state.activeTournament.series,
          action.seriesId as SeriesId,
          state.activeTournament.matchFormat ?? 'two_legged'
        );

        if (
          state.activeTournament.walkoverPlayerIds &&
          state.activeTournament.walkoverPlayerIds.length > 0
        ) {
          updatedSeries = resolvePendingWalkoverSeries(
            updatedSeries,
            state.activeTournament.walkoverPlayerIds,
            state.activeTournament.matchFormat ?? 'two_legged'
          );
        }

        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            series: updatedSeries,
          },
        };
      } catch (err) {
        console.error(
          '[Reducer] Error confirming double elimination series:',
          err
        );
        return state;
      }
    }

    case 'DOUBLE_ELIMINATION_RESET_TRIGGERED': {
      if (
        !state.activeTournament ||
        state.activeTournament.phase !== 'double_elimination'
      ) {
        console.warn(
          '[Reducer] Cannot trigger grand final reset outside double_elimination phase.'
        );
        return state;
      }

      const gf1 = state.activeTournament.series.find((s) => s.id === 'GF1');
      if (
        !gf1 ||
        !gf1.confirmed ||
        !gf1.winner ||
        !gf1.playerA ||
        !gf1.playerB
      ) {
        console.warn('[Reducer] Cannot trigger reset: GF1 is not confirmed.');
        return state;
      }

      const wbChampion = gf1.playerA;
      const lbChampion = gf1.playerB;

      // Reset is only triggered if LB champion won GF1
      if (gf1.winner !== lbChampion) {
        console.warn('[Reducer] Reset not required: WB champion won GF1.');
        return state;
      }

      const existingGf2 = state.activeTournament.series.find(
        (s) => s.id === 'GF2'
      );
      let updatedSeries = state.activeTournament.series;

      if (existingGf2) {
        updatedSeries = updatedSeries.map((s) =>
          s.id === 'GF2'
            ? { ...s, playerA: wbChampion, playerB: lbChampion }
            : s
        );
      } else {
        const newGf2 = createGrandFinalResetSeries(wbChampion, lbChampion);
        updatedSeries = [...updatedSeries, newGf2];
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          series: updatedSeries,
        },
      };
    }

    case 'DOUBLE_ELIMINATION_MATCHUPS_MANUALLY_SET': {
      if (
        !state.activeTournament ||
        state.activeTournament.phase !== 'double_elimination'
      ) {
        console.warn(
          '[Reducer] Cannot manually set double elimination matchups outside double_elimination phase.'
        );
        return state;
      }

      const hasStarted = state.activeTournament.series.some(
        (s) =>
          s.confirmed ||
          s.leg1.a !== null ||
          s.leg1.b !== null ||
          s.leg2.a !== null ||
          s.leg2.b !== null
      );
      if (hasStarted) {
        console.warn(
          '[Reducer] Cannot manually set double elimination matchups once matches have started (RF-87).'
        );
        return state;
      }

      try {
        const bracket = generateDoubleEliminationBracketFromOrder(
          action.orderedParticipantIds
        );
        let series = bracket.series;
        const byes = bracket.byes;

        if (
          state.activeTournament.walkoverPlayerIds &&
          state.activeTournament.walkoverPlayerIds.length > 0
        ) {
          for (const woId of state.activeTournament.walkoverPlayerIds) {
            series = applyWalkoverToSeries(
              series,
              woId,
              state.activeTournament.matchFormat ?? 'two_legged',
              state.activeTournament.walkoverPlayerIds
            );
          }
        }

        return {
          ...state,
          activeTournament: {
            ...state.activeTournament,
            series,
            byes,
            bracketOrder: action.orderedParticipantIds,
          },
        };
      } catch (err) {
        console.warn(
          '[Reducer] Error setting manual double elimination matchups:',
          err
        );
        return state;
      }
    }

    case 'TOURNAMENT_FINISHED': {
      if (!state.activeTournament) {
        console.warn('[Reducer] Cannot finish tournament: no active tournament.');
        return state;
      }

      if (
        state.activeTournament.phase === 'bracket' ||
        state.activeTournament.phase === 'group_playoffs' ||
        state.activeTournament.phase === 'league_playoffs'
      ) {
        if (!isBracketComplete(state.activeTournament.series)) {
          console.warn('[Reducer] Cannot finish tournament: Final and Third place must be confirmed.');
          return state;
        }

        try {
          const { stats: deltas, podium } = computeTournamentStats(
            state.activeTournament
          );
          const updatedStats = applyStats(state.stats, deltas);

          const defaultType: TournamentType =
            state.activeTournament.phase === 'group_playoffs'
              ? 'group_stage'
              : state.activeTournament.phase === 'league_playoffs'
                ? 'league_playoffs'
                : 'bracket';

          const summary: TournamentSummary = {
            id: action.summaryId,
            finishedAt: action.now,
            theme: state.activeTournament.theme ?? 'Sin temática',
            tournamentType: state.activeTournament.tournamentType ?? defaultType,
            matchFormat: state.activeTournament.matchFormat ?? 'two_legged',
            participants: state.activeTournament.participantIds.map((id) => ({
              playerId: id,
              team: state.activeTournament?.teams[id] ?? '',
            })),
            podium,
          };

          const tournamentMatches = [
            ...(state.activeTournament.leagueMatches ?? []),
            ...(state.activeTournament.groupMatches ?? []),
            ...(state.activeTournament.series ?? []),
          ];

          return finalizeTournamentState(
            state,
            updatedStats,
            summary,
            tournamentMatches
          );
        } catch (err) {
          console.error('[Reducer] Error finalizing tournament with playoffs:', err);
          return state;
        }
      }

      if (state.activeTournament.phase === 'double_elimination') {
        const matchFormat = state.activeTournament.matchFormat ?? 'two_legged';
        if (
          !isDoubleEliminationComplete(
            state.activeTournament.series,
            matchFormat
          )
        ) {
          console.warn(
            '[Reducer] Cannot finish tournament: Double elimination tournament is not complete.'
          );
          return state;
        }

        try {
          const { stats: deltas, podium } =
            computeDoubleEliminationTournamentStats(state.activeTournament);
          const updatedStats = applyStats(state.stats, deltas);

          const summary: TournamentSummary = {
            id: action.summaryId,
            finishedAt: action.now,
            theme: state.activeTournament.theme ?? 'Sin temática',
            tournamentType: 'double_elimination',
            matchFormat,
            participants: state.activeTournament.participantIds.map((id) => ({
              playerId: id,
              team: state.activeTournament?.teams[id] ?? '',
            })),
            podium,
          };

          const tournamentMatches = [...(state.activeTournament.series ?? [])];

          return finalizeTournamentState(
            state,
            updatedStats,
            summary,
            tournamentMatches
          );
        } catch (err) {
          console.error(
            '[Reducer] Error finalizing double elimination tournament:',
            err
          );
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

          const tournamentMatches = [...(state.activeTournament.leagueMatches ?? [])];

          return finalizeTournamentState(
            state,
            updatedStats,
            summary,
            tournamentMatches
          );
        } catch (err) {
          console.error('[Reducer] Error finalizing league tournament:', err);
          return state;
        }
      }

      console.warn('[Reducer] Cannot finish tournament: tournament is not in a finalizable phase.');
      return state;
    }

    case 'TOURNAMENT_ABANDONED': {
      // RF-44: Abandons active tournament without touching stats or history
      return {
        ...state,
        activeTournament: null,
      };
    }

    case 'PLAYER_WALKOVER_DECLARED': {
      if (!state.activeTournament) {
        console.warn('[Reducer] Cannot declare walkover: no active tournament.');
        return state;
      }

      try {
        const updatedTournament = applyWalkoverToTournament(
          state.activeTournament,
          action.playerId
        );
        if (action.matches) {
          (updatedTournament as any).matches = action.matches;
        }
        return {
          ...state,
          activeTournament: updatedTournament,
        };
      } catch (err) {
        console.warn('[Reducer] Error declaring walkover:', err);
        return state;
      }
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

    case 'MATCH_CLOSED_EVENT_RECEIVED': {
      if (!state.activeTournament) return state;

      const { matchId, seriesId, match } = action;
      let updatedLeagueMatches = state.activeTournament.leagueMatches;
      let updatedGroupMatches = state.activeTournament.groupMatches;
      let updatedSeries = state.activeTournament.series;
      let updatedMatches = state.activeTournament.matches;

      // 1. Update League match if present
      if (updatedLeagueMatches) {
        updatedLeagueMatches = updatedLeagueMatches.map((m) => {
          if (m.id === matchId || m.id === seriesId) {
            return {
              ...m,
              scoreA: match?.homeScore !== undefined ? match.homeScore : m.scoreA,
              scoreB: match?.awayScore !== undefined ? match.awayScore : m.scoreB,
              cardsA: match
                ? { yellow: match.homeYellowCards ?? 0, red: match.homeRedCards ?? 0 }
                : m.cardsA,
              cardsB: match
                ? { yellow: match.awayYellowCards ?? 0, red: match.awayRedCards ?? 0 }
                : m.cardsB,
              confirmed: true,
              status: 'CLOSED' as const,
              version: match?.version ?? (m.version ? m.version + 1 : 2),
            };
          }
          return m;
        });
      }

      // 2. Update Group match if present
      if (updatedGroupMatches) {
        updatedGroupMatches = updatedGroupMatches.map((m) => {
          if (m.id === matchId || m.id === seriesId) {
            return {
              ...m,
              scoreA: match?.homeScore !== undefined ? match.homeScore : m.scoreA,
              scoreB: match?.awayScore !== undefined ? match.awayScore : m.scoreB,
              cardsA: match
                ? { yellow: match.homeYellowCards ?? 0, red: match.homeRedCards ?? 0 }
                : m.cardsA,
              cardsB: match
                ? { yellow: match.awayYellowCards ?? 0, red: match.awayRedCards ?? 0 }
                : m.cardsB,
              confirmed: true,
              status: 'CLOSED' as const,
              version: match?.version ?? (m.version ? m.version + 1 : 2),
            };
          }
          return m;
        });
      }

      // 3. Update Series if present
      if (updatedSeries) {
        updatedSeries = updatedSeries.map((s) => {
          if (s.id === seriesId || s.id === matchId) {
            const isLeg1 = !match || match.leg === 1 || !match.leg;
            const updatedLeg1 = isLeg1 && match
              ? {
                  ...s.leg1,
                  a: match.homeScore !== undefined ? match.homeScore : s.leg1.a,
                  b: match.awayScore !== undefined ? match.awayScore : s.leg1.b,
                  cardsA: { yellow: match.homeYellowCards ?? 0, red: match.homeRedCards ?? 0 },
                  cardsB: { yellow: match.awayYellowCards ?? 0, red: match.awayRedCards ?? 0 },
                }
              : s.leg1;
            const updatedLeg2 = match && match.leg === 2
              ? {
                  ...s.leg2,
                  b: match.homeScore !== undefined ? match.homeScore : s.leg2.b,
                  a: match.awayScore !== undefined ? match.awayScore : s.leg2.a,
                  cardsB: { yellow: match.homeYellowCards ?? 0, red: match.homeRedCards ?? 0 },
                  cardsA: { yellow: match.awayYellowCards ?? 0, red: match.awayRedCards ?? 0 },
                }
              : s.leg2;
            const isSingle = state.activeTournament?.matchFormat === 'single_match';
            const shouldConfirm = isSingle || match?.leg === 2 || !match;

            return {
              ...s,
              leg1: updatedLeg1,
              leg2: updatedLeg2,
              penaltyWinner: match?.penaltiesWinnerId ?? s.penaltyWinner,
              confirmed: shouldConfirm ? true : s.confirmed,
              status: shouldConfirm ? ('CLOSED' as const) : s.status,
              version: match?.version ?? (s.version ? s.version + 1 : 2),
            };
          }
          return s;
        });
      }

      // 4. Update raw tournament matches array if present
      if (updatedMatches) {
        updatedMatches = updatedMatches.map((m) => {
          if (m.id === matchId || (seriesId && (m as any).seriesId === seriesId)) {
            return {
              ...m,
              status: 'CLOSED' as const,
              version: match?.version ?? (m.version + 1),
              homeScore: match?.homeScore !== undefined ? match.homeScore : m.homeScore,
              awayScore: match?.awayScore !== undefined ? match.awayScore : m.awayScore,
            };
          }
          return m;
        });
      }

      return {
        ...state,
        activeTournament: {
          ...state.activeTournament,
          leagueMatches: updatedLeagueMatches,
          groupMatches: updatedGroupMatches,
          series: updatedSeries,
          matches: updatedMatches,
        },
      };
    }

    case 'HYDRATE_TOURNAMENT': {
      if (!action.payload) return state;
      const hydrated = buildActiveTournamentFromPayload(action.payload);
      if (!hydrated) return state;

      // Ensure all participants from payload are registered in state.players
      const newPlayers = [...state.players];
      if (Array.isArray(action.payload.participants)) {
        for (const part of action.payload.participants) {
          const pId = part.playerId || part.player?.id || part.id;
          if (pId && !newPlayers.some((p) => p.id === pId)) {
            newPlayers.push({
              id: pId,
              firstName: part.player?.firstName || part.name?.split(' ')[0] || 'Jugador',
              lastName: part.player?.lastName || part.name?.split(' ').slice(1).join(' ') || '',
              createdAt: new Date().toISOString(),
            });
          }
        }
      }

      return {
        ...state,
        players: newPlayers,
        activeTournament: hydrated,
      };
    }

    default:
      return state;
  }
}

/**
 * Builds an ActiveTournament domain object from a server/database tournament payload.
 */
export function buildActiveTournamentFromPayload(payload: any): ActiveTournament | null {
  if (!payload || !payload.id) return null;

  const rawFormat = (payload.format || payload.tournamentType || 'BRACKET').toUpperCase();
  let tournamentType: TournamentType = 'bracket';
  if (rawFormat === 'LEAGUE') tournamentType = 'league';
  else if (rawFormat === 'GROUP_STAGE') tournamentType = 'group_stage';
  else if (rawFormat === 'LEAGUE_PLAYOFFS') tournamentType = 'league_playoffs';
  else if (rawFormat === 'DOUBLE_ELIMINATION') tournamentType = 'double_elimination';

  const rawMatchFormat = (payload.matchFormat || 'SINGLE_MATCH').toUpperCase();
  const matchFormat: MatchFormat = rawMatchFormat === 'TWO_LEGGED' ? 'two_legged' : 'single_match';

  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  const participantIds: string[] = participants
    .map((p: any) => p.playerId || p.player?.id || p.id)
    .filter(Boolean);

  const teams: Record<string, string> = {};
  for (const p of participants) {
    const id = p.playerId || p.player?.id || p.id;
    if (id) {
      teams[id] = p.team || p.teamName || '';
    }
  }

  const draftOrder: string[] = [...participants]
    .sort((a: any, b: any) => (a.seed ?? 999) - (b.seed ?? 999))
    .map((p: any) => p.playerId || p.player?.id || p.id)
    .filter(Boolean);

  const rawMatches = Array.isArray(payload.matches) ? payload.matches : [];

  const byes: string[] = rawMatches
    .filter((m: any) => m.isBye)
    .map((m: any) => m.homeParticipant?.playerId || m.homeParticipant?.player?.id || m.homeParticipantId)
    .filter(Boolean);

  const seriesMap = new Map<string, any>();
  const leagueMatches: LeagueMatch[] = [];
  const groupMatches: GroupMatch[] = [];

  for (const m of rawMatches) {
    const seriesId = m.seriesId || m.id;
    const homeId = m.homeParticipant?.playerId || m.homeParticipant?.player?.id || m.homeParticipantId || null;
    const awayId = m.awayParticipant?.playerId || m.awayParticipant?.player?.id || m.awayParticipantId || null;

    if (tournamentType === 'league' || tournamentType === 'league_playoffs') {
      leagueMatches.push({
        id: m.seriesId || m.id,
        round: m.round,
        playerA: homeId || '',
        playerB: awayId || '',
        scoreA: m.homeScore,
        scoreB: m.awayScore,
        cardsA: { yellow: m.homeYellowCards ?? 0, red: m.homeRedCards ?? 0 },
        cardsB: { yellow: m.awayYellowCards ?? 0, red: m.awayRedCards ?? 0 },
        confirmed: m.status === 'CLOSED',
        status: m.status,
        version: m.version,
      });
    } else if (tournamentType === 'group_stage') {
      const gid: GroupId = seriesId.includes('GB') ? 'B' : 'A';
      groupMatches.push({
        id: m.seriesId || m.id,
        groupId: gid,
        round: m.round,
        playerA: homeId || '',
        playerB: awayId || '',
        scoreA: m.homeScore,
        scoreB: m.awayScore,
        cardsA: { yellow: m.homeYellowCards ?? 0, red: m.homeRedCards ?? 0 },
        cardsB: { yellow: m.awayYellowCards ?? 0, red: m.awayRedCards ?? 0 },
        confirmed: m.status === 'CLOSED',
        status: m.status,
        version: m.version,
      });
    }

    if (!seriesMap.has(seriesId)) {
      let roundName: any = 'semifinal';
      const sLower = seriesId.toLowerCase();
      if (sLower.startsWith('r16') || sLower.includes('octavos')) roundName = 'round_of_16';
      else if (sLower.startsWith('qf') || sLower.includes('cuartos')) roundName = 'quarterfinal';
      else if (sLower.startsWith('sf') || sLower.includes('semis')) roundName = 'semifinal';
      else if (sLower === 'f' || sLower.includes('final')) roundName = 'final';
      else if (sLower === 'tp' || sLower.includes('tercer')) roundName = 'third_place';

      seriesMap.set(seriesId, {
        id: seriesId,
        round: roundName,
        playerA: homeId,
        playerB: awayId,
        leg1: {
          scoreA: m.homeScore,
          scoreB: m.awayScore,
          cardsA: { yellow: m.homeYellowCards ?? 0, red: m.homeRedCards ?? 0 },
          cardsB: { yellow: m.awayYellowCards ?? 0, red: m.awayRedCards ?? 0 },
        },
        leg2: {
          scoreA: null,
          scoreB: null,
          cardsA: { yellow: 0, red: 0 },
          cardsB: { yellow: 0, red: 0 },
        },
        penaltyWinner: m.penaltiesWinner?.playerId || m.penaltiesWinnerId || null,
        confirmed: m.status === 'CLOSED',
        winnerTo: null,
        loserTo: null,
        isBye: Boolean(m.isBye),
        status: m.status,
        version: m.version,
      });
    } else {
      const s = seriesMap.get(seriesId)!;
      if (m.leg === 2) {
        s.leg2 = {
          scoreA: m.awayScore,
          scoreB: m.homeScore,
          cardsA: { yellow: m.awayYellowCards ?? 0, red: m.awayRedCards ?? 0 },
          cardsB: { yellow: m.homeYellowCards ?? 0, red: m.homeRedCards ?? 0 },
        };
        if (m.status !== 'CLOSED') {
          s.confirmed = false;
        }
      }
    }
  }

  const series = Array.from(seriesMap.values());

  const phase: TournamentPhase =
    payload.status === 'VOTING_THEME'
      ? 'theme'
      : tournamentType === 'league'
      ? 'league'
      : tournamentType === 'group_stage'
      ? 'group_stage'
      : tournamentType === 'double_elimination'
      ? 'double_elimination'
      : 'bracket';

  return {
    id: payload.id,
    createdAt: payload.createdAt || new Date().toISOString(),
    phase,
    tournamentType,
    matchFormat,
    participantIds,
    theme: payload.theme || null,
    draftOrder: draftOrder.length > 0 ? draftOrder : participantIds,
    teams,
    byes,
    series,
    leagueMatches: leagueMatches.length > 0 ? leagueMatches : undefined,
    groupMatches: groupMatches.length > 0 ? groupMatches : undefined,
    matches: rawMatches,
  };
}

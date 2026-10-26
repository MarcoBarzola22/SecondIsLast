import type {
  CardCounts,
  GroupId,
  GroupMatch,
  LeagueMatch,
  MatchFormat,
  Player,
  PlayerId,
  Series,
  SeriesId,
  Side,
  TournamentType,
} from '../domain/types';
import type { DoubleEliminationBracket } from '../domain/doubleElimination';

export type Action =
  | { type: 'PLAYER_ADDED'; player: Player }
  | { type: 'PLAYER_REMOVED'; playerId: PlayerId }
  | {
      type: 'PARTICIPANTS_SET';
      participantIds: PlayerId[];
      tournamentType?: TournamentType;
      matchFormat?: MatchFormat;
      qualifyingSpots?: number;
      tournamentId: string;
      now: string;
    }
  | { type: 'THEME_SET'; theme: string }
  | { type: 'DRAFT_STARTED'; order: PlayerId[] }
  | { type: 'TEAM_ASSIGNED'; playerId: PlayerId; team: string }
  | { type: 'TEAMS_BATCH_ASSIGNED'; teams: Record<PlayerId, string> }
  | {
      type: 'BRACKET_GENERATED';
      series: Series[];
      byes: PlayerId[];
      bracketOrder?: PlayerId[];
    }
  | {
      type: 'BRACKET_MATCHUPS_MANUALLY_SET';
      orderedParticipantIds: PlayerId[];
    }
  | {
      type: 'LEG_SCORE_SET';
      seriesId: SeriesId;
      leg: 'leg1' | 'leg2';
      side: Side;
      value: number | null;
      cards?: CardCounts;
    }
  | {
      type: 'PENALTY_WINNER_SET';
      seriesId: SeriesId;
      playerId: PlayerId | null;
    }
  | { type: 'SERIES_CONFIRMED'; seriesId: SeriesId }
  | { type: 'SERIES_EDIT_REQUESTED'; seriesId: SeriesId }
  | { type: 'LEAGUE_GENERATED'; matches: LeagueMatch[] }
  | {
      type: 'LEAGUE_MATCH_SCORE_SET';
      matchId: string;
      scoreA: number | null;
      scoreB: number | null;
      cardsA?: CardCounts;
      cardsB?: CardCounts;
    }
  | { type: 'LEAGUE_MATCH_CONFIRMED'; matchId: string }
  | { type: 'LEAGUE_MATCH_EDIT_REQUESTED'; matchId: string }
  | {
      type: 'GROUP_STAGE_GENERATED';
      groups: Partial<Record<GroupId, PlayerId[]>>;
      matches: GroupMatch[];
    }
  | {
      type: 'GROUP_MATCH_SCORE_SET';
      matchId: string;
      scoreA: number | null;
      scoreB: number | null;
      cardsA?: CardCounts;
      cardsB?: CardCounts;
    }
  | { type: 'GROUP_MATCH_CONFIRMED'; matchId: string }
  | { type: 'GROUP_MATCH_EDIT_REQUESTED'; matchId: string }
  | {
      type: 'GROUP_PLAYOFFS_STARTED';
      series?: Series[];
    }
  | {
      type: 'LEAGUE_PLAYOFFS_STARTED';
      series?: Series[];
    }
  | {
      type: 'DOUBLE_ELIMINATION_GENERATED';
      bracket?: DoubleEliminationBracket;
      series?: Series[];
      byes?: PlayerId[];
    }
  | {
      type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED';
      bracketType?: 'winner' | 'loser' | 'grandFinal' | 'grandFinalReset';
      seriesId: SeriesId | string;
    }
  | {
      type: 'DOUBLE_ELIMINATION_RESET_TRIGGERED';
    }
  | {
      type: 'DOUBLE_ELIMINATION_MATCHUPS_MANUALLY_SET';
      orderedParticipantIds: PlayerId[];
    }
  | {
      type: 'TOURNAMENT_FINISHED';
      summaryId: string;
      now: string;
    }
  | { type: 'TOURNAMENT_ABANDONED' }
  | {
      type: 'PLAYER_WALKOVER_DECLARED';
      playerId: PlayerId;
      participantId?: string;
      matches?: any[];
    }
  | { type: 'STANDINGS_RESET' }
  | { type: 'CUSTOM_THEME_ADDED'; theme: string }
  | {
      type: 'MATCH_CLOSED_EVENT_RECEIVED';
      matchId: string;
      seriesId?: string;
      match?: any;
      bracket?: any[];
      unblockedParticipants?: string[];
    }
  | {
      type: 'HYDRATE_TOURNAMENT';
      payload: any;
    };



import type {
  LeagueMatch,
  MatchFormat,
  Player,
  PlayerId,
  Series,
  SeriesId,
  Side,
  TournamentType,
} from '../domain/types';

export type Action =
  | { type: 'PLAYER_ADDED'; player: Player }
  | { type: 'PLAYER_REMOVED'; playerId: PlayerId }
  | {
      type: 'PARTICIPANTS_SET';
      participantIds: PlayerId[];
      tournamentType?: TournamentType;
      matchFormat?: MatchFormat;
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
    }
  | {
      type: 'LEG_SCORE_SET';
      seriesId: SeriesId;
      leg: 'leg1' | 'leg2';
      side: Side;
      value: number | null;
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
    }
  | { type: 'LEAGUE_MATCH_CONFIRMED'; matchId: string }
  | { type: 'LEAGUE_MATCH_EDIT_REQUESTED'; matchId: string }
  | {
      type: 'TOURNAMENT_FINISHED';
      summaryId: string;
      now: string;
    }
  | { type: 'TOURNAMENT_ABANDONED' }
  | { type: 'STANDINGS_RESET' }
  | { type: 'CUSTOM_THEME_ADDED'; theme: string };


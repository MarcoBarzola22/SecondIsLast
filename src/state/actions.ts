import type {
  Player,
  PlayerId,
  Series,
  SeriesId,
  Side,
} from '../domain/types';

export type Action =
  | { type: 'PLAYER_ADDED'; player: Player }
  | {
      type: 'PARTICIPANTS_SET';
      participantIds: PlayerId[];
      tournamentId: string;
      now: string;
    }
  | { type: 'THEME_SET'; theme: string }
  | { type: 'DRAFT_STARTED'; order: PlayerId[] }
  | { type: 'TEAM_ASSIGNED'; playerId: PlayerId; team: string }
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
  | {
      type: 'TOURNAMENT_FINISHED';
      summaryId: string;
      now: string;
    }
  | { type: 'TOURNAMENT_ABANDONED' };

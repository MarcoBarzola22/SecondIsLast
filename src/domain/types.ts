export type PlayerId = string;

export interface Player {
  id: PlayerId;
  firstName: string;
  lastName: string;
  createdAt: string; // ISO 8601
}

/** Historical accumulated stats per player. DG is derived (gf - gc), never stored. */
export interface PlayerStats {
  playerId: PlayerId;
  pts: number;
  pj: number;
  pg: number;
  pp: number;
  gf: number;
  gc: number;
  tj: number;
}

export type SeriesId =
  | 'R16_1'
  | 'R16_2'
  | 'QF1'
  | 'QF2'
  | 'QF3'
  | 'QF4'
  | 'SF1'
  | 'SF2'
  | 'F'
  | 'TP'; // TP = 3er Puesto (Third Place)
export type Round =
  | 'round_of_16'
  | 'quarterfinal'
  | 'semifinal'
  | 'final'
  | 'third_place';
export type Side = 'a' | 'b';
export type MatchFormat = 'two_legged' | 'single_match';

/** Goals per side in one leg. null = not entered yet. */
export interface LegScore {
  a: number | null;
  b: number | null;
}

export interface SlotTarget {
  seriesId: SeriesId;
  side: Side;
}

export interface Series {
  id: SeriesId;
  round: Round;
  playerA: PlayerId | null; // null = "Por definir"
  playerB: PlayerId | null;
  leg1: LegScore; // Leg 1 (Ida): side 'a' is home
  leg2: LegScore; // Leg 2 (Vuelta): side 'b' is home (unused in single_match)
  penaltyWinner: PlayerId | null; // Selected only when aggregate score is tied
  confirmed: boolean;
  winnerTo: SlotTarget | null; // Next series slot for the winner
  loserTo: SlotTarget | null; // Next series slot for the loser (only SF -> TP)
  winner?: PlayerId | null;
  loser?: PlayerId | null;
}

export type TournamentType = 'bracket' | 'league';

export interface LeagueMatch {
  id: string; // e.g. "R1_M1"
  round: number; // Fecha (1..N)
  playerA: PlayerId;
  playerB: PlayerId;
  scoreA: number | null;
  scoreB: number | null;
  confirmed: boolean;
}

export interface LeagueStandingRow {
  playerId: PlayerId;
  displayName: string;
  team: string;
  pts: number;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  rank: number;
}

export type TournamentPhase = 'theme' | 'draft' | 'bracket' | 'league';

export interface ActiveTournament {
  id: string;
  createdAt: string; // ISO 8601
  phase: TournamentPhase;
  tournamentType?: TournamentType; // 'bracket' (default) or 'league'
  matchFormat?: MatchFormat; // 'two_legged' (default) or 'single_match'
  participantIds: PlayerId[]; // 4 to 6 players
  theme: string | null;
  draftOrder: PlayerId[]; // Draft order (shuffled via Fisher-Yates)
  teams: Record<PlayerId, string>;
  byes: PlayerId[]; // Direct pass players: 0 (4p), 3 (5p), 2 (6p)
  series: Series[]; // Tournament matches (bracket mode)
  leagueMatches?: LeagueMatch[]; // Tournament matches (league mode)
}

export interface Podium {
  champion: PlayerId;
  runnerUp: PlayerId;
  third: PlayerId;
  fourth: PlayerId;
}

export interface TournamentSummary {
  id: string;
  finishedAt: string; // ISO 8601
  theme: string;
  tournamentType?: TournamentType;
  matchFormat?: MatchFormat;
  participants: { playerId: PlayerId; team: string }[];
  podium: Podium;
}

export interface StandingsRow extends PlayerStats {
  rank: number;
  displayName: string; // "LastName, FirstName"
  dg: number;
}


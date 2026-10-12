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
  yellowCards?: number;
  redCards?: number;
  podiums?: number;
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
  | 'TP'
  | 'WB_R16_1'
  | 'WB_R16_2'
  | 'WB_QF1'
  | 'WB_QF2'
  | 'WB_QF3'
  | 'WB_QF4'
  | 'WB_SF1'
  | 'WB_SF2'
  | 'WB_F'
  | 'LB_R0_1'
  | 'LB_R1'
  | 'LB_R1_1'
  | 'LB_R1_2'
  | 'LB_R2'
  | 'LB_R2_1'
  | 'LB_R2_2'
  | 'LB_SF'
  | 'LB_F'
  | 'GF1'
  | 'GF2'
  | string;

export type Round =
  | 'round_of_16'
  | 'quarterfinal'
  | 'semifinal'
  | 'final'
  | 'third_place'
  | 'wb_round_16'
  | 'wb_quarterfinal'
  | 'wb_semifinal'
  | 'wb_final'
  | 'lb_round_0'
  | 'lb_round_1'
  | 'lb_round_2'
  | 'lb_semifinal'
  | 'lb_final'
  | 'grand_final'
  | 'grand_final_reset'
  | string;
export type Side = 'a' | 'b';
export type MatchFormat = 'two_legged' | 'single_match';

export interface CardCounts {
  yellow: number;
  red: number;
}

/** Goals and cards per side in one leg. null = not entered yet. */
export interface LegScore {
  a: number | null;
  b: number | null;
  cardsA?: CardCounts;
  cardsB?: CardCounts;
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

export type TournamentType =
  | 'bracket'
  | 'league'
  | 'group_stage'
  | 'league_playoffs'
  | 'double_elimination';

export interface LeagueMatch {
  id: string; // e.g. "R1_M1"
  round: number; // Fecha (1..N)
  playerA: PlayerId;
  playerB: PlayerId;
  scoreA: number | null;
  scoreB: number | null;
  cardsA?: CardCounts;
  cardsB?: CardCounts;
  confirmed: boolean;
}

export type GroupId = 'A' | 'B' | 'C';

export interface GroupMatch extends LeagueMatch {
  groupId: GroupId;
}

export interface GroupStageFixture {
  groups: Partial<Record<GroupId, PlayerId[]>>;
  matches: GroupMatch[];
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
  yellowCards?: number;
  redCards?: number;
  rank: number;
}

export type TournamentPhase =
  | 'theme'
  | 'draft'
  | 'bracket'
  | 'league'
  | 'group_stage'
  | 'group_playoffs'
  | 'league_playoffs'
  | 'double_elimination';

export interface ActiveTournament {
  id: string;
  createdAt: string; // ISO 8601
  phase: TournamentPhase;
  tournamentType?: TournamentType; // 'bracket' (default), 'league', 'group_stage', 'league_playoffs', 'double_elimination'
  matchFormat?: MatchFormat; // 'two_legged' (default) or 'single_match'
  qualifyingSpots?: number; // Playoffs cutoff for league_playoffs (RF-68, RF-86)
  participantIds: PlayerId[]; // 4 to 10 players
  theme: string | null;
  draftOrder: PlayerId[]; // Draft order (shuffled via Fisher-Yates)
  bracketOrder?: PlayerId[]; // Bracket seeding order (supports manual matchups RF-87)
  teams: Record<PlayerId, string>;
  byes: PlayerId[]; // Direct pass players: 0 (4p), 3 (5p), 2 (6p)
  series: Series[]; // Tournament matches (bracket mode or playoffs)
  leagueMatches?: LeagueMatch[]; // Tournament matches (league mode or regular season)
  groups?: Partial<Record<GroupId, PlayerId[]>>; // Group participants mapping for group_stage
  groupMatches?: GroupMatch[]; // Matches for group_stage
  walkoverPlayerIds?: PlayerId[]; // Players who abandoned the tournament (RF-64, RF-65)
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
  cards?: Record<PlayerId, { yellow: number; red: number }>;
}

export interface StandingsRow extends PlayerStats {
  rank: number;
  displayName: string; // "LastName, FirstName"
  dg: number;
}

export interface HeadToHeadRecord {
  playerA: PlayerId; // Canonical: alphabetically first ID
  playerB: PlayerId; // Canonical: alphabetically second ID
  played: number;
  winsA: number;
  draws: number;
  winsB: number;
  goalsA: number;
  goalsB: number;
}

export interface AnnualRankingEntry {
  playerId: PlayerId;
  pts: number;
  tournamentsPlayed: number;
  championships: number;
  runnerUps: number;
  thirdPlaces?: number;
  fourthPlaces?: number;
  podiums?: number;
  yellowCards?: number;
  redCards?: number;
}

export interface AwardsLeaderboard {
  goldenBoot: { playerId: PlayerId; goals: number } | null;
  woodenSpoon: { playerId: PlayerId; losses: number } | null;
  cleanSheet: { playerId: PlayerId; cleanSheets: number } | null;
}


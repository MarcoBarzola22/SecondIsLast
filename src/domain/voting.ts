import type { RngFn } from './random';
import type { TournamentType } from './types';

export const MIN_PARTICIPANTS = 4;
export const MAX_PARTICIPANTS = 10;
export const VOTING_DURATION_SECONDS = 60;

export const BASE_TOURNAMENT_FORMATS: readonly TournamentType[] = [
  'bracket',
  'league',
  'league_playoffs',
  'double_elimination',
] as const;

export interface VoteEntry<T extends string = string> {
  participantId?: string;
  choice: T;
}

export type VoteCollection<T extends string = string> =
  | readonly (VoteEntry<T> | T)[]
  | Record<string, T>;

export interface VoteResult<T extends string = string> {
  winner: T;
  wasDraw: boolean;
  tiedOptions?: T[];
  voteCounts: Record<T, number>;
  totalValidVotes: number;
}

/**
 * Returns the tournament formats mathematically and regulation-wise valid for N confirmed participants (RF-99).
 * - For all N in [4, 10]: 'bracket', 'league', 'league_playoffs', 'double_elimination'.
 * - 'group_stage' is STRICTLY included ONLY when N === 6 or N === 9 (RF-99).
 *
 * @throws Error if N is not an integer between 4 and 10.
 */
export function getValidFormatsForParticipants(n: number): TournamentType[] {
  if (!Number.isInteger(n) || n < MIN_PARTICIPANTS || n > MAX_PARTICIPANTS) {
    throw new Error(
      `Participant count must be an integer between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS} (received ${n})`
    );
  }

  if (n === 6 || n === 9) {
    return [
      'bracket',
      'league',
      'group_stage',
      'league_playoffs',
      'double_elimination',
    ];
  }

  return [...BASE_TOURNAMENT_FORMATS];
}

/**
 * Checks whether a given tournament format is compatible with N participants.
 */
export function isFormatValidForParticipants(
  format: TournamentType,
  n: number
): boolean {
  try {
    const validFormats = getValidFormatsForParticipants(n);
    return validFormats.includes(format);
  } catch {
    return false;
  }
}

/**
 * Computes vote results, tallies scores, filters incompatible choices and breaks ties uniformly (RF-99, RF-101, RF-102, Edge Case 3).
 *
 * @param votes Collection of votes (array of VoteEntry, array of choice strings, or Record<participantId, choice>)
 * @param validOptions Array of valid options permitted for this vote
 * @param rng Injectable RNG returning a float in [0, 1), defaults to Math.random
 * @returns VoteResult with winner, draw status, vote counts and total valid votes
 * @throws Error if validOptions is empty
 */
export function computeVoteResults<T extends string = string>(
  votes: VoteCollection<T>,
  validOptions: readonly T[],
  rng: RngFn = Math.random
): VoteResult<T> {
  if (!validOptions || validOptions.length === 0) {
    throw new Error('validOptions must contain at least one option');
  }

  // Canonical map: lowercased option -> canonical option as typed in validOptions
  const canonicalMap = new Map<string, T>();
  for (const opt of validOptions) {
    canonicalMap.set(opt.toLowerCase(), opt);
  }

  // Initialize vote counts with 0 for all valid options (using canonical keys)
  const voteCounts = {} as Record<T, number>;
  for (const opt of validOptions) {
    voteCounts[opt] = 0;
  }

  // Normalize votes and deduplicate multiple votes by the same participant (latest vote wins)
  let effectiveChoices: T[] = [];

  if (Array.isArray(votes)) {
    const latestVotesByParticipant = new Map<string, T>();
    const anonymousVotes: T[] = [];

    for (const item of votes) {
      if (typeof item === 'object' && item !== null && 'choice' in item) {
        const entry = item as VoteEntry<T>;
        const rawChoice = String(entry.choice);
        const canonicalChoice = canonicalMap.get(rawChoice.toLowerCase()) ?? (entry.choice as T);
        if (entry.participantId) {
          latestVotesByParticipant.set(entry.participantId, canonicalChoice);
        } else {
          anonymousVotes.push(canonicalChoice);
        }
      } else if (typeof item === 'string') {
        const canonicalChoice = canonicalMap.get(item.toLowerCase()) ?? (item as T);
        anonymousVotes.push(canonicalChoice);
      }
    }

    effectiveChoices = [
      ...latestVotesByParticipant.values(),
      ...anonymousVotes,
    ];
  } else if (typeof votes === 'object' && votes !== null) {
    effectiveChoices = Object.values(votes).map((v) => {
      const raw = String(v);
      return canonicalMap.get(raw.toLowerCase()) ?? (v as T);
    });
  }

  // Tally votes for valid options only (case-insensitive lookup, tallying into canonical keys)
  let totalValidVotes = 0;

  for (const choice of effectiveChoices) {
    const canonical = canonicalMap.get(String(choice).toLowerCase());
    if (canonical !== undefined) {
      voteCounts[canonical] = (voteCounts[canonical] || 0) + 1;
      totalValidVotes++;
    }
  }

  // Edge Case 3: 0 valid votes cast -> random draw among all valid options with uniform distribution
  if (totalValidVotes === 0) {
    const rawIndex = Math.floor(rng() * validOptions.length);
    const winnerIndex = Math.max(0, Math.min(rawIndex, validOptions.length - 1));
    const winner = validOptions[winnerIndex]!;

    return {
      winner,
      wasDraw: true,
      tiedOptions: [...validOptions],
      voteCounts,
      totalValidVotes: 0,
    };
  }

  // Find max votes
  const maxVotes = Math.max(...validOptions.map((opt) => voteCounts[opt] ?? 0));
  const topOptions = validOptions.filter(
    (opt) => (voteCounts[opt] ?? 0) === maxVotes
  );

  // Outright single winner
  if (topOptions.length === 1) {
    return {
      winner: topOptions[0]!,
      wasDraw: false,
      voteCounts,
      totalValidVotes,
    };
  }

  // Tie break among topOptions using RNG (RF-101)
  const rawIndex = Math.floor(rng() * topOptions.length);
  const winnerIndex = Math.max(0, Math.min(rawIndex, topOptions.length - 1));
  const winner = topOptions[winnerIndex]!;

  return {
    winner,
    wasDraw: true,
    tiedOptions: topOptions,
    voteCounts,
    totalValidVotes,
  };
}

/**
 * Checks if all confirmed participants have cast their vote (RF-100 condition 2).
 */
export function hasAllParticipantsVoted(
  validVotesCount: number,
  totalConfirmed: number
): boolean {
  return validVotesCount >= totalConfirmed;
}

/**
 * Checks if the voting session should close based on time or 100% participation (RF-100).
 */
export function shouldCloseVoting(
  votedCount: number,
  totalConfirmed: number,
  elapsedSeconds: number,
  maxDurationSeconds: number = VOTING_DURATION_SECONDS
): boolean {
  const timeExpired = elapsedSeconds >= maxDurationSeconds;
  const allVoted = hasAllParticipantsVoted(votedCount, totalConfirmed);
  return timeExpired || allVoted;
}

export const RANDOM_FORMAT_OPTION = 'random';
export type MatchFormatOption = 'SINGLE_MATCH' | 'TWO_LEGGED';
export const MATCH_FORMAT_OPTIONS: readonly MatchFormatOption[] = [
  'SINGLE_MATCH',
  'TWO_LEGGED',
] as const;

/**
 * Returns available voting options for tournament format, including the explicit RANDOM option.
 */
export function getFormatVotingOptions(n: number): string[] {
  return [...getValidFormatsForParticipants(n), RANDOM_FORMAT_OPTION];
}

/**
 * Resolves the final format winner. If "random" was elect, draws uniformly among valid formats for N.
 */
export function resolveFormatWinner(
  winner: string,
  validFormats: readonly TournamentType[],
  rng: RngFn = Math.random
): TournamentType {
  if (winner.toLowerCase() === RANDOM_FORMAT_OPTION) {
    const formatsWithoutRandom = validFormats.filter(
      (f) => (f as string).toLowerCase() !== RANDOM_FORMAT_OPTION
    );
    const randIdx = Math.floor(rng() * formatsWithoutRandom.length);
    return formatsWithoutRandom[randIdx] || 'bracket';
  }
  return winner as TournamentType;
}

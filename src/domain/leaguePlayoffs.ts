import type {
  LeagueMatch,
  LeagueStandingRow,
  PlayerId,
  Round,
  Series,
  SeriesId,
  SlotTarget,
} from './types';
import { generateBracket } from './bracket';

function createPlayoffSeries(
  id: SeriesId,
  round: Round,
  playerA: PlayerId | null,
  playerB: PlayerId | null,
  winnerTo: SlotTarget | null,
  loserTo: SlotTarget | null
): Series {
  return {
    id,
    round,
    playerA,
    playerB,
    leg1: { a: null, b: null },
    leg2: { a: null, b: null },
    penaltyWinner: null,
    confirmed: false,
    winnerTo,
    loserTo,
    winner: null,
    loser: null,
  };
}

/**
 * Seeds qualified participants into the standard bracket slots for generateBracket.
 */
function seedPlayersForBracket(qualifiedIds: readonly PlayerId[]): PlayerId[] {
  const K = qualifiedIds.length;
  const p = (seed: number) => qualifiedIds[seed - 1]!;

  switch (K) {
    case 4:
      // SF1: 1 vs 4, SF2: 2 vs 3
      return [p(1), p(4), p(2), p(3)];
    case 5:
      // QF1: 4 vs 5 -> SF1 vs 1. SF2: 2 vs 3
      return [p(4), p(5), p(1), p(2), p(3)];
    case 6:
      // QF1: 4 vs 5 -> SF1 vs 1. QF2: 3 vs 6 -> SF2 vs 2
      return [p(4), p(5), p(3), p(6), p(1), p(2)];
    case 7:
      // QF1: 2 vs 7, QF2: 3 vs 6 -> SF1. QF3: 4 vs 5 -> SF2 vs 1
      return [p(2), p(7), p(3), p(6), p(4), p(5), p(1)];
    case 8:
      // QF1: 1 vs 8, QF2: 4 vs 5 -> SF1. QF3: 2 vs 7, QF4: 3 vs 6 -> SF2
      return [p(1), p(8), p(4), p(5), p(2), p(7), p(3), p(6)];
    case 9:
      // R16: 8 vs 9 -> QF1 vs 1. QF2: 4 vs 5. QF3: 2 vs 7. QF4: 3 vs 6
      return [p(8), p(9), p(1), p(4), p(5), p(2), p(7), p(3), p(6)];
    case 10:
      // R16_1: 8 vs 9 -> QF1 vs 1. QF2: 4 vs 5. R16_2: 7 vs 10 -> QF3 vs 2. QF4: 3 vs 6
      return [p(8), p(9), p(7), p(10), p(1), p(4), p(5), p(2), p(3), p(6)];
    default:
      return [...qualifiedIds];
  }
}

/**
 * Returns the number of qualified participants to the championship playoffs
 * based on the total number of league participants N (RF-68):
 * - 4 or 5 participants: 2 (Top 2 to Final; 3° and 4° play for 3rd Place)
 * - 6 to 9 participants: 4 (Top 4 to Semifinals)
 * - 10 participants: 8 (Top 8 to Quarterfinals)
 *
 * @throws Error if participant count is not between 4 and 10.
 */
export function getPlayoffsCutoffCount(participantCount: number): number {
  if (participantCount < 4 || participantCount > 10) {
    throw new Error(
      `Cantidad inválida de participantes para playoffs de liga: ${participantCount}. Debe ser entre 4 y 10.`
    );
  }

  if (participantCount <= 5) {
    return 2;
  }
  if (participantCount <= 9) {
    return 4;
  }
  return 8;
}

/**
 * Checks if the regular league phase has completed and all matches are confirmed (RF-68).
 */
export function isLeaguePhaseComplete(
  matches: readonly LeagueMatch[]
): boolean {
  return matches.length > 0 && matches.every((m) => m.confirmed);
}

/**
 * Generates the playoff elimination bracket directly from the finalized regular league standings (RF-68, RF-86).
 * Respects customQualifyingSpots (2 to N), delegating to generateBracket with deterministic seeding.
 *
 * @throws Error if standings has fewer than 4 or more than 10 players, or duplicate players.
 */
export function generatePlayoffsBracketFromStandings(
  standings: readonly LeagueStandingRow[],
  customQualifyingSpots?: number
): Series[] {
  const count = standings.length;
  if (count < 4 || count > 10) {
    throw new Error(
      `Cantidad inválida de participantes en la tabla de posiciones: ${count}. Debe ser entre 4 y 10.`
    );
  }

  const playerIds = standings.map((s) => s.playerId);
  const unique = new Set(playerIds);
  if (unique.size !== count) {
    throw new Error('La tabla de posiciones contiene participantes duplicados.');
  }

  const k =
    customQualifyingSpots !== undefined
      ? Math.min(Math.max(customQualifyingSpots, 2), count)
      : getPlayoffsCutoffCount(count);

  // Case 1: 2 participants (Direct Final, 3° and 4° to Third Place)
  if (k === 2) {
    const p1 = standings[0]!.playerId;
    const p2 = standings[1]!.playerId;
    const p3 = standings[2]?.playerId ?? null;
    const p4 = standings[3]?.playerId ?? null;

    const directFinal = createPlayoffSeries(
      'F',
      'final',
      p1,
      p2,
      null,
      null
    );

    const directThirdPlace = createPlayoffSeries(
      'TP',
      'third_place',
      p3,
      p4,
      null,
      null
    );

    return [directFinal, directThirdPlace];
  }

  // Case 2: 3 participants (2° vs 3° in SF1, winner plays 1° in Final)
  if (k === 3) {
    const p1 = standings[0]!.playerId;
    const p2 = standings[1]!.playerId;
    const p3 = standings[2]!.playerId;
    const p4 = standings[3]?.playerId ?? null;

    const sf1 = createPlayoffSeries(
      'SF1',
      'semifinal',
      p2,
      p3,
      { seriesId: 'F', side: 'b' },
      { seriesId: 'TP', side: 'a' }
    );

    const directFinal = createPlayoffSeries(
      'F',
      'final',
      p1,
      null,
      null,
      null
    );

    const directThirdPlace = createPlayoffSeries(
      'TP',
      'third_place',
      null,
      p4,
      null,
      null
    );

    return [sf1, directFinal, directThirdPlace];
  }

  // Case 3: 4 to 10 participants, delegate to generateBracket with deterministic seeding
  const qualifiedIds = standings.slice(0, k).map((s) => s.playerId);
  const seededOrder = seedPlayersForBracket(qualifiedIds);
  const { series } = generateBracket(seededOrder, null);
  return series;
}

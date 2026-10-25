export interface TournamentPointsDistribution {
  participantCount: number;
  multiplier: number;
  champion: number;
  runnerUp: number;
  third: number;
  fourth: number;
  participation: number;
}

/**
 * Calculates the distribution of Annual Ranking points for a tournament based on participant count N (RF-78, RF-84).
 * Points are scaled by multiplier = N / 4:
 * - Champion: 10 * (N / 4)
 * - Runner-up: 7 * (N / 4)
 * - 3rd Place: 5 * (N / 4)
 * - 4th Place: 3 * (N / 4)
 * - Other participants: +1 point each
 */
export function getTournamentPointsDistribution(
  participantCount: number
): TournamentPointsDistribution {
  const n = Math.max(0, participantCount);
  const multiplier = n / 4;

  return {
    participantCount: n,
    multiplier,
    champion: Math.round(10 * multiplier),
    runnerUp: Math.round(7 * multiplier),
    third: Math.round(5 * multiplier),
    fourth: Math.round(3 * multiplier),
    participation: n > 0 ? 1 : 0,
  };
}

/**
 * Generates canonical alphabetical key for Head-to-Head between two players (RF-76).
 * Example: if idA='p2' and idB='p1', returns 'p1_p2'.
 */
export function getHeadToHeadKey(playerA: string, playerB: string): string {
  return playerA < playerB ? `${playerA}_${playerB}` : `${playerB}_${playerA}`;
}

export const WALKOVER_GOALS_FORFEIT = 0;
export const WALKOVER_GOALS_AWARDED = 3;

export interface WalkoverMatchTarget {
  id: string;
  homeParticipantId: string;
  awayParticipantId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeYellowCards?: number;
  awayYellowCards?: number;
  homeRedCards?: number;
  awayRedCards?: number;
  penaltiesWinnerId?: string | null;
  status: string;
  version: number;
}

/**
 * Updates all matches in MatchState format for a walkover player (RF-116, RF-117):
 * - All matches involving participantId are overwritten to 0-3 defeats (3-0 for rival).
 * - All cards are wiped to 0.
 * - penaltiesWinnerId is reset to null.
 * - Match status becomes CLOSED immediately without requiring handshake from the rival.
 * - Match version is incremented.
 * - If both participants have abandoned, the match is scored 0-0.
 */
export function applyWalkoverToMatches<T extends WalkoverMatchTarget>(
  matches: readonly T[],
  participantId: string,
  existingWalkoverIds: readonly string[] = []
): T[] {
  const allWalkovers = new Set([...existingWalkoverIds, participantId]);

  return matches.map((m) => {
    const isHome = m.homeParticipantId === participantId;
    const isAway = m.awayParticipantId === participantId;

    if (!isHome && !isAway) {
      return m;
    }

    const rivalId = isHome ? m.awayParticipantId : m.homeParticipantId;
    const rivalIsWalkover = rivalId ? allWalkovers.has(rivalId) : false;

    let homeScore: number;
    let awayScore: number;

    if (rivalIsWalkover || !rivalId) {
      homeScore = WALKOVER_GOALS_FORFEIT;
      awayScore = WALKOVER_GOALS_FORFEIT;
    } else if (isHome) {
      homeScore = WALKOVER_GOALS_FORFEIT;
      awayScore = WALKOVER_GOALS_AWARDED;
    } else {
      homeScore = WALKOVER_GOALS_AWARDED;
      awayScore = WALKOVER_GOALS_FORFEIT;
    }

    return {
      ...m,
      homeScore,
      awayScore,
      homeYellowCards: 0,
      awayYellowCards: 0,
      homeRedCards: 0,
      awayRedCards: 0,
      penaltiesWinnerId: null,
      status: 'CLOSED',
      version: m.version + 1,
    };
  });
}

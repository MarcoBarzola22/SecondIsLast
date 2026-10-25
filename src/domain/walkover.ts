import type { MatchState } from './handshake';
import {
  ActiveTournament,
  LeagueMatch,
  MatchFormat,
  PlayerId,
  Series,
} from './types';

export const WALKOVER_GOALS_FORFEIT = 0;
export const WALKOVER_GOALS_AWARDED = 3;

/**
 * Checks if a player has abandoned the tournament (RF-64, RF-66).
 */
export function isPlayerWalkover(
  tournament: ActiveTournament,
  playerId: PlayerId
): boolean {
  return tournament.walkoverPlayerIds?.includes(playerId) ?? false;
}

/**
 * Checks if a league match or series is locked for manual editing because
 * one or both participants abandoned the tournament (RF-66).
 */
export function isMatchLockedByWalkover(
  match: { playerA: PlayerId | null; playerB: PlayerId | null },
  walkoverPlayerIds?: readonly PlayerId[]
): boolean {
  if (!walkoverPlayerIds || walkoverPlayerIds.length === 0) return false;
  return (
    (match.playerA !== null && walkoverPlayerIds.includes(match.playerA)) ||
    (match.playerB !== null && walkoverPlayerIds.includes(match.playerB))
  );
}

/**
 * Updates all league matches for a walkover player:
 * - Overwrites any played and unplayed matches involving playerId with 0-3 against (RF-65).
 * - Player who abandoned receives 0 goals; rival receives 3 goals.
 * - If both participants have abandoned, the match is scored 0-0.
 * - Match is marked as confirmed and card counts are reset to zero.
 */
export function applyWalkoverToLeagueMatches(
  matches: readonly LeagueMatch[],
  playerId: PlayerId,
  existingWalkoverIds: readonly PlayerId[] = []
): LeagueMatch[] {
  const allWalkovers = new Set([...existingWalkoverIds, playerId]);

  return matches.map((m) => {
    const isA = m.playerA === playerId;
    const isB = m.playerB === playerId;

    if (!isA && !isB) {
      return m;
    }

    const otherId = isA ? m.playerB : m.playerA;
    const otherIsWalkover = allWalkovers.has(otherId);

    let scoreA: number;
    let scoreB: number;

    if (otherIsWalkover) {
      scoreA = WALKOVER_GOALS_FORFEIT;
      scoreB = WALKOVER_GOALS_FORFEIT;
    } else if (isA) {
      scoreA = WALKOVER_GOALS_FORFEIT;
      scoreB = WALKOVER_GOALS_AWARDED;
    } else {
      scoreA = WALKOVER_GOALS_AWARDED;
      scoreB = WALKOVER_GOALS_FORFEIT;
    }

    return {
      ...m,
      scoreA,
      scoreB,
      cardsA: { yellow: 0, red: 0 },
      cardsB: { yellow: 0, red: 0 },
      confirmed: true,
      status: 'CLOSED',
      version: (m.version ?? 0) + 1,
    };
  });
}

/**
 * Updates knockout series when a player abandons:
 * - In the active or upcoming series, the rival advances automatically with 3-0 in each leg (RF-65).
 * - If the player had previously advanced to a subsequent round and abandons there,
 *   the rival of the current active round advances directly without reopening previous rounds (RF-65).
 * - Advances winners and losers in cascade (e.g. loser to third-place match).
 */
export function applyWalkoverToSeries(
  seriesList: readonly Series[],
  playerId: PlayerId,
  matchFormat: MatchFormat = 'two_legged',
  existingWalkoverIds: readonly PlayerId[] = []
): Series[] {
  const allWalkovers = new Set([...existingWalkoverIds, playerId]);
  let currentSeries = [...seriesList];
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < currentSeries.length; i++) {
      const s = currentSeries[i]!;
      const isPlayerA = s.playerA === playerId;
      const isPlayerB = s.playerB === playerId;

      if (!isPlayerA && !isPlayerB) {
        continue;
      }

      const rivalId = isPlayerA ? s.playerB : s.playerA;

      // Cannot confirm without a defined rival
      if (!rivalId) {
        continue;
      }

      // If the series was already confirmed with playerId as winner and playerId is present
      // in a subsequent/downstream series, the walkover takes effect in that current/downstream round!
      if (s.confirmed && s.winner === playerId) {
        const downstreamHasPlayer = currentSeries.some(
          (d) =>
            d.id !== s.id && (d.playerA === playerId || d.playerB === playerId)
        );
        if (downstreamHasPlayer) {
          continue;
        }
      }

      const rivalIsWalkover = allWalkovers.has(rivalId);

      const expectedA = rivalIsWalkover
        ? WALKOVER_GOALS_FORFEIT
        : isPlayerA
          ? WALKOVER_GOALS_FORFEIT
          : WALKOVER_GOALS_AWARDED;

      const expectedB = rivalIsWalkover
        ? WALKOVER_GOALS_FORFEIT
        : isPlayerA
          ? WALKOVER_GOALS_AWARDED
          : WALKOVER_GOALS_FORFEIT;

      const alreadySettled =
        s.confirmed &&
        s.winner === rivalId &&
        s.loser === playerId &&
        s.leg1.a === expectedA &&
        s.leg1.b === expectedB &&
        (matchFormat === 'single_match' ||
          (s.leg2.a === expectedA && s.leg2.b === expectedB));

      if (alreadySettled) {
        continue;
      }

      const updatedLeg1 = {
        a: expectedA,
        b: expectedB,
        cardsA: { yellow: 0, red: 0 },
        cardsB: { yellow: 0, red: 0 },
      };

      const updatedLeg2 =
        matchFormat === 'single_match'
          ? s.leg2
          : {
              a: expectedA,
              b: expectedB,
              cardsA: { yellow: 0, red: 0 },
              cardsB: { yellow: 0, red: 0 },
            };

      const winner = rivalIsWalkover ? null : rivalId;
      const loser = playerId;

      const updatedSeriesItem: Series = {
        ...s,
        leg1: updatedLeg1,
        leg2: updatedLeg2,
        penaltyWinner: null,
        confirmed: true,
        status: 'CLOSED',
        version: (s.version ?? 0) + 1,
        winner,
        loser,
      };

      currentSeries = currentSeries.map((item, idx) =>
        idx === i ? updatedSeriesItem : item
      );

      // Propagate winner
      if (s.winnerTo && winner !== null) {
        const targetId = s.winnerTo.seriesId;
        const targetSide = s.winnerTo.side;
        currentSeries = currentSeries.map((item) =>
          item.id === targetId
            ? {
                ...item,
                [targetSide === 'a' ? 'playerA' : 'playerB']: winner,
              }
            : item
        );
      }

      // Propagate loser (e.g. SF -> Third Place)
      if (s.loserTo) {
        const targetId = s.loserTo.seriesId;
        const targetSide = s.loserTo.side;
        currentSeries = currentSeries.map((item) =>
          item.id === targetId
            ? {
                ...item,
                [targetSide === 'a' ? 'playerA' : 'playerB']: loser,
              }
            : item
        );
      }

      changed = true;
      break;
    }
  }

  return currentSeries;
}

/**
 * Resolves any pending series where one of the participants is an abandoned player
 * and the rival has now arrived/been defined.
 */
export function resolvePendingWalkoverSeries(
  seriesList: readonly Series[],
  walkoverPlayerIds: readonly PlayerId[],
  matchFormat: MatchFormat = 'two_legged'
): Series[] {
  let updated = [...seriesList];
  for (const walkoverId of walkoverPlayerIds) {
    updated = applyWalkoverToSeries(
      updated,
      walkoverId,
      matchFormat,
      walkoverPlayerIds
    );
  }
  return updated;
}

/**
 * Updates all matches in MatchState format for a walkover player (RF-116, RF-117):
 * - All matches involving playerId are overwritten to 0-3 defeats (3-0 for rival).
 * - All cards are wiped to 0.
 * - penaltiesWinnerId is reset to null.
 * - Match status becomes CLOSED immediately without requiring handshake from the rival.
 * - Match version is incremented.
 * - If both participants have abandoned, the match is scored 0-0.
 */
export function applyWalkoverToMatches<T extends MatchState>(
  matches: readonly T[],
  playerId: string,
  existingWalkoverIds: readonly string[] = []
): T[] {
  const allWalkovers = new Set([...existingWalkoverIds, playerId]);

  return matches.map((m) => {
    const isHome = m.homeParticipantId === playerId;
    const isAway = m.awayParticipantId === playerId;

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

/**
 * Core pure function to apply a player walkover (abandonment) to a tournament (RF-64, RF-65, RF-116, RF-117).
 * - Validates participation, current phase and previous abandonments.
 * - Overwrites all matches (league, group, bracket or handshake matches) as 0-3 defeats against the player.
 * - Advances rivals in bracket elimination rounds.
 * - Automatically closes all matches with status CLOSED and increments version.
 * - Records playerId in walkoverPlayerIds.
 */
export function applyWalkoverToTournament(
  tournament: ActiveTournament,
  playerId: PlayerId
): ActiveTournament {
  if (!tournament.participantIds.includes(playerId)) {
    throw new Error('El jugador no es participante de este torneo.');
  }

  const currentWalkovers = tournament.walkoverPlayerIds ?? [];
  if (currentWalkovers.includes(playerId)) {
    throw new Error('El jugador ya abandonó el torneo.');
  }

  if (tournament.phase === 'theme' || tournament.phase === 'draft') {
    throw new Error(
      'No se puede declarar abandono antes de iniciar la competencia.'
    );
  }

  const updatedWalkovers = [...currentWalkovers, playerId];

  let updatedLeagueMatches = tournament.leagueMatches;
  if (updatedLeagueMatches && updatedLeagueMatches.length > 0) {
    updatedLeagueMatches = applyWalkoverToLeagueMatches(
      updatedLeagueMatches,
      playerId,
      currentWalkovers
    );
  }

  let updatedGroupMatches = tournament.groupMatches;
  if (updatedGroupMatches && updatedGroupMatches.length > 0) {
    updatedGroupMatches = applyWalkoverToLeagueMatches(
      updatedGroupMatches,
      playerId,
      currentWalkovers
    ) as typeof tournament.groupMatches;
  }

  let updatedSeries = tournament.series;
  if (updatedSeries && updatedSeries.length > 0) {
    updatedSeries = applyWalkoverToSeries(
      updatedSeries,
      playerId,
      tournament.matchFormat ?? 'two_legged',
      currentWalkovers
    );
  }

  let updatedMatches = (tournament as any).matches as MatchState[] | undefined;
  if (updatedMatches && updatedMatches.length > 0) {
    updatedMatches = applyWalkoverToMatches(
      updatedMatches,
      playerId,
      currentWalkovers
    );
  }

  return {
    ...tournament,
    leagueMatches: updatedLeagueMatches,
    groupMatches: updatedGroupMatches,
    series: updatedSeries,
    matches: updatedMatches,
    walkoverPlayerIds: updatedWalkovers,
  };
}

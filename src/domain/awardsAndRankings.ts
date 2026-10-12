import { formatPlayerName } from './players';
import type {
  AnnualRankingEntry,
  AwardsLeaderboard,
  HeadToHeadRecord,
  LeagueMatch,
  Player,
  PlayerId,
  PlayerStats,
  Series,
  TournamentSummary,
} from './types';

/**
 * Generic match-like structure compatible with LeagueMatch, GroupMatch, or normalized series legs.
 */
export interface MatchRecord {
  playerA: PlayerId | null;
  playerB: PlayerId | null;
  scoreA: number | null;
  scoreB: number | null;
  confirmed?: boolean;
}

/**
 * Normalized match with non-null scores and players.
 */
export interface NormalizedMatch {
  playerA: PlayerId;
  playerB: PlayerId;
  scoreA: number;
  scoreB: number;
}

export interface SortedAnnualRankingEntry extends AnnualRankingEntry {
  rank: number;
  displayName: string;
}

export interface PlayerAwardDetails {
  playerId: PlayerId;
  displayName: string;
  count: number;
  secondaryCount?: number;
}

export interface DetailedAwardsLeaderboard extends AwardsLeaderboard {
  details: {
    goldenBoot: PlayerAwardDetails | null;
    woodenSpoon: PlayerAwardDetails | null;
    cleanSheet: PlayerAwardDetails | null;
  };
}

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
export function getHeadToHeadKey(playerA: PlayerId, playerB: PlayerId): string {
  return playerA < playerB ? `${playerA}_${playerB}` : `${playerB}_${playerA}`;
}

/**
 * Normalizes an array of LeagueMatch, GroupMatch, or Series into individual played matches.
 */
export function normalizeMatches(
  matches: readonly (MatchRecord | LeagueMatch | Series)[]
): NormalizedMatch[] {
  const result: NormalizedMatch[] = [];

  for (const item of matches) {
    // 1. If it's a Series (contains leg1)
    if ('leg1' in item) {
      const s = item as Series;
      if (s.confirmed === false || !s.playerA || !s.playerB || s.playerA === s.playerB) {
        continue;
      }
      if (s.leg1?.a !== null && s.leg1?.b !== null) {
        result.push({
          playerA: s.playerA,
          playerB: s.playerB,
          scoreA: s.leg1.a,
          scoreB: s.leg1.b,
        });
      }
      if (s.leg2?.a !== null && s.leg2?.b !== null) {
        result.push({
          playerA: s.playerA,
          playerB: s.playerB,
          scoreA: s.leg2.a,
          scoreB: s.leg2.b,
        });
      }
      continue;
    }

    // 2. If it's a standard MatchRecord or LeagueMatch
    const m = item as MatchRecord;
    if (m.confirmed === false) {
      continue;
    }
    if (
      m.playerA &&
      m.playerB &&
      m.playerA !== m.playerB &&
      m.scoreA !== null &&
      m.scoreB !== null
    ) {
      result.push({
        playerA: m.playerA,
        playerB: m.playerB,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
      });
    }
  }

  return result;
}

/**
 * Updates or accumulates Head-to-Head records from played matches (RF-76).
 * Maintains total matches played, wins for each player, draws, and goals scored by each.
 */
export function updateHeadToHead(
  currentH2H: Record<string, HeadToHeadRecord> | undefined | null,
  matches: readonly (MatchRecord | LeagueMatch | Series)[]
): Record<string, HeadToHeadRecord> {
  const h2h: Record<string, HeadToHeadRecord> = {};

  // Copy previous records immutably
  if (currentH2H) {
    for (const [key, rec] of Object.entries(currentH2H)) {
      h2h[key] = { ...rec };
    }
  }

  const normalized = normalizeMatches(matches);

  for (const match of normalized) {
    const { playerA, playerB, scoreA, scoreB } = match;
    const idA = playerA < playerB ? playerA : playerB;
    const idB = playerA < playerB ? playerB : playerA;
    const key = `${idA}_${idB}`;

    const goalsA = playerA === idA ? scoreA : scoreB;
    const goalsB = playerA === idA ? scoreB : scoreA;

    const existing = h2h[key] ?? {
      playerA: idA,
      playerB: idB,
      played: 0,
      winsA: 0,
      draws: 0,
      winsB: 0,
      goalsA: 0,
      goalsB: 0,
    };

    const isWinA = goalsA > goalsB;
    const isWinB = goalsB > goalsA;
    const isDraw = goalsA === goalsB;

    h2h[key] = {
      playerA: idA,
      playerB: idB,
      played: existing.played + 1,
      winsA: existing.winsA + (isWinA ? 1 : 0),
      draws: existing.draws + (isDraw ? 1 : 0),
      winsB: existing.winsB + (isWinB ? 1 : 0),
      goalsA: existing.goalsA + goalsA,
      goalsB: existing.goalsB + goalsB,
    };
  }

  return h2h;
}

/**
 * Queries the Head-to-Head record between two specific players (RF-76).
 * Returns null if no record exists or both IDs are identical.
 */
export function getHeadToHeadBetween(
  h2h: Record<string, HeadToHeadRecord> | undefined | null,
  player1: PlayerId,
  player2: PlayerId
): HeadToHeadRecord | null {
  if (!h2h || !player1 || !player2 || player1 === player2) {
    return null;
  }
  const key = getHeadToHeadKey(player1, player2);
  return h2h[key] ? { ...h2h[key] } : null;
}

/**
 * Computes Annual Ranking points scaled by participant count N (RF-78).
 * Multiplier: N / 4
 * Points:
 * - Champion: 10 * (N / 4)
 * - Runner-up: 7 * (N / 4)
 * - 3rd Place: 5 * (N / 4)
 * - 4th Place: 3 * (N / 4)
 * - Other participants: +1 point each
 */
export function computeAnnualRanking(
  history: readonly TournamentSummary[],
  year?: number | string
): Record<PlayerId, AnnualRankingEntry> {
  const result: Record<PlayerId, AnnualRankingEntry> = {};

  const targetYearNum =
    year !== undefined && year !== 'all'
      ? typeof year === 'number'
        ? year
        : parseInt(year, 10)
      : null;

  for (const tourney of history) {
    if (!tourney.finishedAt || !tourney.participants || !tourney.podium) {
      continue;
    }

    // Check year filter
    if (targetYearNum !== null && !isNaN(targetYearNum)) {
      let tYear: number | null = null;
      try {
        const d = new Date(tourney.finishedAt);
        if (!isNaN(d.getTime())) {
          tYear = d.getFullYear();
        }
      } catch {
        // Fallback
      }
      if (tYear === null) {
        tYear = parseInt(tourney.finishedAt.slice(0, 4), 10);
      }
      if (tYear !== targetYearNum) {
        continue;
      }
    }

    const n = tourney.participants.length;
    if (n === 0) continue;

    const multiplier = n / 4;
    const { champion, runnerUp, third, fourth } = tourney.podium;
    const podiumIds = new Set([champion, runnerUp, third, fourth]);

    // Ensure all participants exist in result map
    for (const p of tourney.participants) {
      if (!result[p.playerId]) {
        result[p.playerId] = {
          playerId: p.playerId,
          pts: 0,
          tournamentsPlayed: 0,
          championships: 0,
          runnerUps: 0,
          thirdPlaces: 0,
          fourthPlaces: 0,
          podiums: 0,
          yellowCards: 0,
          redCards: 0,
        };
      }
      result[p.playerId].tournamentsPlayed += 1;
    }

    // 1. Champion
    if (result[champion]) {
      result[champion].pts += Math.round(10 * multiplier);
      result[champion].championships += 1;
      result[champion].podiums = (result[champion].podiums ?? 0) + 1;
    }

    // 2. Runner-Up
    if (result[runnerUp]) {
      result[runnerUp].pts += Math.round(7 * multiplier);
      result[runnerUp].runnerUps += 1;
      result[runnerUp].podiums = (result[runnerUp].podiums ?? 0) + 1;
    }

    // 3. Third Place
    if (result[third]) {
      result[third].pts += Math.round(5 * multiplier);
      result[third].thirdPlaces = (result[third].thirdPlaces ?? 0) + 1;
      result[third].podiums = (result[third].podiums ?? 0) + 1;
    }

    // 4. Fourth Place
    if (result[fourth]) {
      result[fourth].pts += Math.round(3 * multiplier);
      result[fourth].fourthPlaces = (result[fourth].fourthPlaces ?? 0) + 1;
    }

    // 5. Other participants receive +1 point for participation
    for (const p of tourney.participants) {
      if (!podiumIds.has(p.playerId)) {
        result[p.playerId].pts += 1;
      }
    }

    // 6. Accumulate cards from tournament if available
    if (tourney.cards) {
      for (const [pId, c] of Object.entries(tourney.cards)) {
        if (result[pId]) {
          result[pId].yellowCards = (result[pId].yellowCards ?? 0) + c.yellow;
          result[pId].redCards = (result[pId].redCards ?? 0) + c.red;
        }
      }
    }
  }

  return result;
}

/**
 * Sorts and ranks an annual ranking table for display (RF-78, RF-79).
 */
export function getSortedAnnualRanking(
  rankings: Record<PlayerId, AnnualRankingEntry>,
  players?: readonly Player[]
): SortedAnnualRankingEntry[] {
  const playersMap = new Map((players ?? []).map((p) => [p.id, p]));

  const entries = Object.values(rankings).map((entry) => {
    const player = playersMap.get(entry.playerId);
    const displayName = player ? formatPlayerName(player) : entry.playerId;
    return {
      ...entry,
      displayName,
    };
  });

  // Sort: pts DESC, championships DESC, runnerUps DESC, thirdPlaces DESC, tournamentsPlayed DESC, name ASC
  entries.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.championships !== a.championships) return b.championships - a.championships;
    if (b.runnerUps !== a.runnerUps) return b.runnerUps - a.runnerUps;
    const bThird = b.thirdPlaces ?? 0;
    const aThird = a.thirdPlaces ?? 0;
    if (bThird !== aThird) return bThird - aThird;
    if (b.tournamentsPlayed !== a.tournamentsPlayed) {
      return b.tournamentsPlayed - a.tournamentsPlayed;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

interface PlayerStatsAccumulator {
  playerId: PlayerId;
  goalsScored: number;
  goalsConceded: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  cleanSheets: number;
}

/**
 * Computes individual player distinctions:
 * - Bota de Oro: Top goalscorer (RF-77)
 * - Premio de Madera: Most losses or worst net balance (RF-77)
 * - Valla Invicta: Most clean sheets or least goals conceded (RF-77)
 */
export function computePlayerAwards(
  players: readonly Player[],
  matches?: readonly (MatchRecord | LeagueMatch | Series)[],
  _history?: readonly TournamentSummary[],
  stats?: Record<PlayerId, PlayerStats>
): DetailedAwardsLeaderboard {
  const playersMap = new Map(players.map((p) => [p.id, p]));
  const statsMap: Record<PlayerId, PlayerStatsAccumulator> = {};

  const initPlayerStats = (id: PlayerId): PlayerStatsAccumulator => {
    if (!statsMap[id]) {
      statsMap[id] = {
        playerId: id,
        goalsScored: 0,
        goalsConceded: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesDrawn: 0,
        matchesLost: 0,
        cleanSheets: 0,
      };
    }
    return statsMap[id];
  };

  // Pre-seed all registered players
  for (const p of players) {
    initPlayerStats(p.id);
  }

  const normalized = normalizeMatches(matches ?? []);

  if (normalized.length === 0 && stats) {
    for (const p of players) {
      const ps = stats[p.id];
      if (ps && ps.pj > 0) {
        const s = initPlayerStats(p.id);
        s.matchesPlayed = ps.pj;
        s.goalsScored = ps.gf;
        s.goalsConceded = ps.gc;
        s.matchesWon = ps.pg;
        s.matchesLost = ps.pp;
      }
    }
  }

  for (const m of normalized) {
    const sA = initPlayerStats(m.playerA);
    const sB = initPlayerStats(m.playerB);

    sA.matchesPlayed += 1;
    sB.matchesPlayed += 1;

    sA.goalsScored += m.scoreA;
    sA.goalsConceded += m.scoreB;
    sB.goalsScored += m.scoreB;
    sB.goalsConceded += m.scoreA;

    if (m.scoreA > m.scoreB) {
      sA.matchesWon += 1;
      sB.matchesLost += 1;
    } else if (m.scoreB > m.scoreA) {
      sB.matchesWon += 1;
      sA.matchesLost += 1;
    } else {
      sA.matchesDrawn += 1;
      sB.matchesDrawn += 1;
    }

    if (m.scoreB === 0) {
      sA.cleanSheets += 1;
    }
    if (m.scoreA === 0) {
      sB.cleanSheets += 1;
    }
  }

  const activePlayers = Object.values(statsMap).filter((s) => s.matchesPlayed > 0);

  if (activePlayers.length === 0) {
    return {
      goldenBoot: null,
      woodenSpoon: null,
      cleanSheet: null,
      details: {
        goldenBoot: null,
        woodenSpoon: null,
        cleanSheet: null,
      },
    };
  }

  // 1. Golden Boot (Bota de Oro): most goals scored (Tiebreak: fewer matches played, then alphabetical)
  const sortedScorers = [...activePlayers].sort((a, b) => {
    if (b.goalsScored !== a.goalsScored) return b.goalsScored - a.goalsScored;
    if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed - b.matchesPlayed;
    const nameA = playersMap.get(a.playerId)?.lastName ?? a.playerId;
    const nameB = playersMap.get(b.playerId)?.lastName ?? b.playerId;
    return nameA.localeCompare(nameB);
  });
  const bestScorer = sortedScorers[0]!;

  // 2. Wooden Spoon (Premio de Madera): most losses (Tiebreak: worst DG, then alphabetical)
  const sortedWooden = [...activePlayers].sort((a, b) => {
    if (b.matchesLost !== a.matchesLost) return b.matchesLost - a.matchesLost;
    const dgA = a.goalsScored - a.goalsConceded;
    const dgB = b.goalsScored - b.goalsConceded;
    if (dgA !== dgB) return dgA - dgB; // lower is worse
    const nameA = playersMap.get(a.playerId)?.lastName ?? a.playerId;
    const nameB = playersMap.get(b.playerId)?.lastName ?? b.playerId;
    return nameA.localeCompare(nameB);
  });
  const worstPlayer = sortedWooden[0]!;

  // 3. Clean Sheet (Valla Invicta): most clean sheets (Tiebreak: fewer goals conceded, then alphabetical)
  const sortedKeepers = [...activePlayers].sort((a, b) => {
    if (b.cleanSheets !== a.cleanSheets) return b.cleanSheets - a.cleanSheets;
    if (a.goalsConceded !== b.goalsConceded) return a.goalsConceded - b.goalsConceded;
    const nameA = playersMap.get(a.playerId)?.lastName ?? a.playerId;
    const nameB = playersMap.get(b.playerId)?.lastName ?? b.playerId;
    return nameA.localeCompare(nameB);
  });
  const bestKeeper = sortedKeepers[0]!;

  const getPlayerName = (id: PlayerId) => {
    const p = playersMap.get(id);
    return p ? formatPlayerName(p) : id;
  };

  return {
    goldenBoot: {
      playerId: bestScorer.playerId,
      goals: bestScorer.goalsScored,
    },
    woodenSpoon: {
      playerId: worstPlayer.playerId,
      losses: worstPlayer.matchesLost,
    },
    cleanSheet: {
      playerId: bestKeeper.playerId,
      cleanSheets: bestKeeper.cleanSheets,
    },
    details: {
      goldenBoot: {
        playerId: bestScorer.playerId,
        displayName: getPlayerName(bestScorer.playerId),
        count: bestScorer.goalsScored,
        secondaryCount: bestScorer.matchesPlayed,
      },
      woodenSpoon: {
        playerId: worstPlayer.playerId,
        displayName: getPlayerName(worstPlayer.playerId),
        count: worstPlayer.matchesLost,
        secondaryCount: worstPlayer.goalsScored - worstPlayer.goalsConceded,
      },
      cleanSheet: {
        playerId: bestKeeper.playerId,
        displayName: getPlayerName(bestKeeper.playerId),
        count: bestKeeper.cleanSheets,
        secondaryCount: bestKeeper.goalsConceded,
      },
    },
  };
}

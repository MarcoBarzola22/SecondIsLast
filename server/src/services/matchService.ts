import { PrismaClient, TournamentParticipant, Player } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';
import type { AuthUser } from '../types/auth.js';
import type { AppSocketServer } from '../sockets/index.js';
import {
  transitionMatchSubmit,
  transitionMatchConfirm,
  transitionMatchReject,
  MatchState,
  SubmitMatchPayload,
} from '../domain/handshake.js';
import {
  canPlayerPlayMatch,
  getMatchLockStatus,
  MatchForLock,
} from '../domain/sequentialLock.js';
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from './tournamentService.js';
import { historyService } from './historyService.js';

export { ConflictError, NotFoundError, BadRequestError, ForbiddenError };

export interface MatchWithParticipants {
  id: string;
  tournamentId: string;
  round: number;
  leg: number;
  seriesId: string | null;
  homeParticipantId: string;
  awayParticipantId: string | null;
  status: string;
  isBye: boolean;
  homeScore: number | null;
  awayScore: number | null;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  penaltiesWinnerId: string | null;
  version: number;
  submittedByParticipantId: string | null;
  submittedAt: Date | null;
  closedAt: Date | null;
  homeParticipant: TournamentParticipant & { player: Player };
  awayParticipant: (TournamentParticipant & { player: Player }) | null;
  penaltiesWinner?: (TournamentParticipant & { player: Player }) | null;
}

interface SeriesAdvancementTarget {
  winnerTo?: { seriesId: string; slot: 'home' | 'away' };
  loserTo?: { seriesId: string; slot: 'home' | 'away' };
}

/**
 * Maps series progression in knockout stages (Bracket & Double Elimination).
 */
export function getSeriesAdvancementTarget(
  seriesId: string,
  participantCount: number
): SeriesAdvancementTarget {
  switch (seriesId) {
    case 'R16_1':
      return { winnerTo: { seriesId: 'QF1', slot: 'home' } };
    case 'R16_2':
      return { winnerTo: { seriesId: 'QF3', slot: 'home' } };
    case 'QF1':
      return { winnerTo: { seriesId: 'SF1', slot: 'home' } };
    case 'QF2':
      if (participantCount === 6) {
        return { winnerTo: { seriesId: 'SF2', slot: 'home' } };
      }
      return { winnerTo: { seriesId: 'SF1', slot: 'away' } };
    case 'QF3':
      return { winnerTo: { seriesId: 'SF2', slot: 'home' } };
    case 'QF4':
      return { winnerTo: { seriesId: 'SF2', slot: 'away' } };
    case 'SF1':
      return {
        winnerTo: { seriesId: 'F', slot: 'home' },
        loserTo: { seriesId: 'TP', slot: 'home' },
      };
    case 'SF2':
      return {
        winnerTo: { seriesId: 'F', slot: 'away' },
        loserTo: { seriesId: 'TP', slot: 'away' },
      };
    // Double Elimination
    case 'WB_QF1':
      return {
        winnerTo: { seriesId: 'WB_SF1', slot: 'home' },
        loserTo: { seriesId: 'LB_R1', slot: 'home' },
      };
    case 'WB_SF1':
      return {
        winnerTo: { seriesId: 'WB_F', slot: 'home' },
        loserTo: { seriesId: 'LB_R1', slot: 'away' },
      };
    case 'WB_SF2':
      return {
        winnerTo: { seriesId: 'WB_F', slot: 'away' },
        loserTo: { seriesId: 'LB_R2', slot: 'home' },
      };
    case 'LB_R1':
      return { winnerTo: { seriesId: 'LB_R2', slot: 'away' } };
    case 'LB_R2':
      return { winnerTo: { seriesId: 'LB_F', slot: 'home' } };
    case 'WB_F':
      return {
        winnerTo: { seriesId: 'GF1', slot: 'home' },
        loserTo: { seriesId: 'LB_F', slot: 'away' },
      };
    case 'LB_F':
      return { winnerTo: { seriesId: 'GF1', slot: 'away' } };
    default:
      return {};
  }
}

/**
 * Determines winner and loser of a single or two-legged series.
 */
export function determineSeriesWinner(
  seriesMatches: any[]
): { winnerId: string | null; loserId: string | null } {
  if (seriesMatches.length === 1) {
    const m = seriesMatches[0];
    const homeGoals = m.homeScore ?? 0;
    const awayGoals = m.awayScore ?? 0;
    if (homeGoals > awayGoals) {
      return { winnerId: m.homeParticipantId, loserId: m.awayParticipantId };
    }
    if (awayGoals > homeGoals) {
      return { winnerId: m.awayParticipantId, loserId: m.homeParticipantId };
    }
    if (m.penaltiesWinnerId) {
      const loserId =
        m.penaltiesWinnerId === m.homeParticipantId
          ? m.awayParticipantId
          : m.homeParticipantId;
      return { winnerId: m.penaltiesWinnerId, loserId };
    }
    return { winnerId: null, loserId: null };
  }

  // Two-legged series
  const leg1 = seriesMatches.find((m) => m.leg === 1) || seriesMatches[0];
  const leg2 = seriesMatches.find((m) => m.leg === 2) || seriesMatches[1];

  const p1 = leg1.homeParticipantId;
  const p2 = leg1.awayParticipantId;

  const p1Goals =
    (leg1.homeScore ?? 0) +
    (leg2.awayParticipantId === p1 ? (leg2.awayScore ?? 0) : (leg2.homeScore ?? 0));
  const p2Goals =
    (leg1.awayScore ?? 0) +
    (leg2.homeParticipantId === p2 ? (leg2.homeScore ?? 0) : (leg2.awayScore ?? 0));

  if (p1Goals > p2Goals) {
    return { winnerId: p1, loserId: p2 };
  }
  if (p2Goals > p1Goals) {
    return { winnerId: p2, loserId: p1 };
  }

  const penWinner = leg2.penaltiesWinnerId ?? leg1.penaltiesWinnerId;
  if (penWinner) {
    const loserId = penWinner === p1 ? p2 : p1;
    return { winnerId: penWinner, loserId };
  }

  return { winnerId: null, loserId: null };
}

/**
 * Calculates live tournament standings table from all closed matches.
 */
export function calculateTournamentStandings(participants: any[], matches: any[]) {
  const map = new Map<string, any>();
  for (const p of participants) {
    map.set(p.id, {
      participantId: p.id,
      playerId: p.player?.id || p.playerId,
      playerName: `${p.player?.firstName || ''} ${p.player?.lastName || ''}`.trim(),
      assignedTeam: p.assignedTeam,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      yellowCards: 0,
      redCards: 0,
    });
  }

  for (const m of matches) {
    if (m.status !== 'CLOSED' || m.isBye) continue;

    const home = map.get(m.homeParticipantId);
    const away = m.awayParticipantId ? map.get(m.awayParticipantId) : null;

    const hScore = m.homeScore ?? 0;
    const aScore = m.awayScore ?? 0;

    if (home) {
      home.played += 1;
      home.goalsFor += hScore;
      home.goalsAgainst += aScore;
      home.goalDifference = home.goalsFor - home.goalsAgainst;
      home.yellowCards += m.homeYellowCards ?? 0;
      home.redCards += m.homeRedCards ?? 0;
      if (hScore > aScore) {
        home.won += 1;
        home.points += 3;
      } else if (hScore === aScore) {
        home.drawn += 1;
        home.points += 1;
      } else {
        home.lost += 1;
      }
    }

    if (away) {
      away.played += 1;
      away.goalsFor += aScore;
      away.goalsAgainst += hScore;
      away.goalDifference = away.goalsFor - away.goalsAgainst;
      away.yellowCards += m.awayYellowCards ?? 0;
      away.redCards += m.awayRedCards ?? 0;
      if (aScore > hScore) {
        away.won += 1;
        away.points += 3;
      } else if (aScore === hScore) {
        away.drawn += 1;
        away.points += 1;
      } else {
        away.lost += 1;
      }
    }
  }

  const list = Array.from(map.values());
  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.yellowCards - b.yellowCards;
  });

  return list.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

/**
 * Finds all participants that currently have an unblocked playable match.
 */
export function findUnblockedParticipants(participants: any[], matches: any[]): string[] {
  const matchesForLock: MatchForLock[] = matches.map((m) => ({
    id: m.id,
    round: m.round,
    leg: m.leg,
    homeParticipantId: m.homeParticipantId,
    awayParticipantId: m.awayParticipantId,
    status: m.status,
    isBye: m.isBye,
  }));

  const unblocked: string[] = [];
  for (const p of participants) {
    const hasPlayable = matches.some((m) => {
      if (m.status === 'CLOSED' || m.isBye) return false;
      if (m.homeParticipantId !== p.id && m.awayParticipantId !== p.id) return false;
      return canPlayerPlayMatch(
        matchesForLock,
        {
          id: m.id,
          round: m.round,
          leg: m.leg,
          homeParticipantId: m.homeParticipantId,
          awayParticipantId: m.awayParticipantId,
          status: m.status,
          isBye: m.isBye,
        },
        p.id
      );
    });
    if (hasPlayable) {
      unblocked.push(p.id);
    }
  }
  return unblocked;
}

export class MatchService {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  /**
   * Submits a match result by the Home player (RF-105, RF-106, RF-107).
   */
  /**
   * Retrieves a match with its participant and player relations.
   */
  async getMatchById(matchId: string): Promise<MatchWithParticipants | null> {
    return (await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeParticipant: { include: { player: true } },
        awayParticipant: { include: { player: true } },
        penaltiesWinner: { include: { player: true } },
      },
    })) as MatchWithParticipants | null;
  }

  async submitMatch(
    matchId: string,
    user: AuthUser,
    payload: SubmitMatchPayload,
    io?: AppSocketServer | null
  ): Promise<MatchWithParticipants> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeParticipant: { include: { player: { include: { user: true } } } },
        awayParticipant: { include: { player: { include: { user: true } } } },
        penaltiesWinner: { include: { player: true } },
      },
    });

    if (!match) {
      throw new NotFoundError('Partido no encontrado.');
    }

    // RF-106 & RF-112: Exclusively the Home player can submit scores. Admins cannot override.
    let isHome = Boolean(
      (user.playerId && match.homeParticipant?.playerId === user.playerId) ||
      (user.player?.id && match.homeParticipant?.playerId === user.player.id) ||
      (user.id && (match.homeParticipant?.player as any)?.userId === user.id) ||
      (user.email && (match.homeParticipant?.player as any)?.user?.email?.toLowerCase() === user.email?.toLowerCase())
    );

    if (!isHome && user.id) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { playerId: true, email: true },
      });
      if (dbUser?.playerId && match.homeParticipant?.playerId === dbUser.playerId) {
        isHome = true;
      }
    }

    if (!isHome && user.player && match.homeParticipant?.player) {
      const uFirst = user.player.firstName?.toLowerCase().trim();
      const uLast = user.player.lastName?.toLowerCase().trim();
      const hFirst = match.homeParticipant.player.firstName?.toLowerCase().trim();
      const hLast = match.homeParticipant.player.lastName?.toLowerCase().trim();
      if (uFirst && hFirst && uFirst === hFirst && (!uLast || !hLast || uLast === hLast)) {
        isHome = true;
      }
    }

    if (!match.homeParticipant || !isHome) {
      throw new ForbiddenError(
        'Acceso denegado: solo el participante Local asignado puede cargar el resultado del partido.'
      );
    }

    // Sequential Lock Validation (RF-114, RF-115)
    const allMatches = await this.prisma.match.findMany({
      where: { tournamentId: match.tournamentId },
      orderBy: [{ round: 'asc' }, { leg: 'asc' }, { createdAt: 'asc' }],
    });

    const allMatchesForLock: MatchForLock[] = allMatches.map((m) => ({
      id: m.id,
      round: m.round,
      leg: m.leg,
      homeParticipantId: m.homeParticipantId,
      awayParticipantId: m.awayParticipantId,
      status: m.status,
      isBye: m.isBye,
    }));

    const targetMatchForLock: MatchForLock = {
      id: match.id,
      round: match.round,
      leg: match.leg,
      homeParticipantId: match.homeParticipantId,
      awayParticipantId: match.awayParticipantId,
      status: match.status,
      isBye: match.isBye,
    };

    if (!canPlayerPlayMatch(allMatchesForLock, targetMatchForLock)) {
      const lockStatus = getMatchLockStatus(allMatchesForLock, targetMatchForLock);
      throw new BadRequestError(
        lockStatus.reason ||
          'El partido se encuentra bloqueado debido a partidos previos pendientes de cierre.'
      );
    }

    // Resolve penaltiesWinnerId
    let resolvedPenaltiesWinnerId = payload.penaltiesWinnerId ?? null;
    if (resolvedPenaltiesWinnerId) {
      if (match.homeParticipant && resolvedPenaltiesWinnerId === match.homeParticipant.playerId) {
        resolvedPenaltiesWinnerId = match.homeParticipantId;
      } else if (
        match.awayParticipant &&
        resolvedPenaltiesWinnerId === match.awayParticipant.playerId
      ) {
        resolvedPenaltiesWinnerId = match.awayParticipant.id;
      }
    }

    // Pure Domain Handshake Transition
    const matchState: MatchState = {
      id: match.id,
      homeParticipantId: match.homeParticipantId || '',
      awayParticipantId: match.awayParticipantId,
      status: match.status as any,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      homeYellowCards: match.homeYellowCards,
      awayYellowCards: match.awayYellowCards,
      homeRedCards: match.homeRedCards,
      awayRedCards: match.awayRedCards,
      penaltiesWinnerId: match.penaltiesWinnerId,
      version: match.version,
      isBye: match.isBye,
      round: match.round,
      leg: match.leg,
    };

    let nextState: MatchState;
    try {
      nextState = transitionMatchSubmit(matchState, match.homeParticipantId!, {
        homeScore: payload.homeScore,
        awayScore: payload.awayScore,
        homeYellowCards: payload.homeYellowCards,
        awayYellowCards: payload.awayYellowCards,
        homeRedCards: payload.homeRedCards,
        awayRedCards: payload.awayRedCards,
        penaltiesWinnerId: resolvedPenaltiesWinnerId,
        expectedVersion: payload.expectedVersion,
      });
    } catch (err: any) {
      if (err.message?.includes('Conflicto de concurrencia')) {
        throw new ConflictError(err.message);
      }
      if (err.message?.includes('Solo el jugador Local')) {
        throw new ForbiddenError(err.message);
      }
      throw new BadRequestError(err.message);
    }

    // Atomic CAS Update
    const updateResult = await this.prisma.match.updateMany({
      where: {
        id: match.id,
        version: payload.expectedVersion,
        status: 'PENDING_SUBMISSION',
      },
      data: {
        status: 'PENDING_CONFIRMATION',
        homeScore: nextState.homeScore,
        awayScore: nextState.awayScore,
        homeYellowCards: nextState.homeYellowCards,
        awayYellowCards: nextState.awayYellowCards,
        homeRedCards: nextState.homeRedCards,
        awayRedCards: nextState.awayRedCards,
        penaltiesWinnerId: nextState.penaltiesWinnerId,
        submittedByParticipantId: match.homeParticipantId,
        submittedAt: new Date(),
        version: nextState.version,
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictError(
        'Conflicto de concurrencia: el partido fue modificado simultáneamente por otra acción.'
      );
    }

    const updatedMatch = (await this.prisma.match.findUniqueOrThrow({
      where: { id: match.id },
      include: {
        homeParticipant: { include: { player: { include: { user: true } } } },
        awayParticipant: { include: { player: { include: { user: true } } } },
        penaltiesWinner: { include: { player: { include: { user: true } } } },
      },
    })) as MatchWithParticipants;

    if (io) {
      const submittedPayload = {
        matchId: updatedMatch.id,
        version: updatedMatch.version,
        homeScore: updatedMatch.homeScore,
        awayScore: updatedMatch.awayScore,
        penaltiesWinnerId: updatedMatch.penaltiesWinnerId,
        match: updatedMatch,
        awayPlayerId: updatedMatch.awayParticipant?.playerId,
        homePlayerId: updatedMatch.homeParticipant?.playerId,
        awayEmail: (updatedMatch.awayParticipant?.player as any)?.user?.email,
      };
      io.to(`tournament:${match.tournamentId}`).emit('match:submitted', submittedPayload);
      io.emit('match:submitted', submittedPayload);
    }

    return updatedMatch;
  }

  /**
   * Rejects a match result proposal exclusively by the Away player (RF-108, RF-109, RF-111, RF-112).
   */
  async rejectMatch(
    matchId: string,
    user: AuthUser,
    expectedVersion: number,
    io?: AppSocketServer | null
  ): Promise<MatchWithParticipants> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeParticipant: { include: { player: { include: { user: true } } } },
        awayParticipant: { include: { player: { include: { user: true } } } },
        penaltiesWinner: { include: { player: true } },
      },
    });

    if (!match) {
      throw new NotFoundError('Partido no encontrado.');
    }

    // RF-108 & RF-112: Exclusively the Away player can reject. Admins cannot override.
    let isAway = Boolean(
      (user.playerId && match.awayParticipant?.playerId === user.playerId) ||
      (user.player?.id && match.awayParticipant?.playerId === user.player.id) ||
      (user.id && (match.awayParticipant?.player as any)?.userId === user.id) ||
      (user.email && (match.awayParticipant?.player as any)?.user?.email?.toLowerCase() === user.email?.toLowerCase())
    );

    if (!isAway && user.id) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { playerId: true, email: true },
      });
      if (dbUser?.playerId && match.awayParticipant?.playerId === dbUser.playerId) {
        isAway = true;
      }
    }

    if (!isAway && user.player && match.awayParticipant?.player) {
      const uFirst = user.player.firstName?.toLowerCase().trim();
      const uLast = user.player.lastName?.toLowerCase().trim();
      const aFirst = match.awayParticipant.player.firstName?.toLowerCase().trim();
      const aLast = match.awayParticipant.player.lastName?.toLowerCase().trim();
      if (uFirst && aFirst && uFirst === aFirst && (!uLast || !aLast || uLast === aLast)) {
        isAway = true;
      }
    }

    if (!match.awayParticipant || !isAway) {
      throw new ForbiddenError(
        'Acceso denegado: solo el participante Visitante asignado puede rechazar el resultado del partido.'
      );
    }

    const matchState: MatchState = {
      id: match.id,
      homeParticipantId: match.homeParticipantId || '',
      awayParticipantId: match.awayParticipantId,
      status: match.status as any,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      homeYellowCards: match.homeYellowCards,
      awayYellowCards: match.awayYellowCards,
      homeRedCards: match.homeRedCards,
      awayRedCards: match.awayRedCards,
      penaltiesWinnerId: match.penaltiesWinnerId,
      version: match.version,
      isBye: match.isBye,
      round: match.round,
      leg: match.leg,
    };

    let nextState: MatchState;
    try {
      nextState = transitionMatchReject(
        matchState,
        match.awayParticipantId!,
        expectedVersion
      );
    } catch (err: any) {
      if (err.message?.includes('Conflicto de concurrencia')) {
        throw new ConflictError(err.message);
      }
      if (err.message?.includes('Solo el jugador Visitante')) {
        throw new ForbiddenError(err.message);
      }
      throw new BadRequestError(err.message);
    }

    const updateResult = await this.prisma.match.updateMany({
      where: {
        id: match.id,
        version: expectedVersion,
        status: 'PENDING_CONFIRMATION',
      },
      data: {
        status: 'PENDING_SUBMISSION',
        version: nextState.version,
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictError(
        'Conflicto de concurrencia: el resultado fue modificado simultáneamente por otra acción.'
      );
    }

    const updatedMatch = (await this.prisma.match.findUniqueOrThrow({
      where: { id: match.id },
      include: {
        homeParticipant: { include: { player: { include: { user: true } } } },
        awayParticipant: { include: { player: { include: { user: true } } } },
        penaltiesWinner: { include: { player: { include: { user: true } } } },
      },
    })) as MatchWithParticipants;

    if (io) {
      const rejectedPayload = {
        matchId: updatedMatch.id,
        version: updatedMatch.version,
      };
      io.to(`tournament:${match.tournamentId}`).emit('match:rejected', rejectedPayload);
      io.emit('match:rejected', rejectedPayload);
    }

    return updatedMatch;
  }

  /**
   * Confirms a match result exclusively by the Away player (RF-108, RF-109, RF-110, RF-112, RNF-2).
   * Executes atomic CAS update, advances knockout bracket, recalculates standings, and emits match:closed.
   */
  async confirmMatch(
    matchId: string,
    user: AuthUser,
    expectedVersion: number,
    io?: AppSocketServer | null
  ): Promise<{
    match: MatchWithParticipants;
    standings: any[];
    bracket: any[];
    unblockedParticipants: string[];
  }> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeParticipant: { include: { player: { include: { user: true } } } },
        awayParticipant: { include: { player: { include: { user: true } } } },
        penaltiesWinner: { include: { player: true } },
      },
    });

    if (!match) {
      throw new NotFoundError('Partido no encontrado.');
    }

    // RF-108 & RF-112: Exclusively the Away player can confirm. Admins cannot override.
    let isAway = Boolean(
      (user.playerId && match.awayParticipant?.playerId === user.playerId) ||
      (user.player?.id && match.awayParticipant?.playerId === user.player.id) ||
      (user.id && (match.awayParticipant?.player as any)?.userId === user.id) ||
      (user.email && (match.awayParticipant?.player as any)?.user?.email?.toLowerCase() === user.email?.toLowerCase())
    );

    if (!isAway && user.id) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { playerId: true, email: true },
      });
      if (dbUser?.playerId && match.awayParticipant?.playerId === dbUser.playerId) {
        isAway = true;
      }
    }

    if (!isAway && user.player && match.awayParticipant?.player) {
      const uFirst = user.player.firstName?.toLowerCase().trim();
      const uLast = user.player.lastName?.toLowerCase().trim();
      const aFirst = match.awayParticipant.player.firstName?.toLowerCase().trim();
      const aLast = match.awayParticipant.player.lastName?.toLowerCase().trim();
      if (uFirst && aFirst && uFirst === aFirst && (!uLast || !aLast || uLast === aLast)) {
        isAway = true;
      }
    }

    if (!match.awayParticipant || !isAway) {
      throw new ForbiddenError(
        'Acceso denegado: solo el participante Visitante asignado puede confirmar el resultado del partido.'
      );
    }

    const matchState: MatchState = {
      id: match.id,
      homeParticipantId: match.homeParticipantId || '',
      awayParticipantId: match.awayParticipantId,
      status: match.status as any,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      homeYellowCards: match.homeYellowCards,
      awayYellowCards: match.awayYellowCards,
      homeRedCards: match.homeRedCards,
      awayRedCards: match.awayRedCards,
      penaltiesWinnerId: match.penaltiesWinnerId,
      version: match.version,
      isBye: match.isBye,
      round: match.round,
      leg: match.leg,
    };

    let nextState: MatchState;
    try {
      nextState = transitionMatchConfirm(
        matchState,
        match.awayParticipantId!,
        expectedVersion
      );
    } catch (err: any) {
      if (err.message?.includes('Conflicto de concurrencia')) {
        throw new ConflictError(err.message);
      }
      if (err.message?.includes('Solo el jugador Visitante')) {
        throw new ForbiddenError(err.message);
      }
      throw new BadRequestError(err.message);
    }

    // Atomic Transaction in PostgreSQL (RNF-2)
    const result = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.match.updateMany({
        where: {
          id: match.id,
          version: expectedVersion,
          status: 'PENDING_CONFIRMATION',
        },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          version: nextState.version,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictError(
          'Conflicto de concurrencia: el resultado fue modificado simultáneamente por otra acción.'
        );
      }

      const tournament = await tx.tournament.findUniqueOrThrow({
        where: { id: match.tournamentId },
        include: {
          participants: { include: { player: { include: { user: true } } } },
        },
      });

      const allMatches = await tx.match.findMany({
        where: { tournamentId: match.tournamentId },
        orderBy: [{ round: 'asc' }, { leg: 'asc' }, { createdAt: 'asc' }],
      });

      // Advance winner and loser in knockout brackets if applicable
      if (match.seriesId && !match.seriesId.startsWith('BYE_')) {
        const seriesMatches = allMatches.filter((m) => m.seriesId === match.seriesId);
        const allSeriesClosed = seriesMatches.every(
          (m) => m.id === match.id || m.status === 'CLOSED'
        );

        if (allSeriesClosed) {
          const seriesWinnerResult = determineSeriesWinner(seriesMatches);
          if (seriesWinnerResult.winnerId) {
            const advancement = getSeriesAdvancementTarget(
              match.seriesId,
              tournament.participants.length
            );

            if (advancement.winnerTo) {
              await this.advanceParticipantToSeries(
                tx,
                match.tournamentId,
                advancement.winnerTo.seriesId,
                advancement.winnerTo.slot,
                seriesWinnerResult.winnerId
              );
            }

            if (advancement.loserTo && seriesWinnerResult.loserId) {
              await this.advanceParticipantToSeries(
                tx,
                match.tournamentId,
                advancement.loserTo.seriesId,
                advancement.loserTo.slot,
                seriesWinnerResult.loserId
              );
            }
          }
        }
      }

      // Re-fetch all matches with full relations after advancement
      const fullMatches = await tx.match.findMany({
        where: { tournamentId: match.tournamentId },
        include: {
          homeParticipant: { include: { player: { include: { user: true } } } },
          awayParticipant: { include: { player: { include: { user: true } } } },
          penaltiesWinner: { include: { player: true } },
        },
        orderBy: [{ round: 'asc' }, { leg: 'asc' }, { createdAt: 'asc' }],
      });

      const updatedMatch = fullMatches.find((m) => m.id === match.id)! as unknown as MatchWithParticipants;
      const standings = calculateTournamentStandings(tournament.participants, fullMatches);
      const unblockedParticipants = findUnblockedParticipants(
        tournament.participants,
        fullMatches
      );

      return {
        updatedMatch,
        standings,
        bracket: fullMatches,
        unblockedParticipants,
      };
    });

    // Broadcast WebSocket event `match:closed` (Plan §3.2 line 357)
    if (io) {
      const closedPayload = {
        matchId: result.updatedMatch.id,
        seriesId: result.updatedMatch.seriesId,
        match: result.updatedMatch,
        version: result.updatedMatch.version,
        standings: result.standings,
        bracket: result.bracket,
        unblockedParticipants: result.unblockedParticipants,
      };
      io.to(`tournament:${match.tournamentId}`).emit('match:closed', closedPayload);
      io.emit('match:closed', closedPayload);
    }

    // Auto-finalize tournament if all matches in the tournament are closed (RF-110)
    if (result.bracket.length > 0 && result.bracket.every((m: any) => m.status === 'CLOSED')) {
      try {
        await historyService.finalizeTournament(match.tournamentId, io);
      } catch (err) {
        console.error('[MatchService] Error auto-finalizing tournament:', err);
      }
    }

    return {
      match: result.updatedMatch,
      standings: result.standings,
      bracket: result.bracket,
      unblockedParticipants: result.unblockedParticipants,
    };
  }

  /**
   * Helper to advance a participant into a future bracket series.
   */
  private async advanceParticipantToSeries(
    tx: any,
    tournamentId: string,
    targetSeriesId: string,
    slot: 'home' | 'away',
    participantId: string
  ): Promise<void> {
    const targetMatches = await tx.match.findMany({
      where: {
        tournamentId,
        seriesId: targetSeriesId,
      },
      orderBy: { leg: 'asc' },
    });

    for (const tm of targetMatches) {
      const isLeg1 = tm.leg === 1;
      if (slot === 'home') {
        const updateData = isLeg1
          ? { homeParticipantId: participantId }
          : { awayParticipantId: participantId };
        await tx.match.update({
          where: { id: tm.id },
          data: updateData,
        });
      } else {
        const updateData = isLeg1
          ? { awayParticipantId: participantId }
          : { homeParticipantId: participantId };
        await tx.match.update({
          where: { id: tm.id },
          data: updateData,
        });
      }
    }
  }
}

export const matchService = new MatchService();

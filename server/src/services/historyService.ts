import { PrismaClient, TournamentStatus, Tournament } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';
import type { AppSocketServer } from '../sockets/index.js';
import {
  getTournamentPointsDistribution,
  getHeadToHeadKey,
  type TournamentPointsDistribution,
} from '../domain/awardsAndRankings.js';
import {
  determineSeriesWinner,
  calculateTournamentStandings,
} from './matchService.js';
import { BadRequestError, NotFoundError } from '../errors.js';

export interface TournamentPodium {
  champion: string;
  runnerUp: string;
  third: string;
  fourth: string;
}

export class HistoryService {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  /**
   * Retrieves accumulated historical stats for all players from PostgreSQL (RF-34, RF-110).
   */
  async getHistoricalStats() {
    return this.prisma.historicalStats.findMany({
      include: {
        player: true,
      },
      orderBy: [
        { podiums: 'desc' },
        { firstPlaces: 'desc' },
        { matchesWon: 'desc' },
        { goalsFor: 'desc' },
      ],
    });
  }

  /**
   * Retrieves annual ranking entries for a given year or all years (RF-78, RF-110).
   */
  async getAnnualRanking(year?: number) {
    const targetYear = year ?? new Date().getFullYear();

    return this.prisma.annualRankingEntry.findMany({
      where: { year: targetYear },
      include: {
        player: true,
      },
      orderBy: [
        { points: 'desc' },
        { podiums: 'desc' },
        { tournamentsPlayed: 'desc' },
      ],
    });
  }

  /**
   * Retrieves Head-to-Head records between players (RF-76, RF-110).
   */
  async getHeadToHead(playerAId?: string, playerBId?: string) {
    if (playerAId && playerBId) {
      const idA = playerAId < playerBId ? playerAId : playerBId;
      const idB = playerAId < playerBId ? playerBId : playerAId;

      return this.prisma.headToHeadRecord.findUnique({
        where: {
          playerAId_playerBId: {
            playerAId: idA,
            playerBId: idB,
          },
        },
        include: {
          playerA: true,
          playerB: true,
        },
      });
    }

    return this.prisma.headToHeadRecord.findMany({
      include: {
        playerA: true,
        playerB: true,
      },
      orderBy: { matchesPlayed: 'desc' },
    });
  }

  /**
   * Retrieves completed tournaments history (Principle 5).
   */
  async getCompletedTournaments() {
    return this.prisma.tournament.findMany({
      where: { status: TournamentStatus.COMPLETED },
      include: {
        participants: {
          include: { player: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Derives podium from finished matches based on tournament format.
   */
  derivePodium(
    tournament: { format: string | null; participants: any[] },
    matches: any[]
  ): TournamentPodium {
    const participants = tournament.participants;

    if (tournament.format === 'BRACKET') {
      const finalMatches = matches.filter((m) => m.seriesId === 'F');
      const finalRes = determineSeriesWinner(finalMatches);

      const tpMatches = matches.filter((m) => m.seriesId === 'TP');
      const tpRes = determineSeriesWinner(tpMatches);

      const champPart = participants.find((p) => p.id === finalRes.winnerId);
      const runnerPart = participants.find((p) => p.id === finalRes.loserId);
      const thirdPart = participants.find((p) => p.id === tpRes.winnerId);
      const fourthPart = participants.find((p) => p.id === tpRes.loserId);

      if (champPart && runnerPart) {
        return {
          champion: champPart.playerId,
          runnerUp: runnerPart.playerId,
          third: thirdPart?.playerId ?? participants[2]?.playerId ?? '',
          fourth: fourthPart?.playerId ?? participants[3]?.playerId ?? '',
        };
      }
    }

    if (tournament.format === 'DOUBLE_ELIMINATION') {
      const gfMatches = matches.filter((m) => m.seriesId === 'GF1' || m.seriesId === 'GF2');
      const gfRes = determineSeriesWinner(gfMatches);

      const lbFMatches = matches.filter((m) => m.seriesId === 'LB_F');
      const lbFRes = determineSeriesWinner(lbFMatches);

      const lbR2Matches = matches.filter((m) => m.seriesId === 'LB_R2');
      const lbR2Res = determineSeriesWinner(lbR2Matches);

      const champPart = participants.find((p) => p.id === gfRes.winnerId);
      const runnerPart = participants.find((p) => p.id === gfRes.loserId);
      const thirdPart = participants.find((p) => p.id === lbFRes.loserId);
      const fourthPart = participants.find((p) => p.id === lbR2Res.loserId);

      if (champPart && runnerPart) {
        return {
          champion: champPart.playerId,
          runnerUp: runnerPart.playerId,
          third: thirdPart?.playerId ?? participants[2]?.playerId ?? '',
          fourth: fourthPart?.playerId ?? participants[3]?.playerId ?? '',
        };
      }
    }

    // Default: League / Group Stage table ranking
    const standings = calculateTournamentStandings(participants, matches);
    const p1 = participants.find((p) => p.id === standings[0]?.participantId);
    const p2 = participants.find((p) => p.id === standings[1]?.participantId);
    const p3 = participants.find((p) => p.id === standings[2]?.participantId);
    const p4 = participants.find((p) => p.id === standings[3]?.participantId);

    return {
      champion: p1?.playerId ?? participants[0]?.playerId ?? '',
      runnerUp: p2?.playerId ?? participants[1]?.playerId ?? '',
      third: p3?.playerId ?? participants[2]?.playerId ?? '',
      fourth: p4?.playerId ?? participants[3]?.playerId ?? '',
    };
  }

  /**
   * Finalizes the tournament when all matches are CLOSED:
   * - Transitions tournament status to COMPLETED (RF-110).
   * - Calculates podium (1°, 2°, 3°, 4°) and points distribution (getTournamentPointsDistribution).
   * - Atomically updates HistoricalStats, HeadToHeadRecord, and AnnualRankingEntry in Prisma.
   * - Emits tournament:finished WebSocket event.
   */
  async finalizeTournament(
    tournamentId: string,
    io?: AppSocketServer | null
  ): Promise<{
    tournament: Tournament;
    podium: TournamentPodium;
    pointsDistribution: TournamentPointsDistribution;
  }> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: {
          include: { player: true },
        },
        matches: {
          include: {
            homeParticipant: { include: { player: true } },
            awayParticipant: { include: { player: true } },
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundError('Torneo no encontrado.');
    }

    // If already finalized, return current settings
    if (tournament.status === TournamentStatus.COMPLETED) {
      const existingSettings = (tournament.settings as any) || {};
      const podium = existingSettings.podium || {
        champion: tournament.winnerId || '',
        runnerUp: '',
        third: '',
        fourth: '',
      };
      const pointsDistribution =
        existingSettings.pointsDistribution ||
        getTournamentPointsDistribution(tournament.participants.length);

      return {
        tournament,
        podium,
        pointsDistribution,
      };
    }

    const matches = tournament.matches;
    const allClosed = matches.length > 0 && matches.every((m) => m.status === 'CLOSED');

    if (!allClosed) {
      throw new BadRequestError(
        'No se puede finalizar el torneo: aún hay partidos pendientes de disputa o confirmación.'
      );
    }

    const participants = tournament.participants;
    const podium = this.derivePodium(tournament, matches);
    const pointsDistribution = getTournamentPointsDistribution(participants.length);
    const currentYear = new Date().getFullYear();

    // RNF-2: Atomic transaction in PostgreSQL
    const updatedTournament = await this.prisma.$transaction(async (tx) => {
      // 1. Update HistoricalStats for each participant
      for (const part of participants) {
        const playerId = part.playerId;
        const partMatches = matches.filter(
          (m) => m.homeParticipantId === part.id || m.awayParticipantId === part.id
        );

        let pj = 0;
        let pg = 0;
        let pe = 0;
        let pp = 0;
        let gf = 0;
        let gc = 0;
        let ta = 0;
        let tr = 0;

        for (const m of partMatches) {
          const isHome = m.homeParticipantId === part.id;
          const myScore = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
          const rivalScore = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);

          pj += 1;
          gf += myScore;
          gc += rivalScore;
          ta += isHome ? (m.homeYellowCards ?? 0) : (m.awayYellowCards ?? 0);
          tr += isHome ? (m.homeRedCards ?? 0) : (m.awayRedCards ?? 0);

          if (myScore > rivalScore) {
            pg += 1;
          } else if (rivalScore > myScore) {
            pp += 1;
          } else {
            if (m.penaltiesWinnerId) {
              if (m.penaltiesWinnerId === part.id) {
                pg += 1;
              } else {
                pp += 1;
              }
            } else {
              pe += 1;
            }
          }
        }

        const isChamp = playerId === podium.champion;
        const isRunner = playerId === podium.runnerUp;
        const isThird = playerId === podium.third;
        const isPodium = isChamp || isRunner || isThird;

        await tx.historicalStats.upsert({
          where: { playerId },
          create: {
            playerId,
            matchesPlayed: pj,
            matchesWon: pg,
            matchesDrawn: pe,
            matchesLost: pp,
            goalsFor: gf,
            goalsAgainst: gc,
            yellowCards: ta,
            redCards: tr,
            podiums: isPodium ? 1 : 0,
            firstPlaces: isChamp ? 1 : 0,
            secondPlaces: isRunner ? 1 : 0,
            thirdPlaces: isThird ? 1 : 0,
          },
          update: {
            matchesPlayed: { increment: pj },
            matchesWon: { increment: pg },
            matchesDrawn: { increment: pe },
            matchesLost: { increment: pp },
            goalsFor: { increment: gf },
            goalsAgainst: { increment: gc },
            yellowCards: { increment: ta },
            redCards: { increment: tr },
            podiums: { increment: isPodium ? 1 : 0 },
            firstPlaces: { increment: isChamp ? 1 : 0 },
            secondPlaces: { increment: isRunner ? 1 : 0 },
            thirdPlaces: { increment: isThird ? 1 : 0 },
          },
        });

        // 2. Update AnnualRankingEntry for each participant
        let points = pointsDistribution.participation;
        if (isChamp) points = pointsDistribution.champion;
        else if (isRunner) points = pointsDistribution.runnerUp;
        else if (isThird) points = pointsDistribution.third;
        else if (playerId === podium.fourth) points = pointsDistribution.fourth;

        await tx.annualRankingEntry.upsert({
          where: {
            year_playerId: { year: currentYear, playerId },
          },
          create: {
            year: currentYear,
            playerId,
            points,
            tournamentsPlayed: 1,
            podiums: isPodium ? 1 : 0,
            yellowCards: ta,
            redCards: tr,
          },
          update: {
            points: { increment: points },
            tournamentsPlayed: { increment: 1 },
            podiums: { increment: isPodium ? 1 : 0 },
            yellowCards: { increment: ta },
            redCards: { increment: tr },
          },
        });
      }

      // 3. Update HeadToHeadRecord for all distinct pairs of players
      const h2hAccumulator = new Map<
        string,
        {
          playerAId: string;
          playerBId: string;
          played: number;
          winsA: number;
          winsB: number;
          draws: number;
          goalsA: number;
          goalsB: number;
        }
      >();

      for (const m of matches) {
        if (!m.awayParticipantId || m.homeScore === null || m.awayScore === null) {
          continue;
        }

        const pHome = participants.find((p) => p.id === m.homeParticipantId);
        const pAway = participants.find((p) => p.id === m.awayParticipantId);

        if (!pHome || !pAway || pHome.playerId === pAway.playerId) {
          continue;
        }

        const idA = pHome.playerId < pAway.playerId ? pHome.playerId : pAway.playerId;
        const idB = pHome.playerId < pAway.playerId ? pAway.playerId : pHome.playerId;
        const key = getHeadToHeadKey(idA, idB);

        const isHomeA = pHome.playerId === idA;
        const scoreA = isHomeA ? m.homeScore : m.awayScore;
        const scoreB = isHomeA ? m.awayScore : m.homeScore;

        let winA = 0;
        let winB = 0;
        let draw = 0;

        if (scoreA > scoreB) {
          winA = 1;
        } else if (scoreB > scoreA) {
          winB = 1;
        } else {
          if (m.penaltiesWinnerId) {
            const winnerIsHome = m.penaltiesWinnerId === m.homeParticipantId;
            if (winnerIsHome === isHomeA) winA = 1;
            else winB = 1;
          } else {
            draw = 1;
          }
        }

        const curr = h2hAccumulator.get(key) || {
          playerAId: idA,
          playerBId: idB,
          played: 0,
          winsA: 0,
          winsB: 0,
          draws: 0,
          goalsA: 0,
          goalsB: 0,
        };

        curr.played += 1;
        curr.winsA += winA;
        curr.winsB += winB;
        curr.draws += draw;
        curr.goalsA += scoreA;
        curr.goalsB += scoreB;

        h2hAccumulator.set(key, curr);
      }

      for (const rec of h2hAccumulator.values()) {
        await tx.headToHeadRecord.upsert({
          where: {
            playerAId_playerBId: {
              playerAId: rec.playerAId,
              playerBId: rec.playerBId,
            },
          },
          create: {
            playerAId: rec.playerAId,
            playerBId: rec.playerBId,
            matchesPlayed: rec.played,
            winsA: rec.winsA,
            winsB: rec.winsB,
            draws: rec.draws,
            goalsA: rec.goalsA,
            goalsB: rec.goalsB,
          },
          update: {
            matchesPlayed: { increment: rec.played },
            winsA: { increment: rec.winsA },
            winsB: { increment: rec.winsB },
            draws: { increment: rec.draws },
            goalsA: { increment: rec.goalsA },
            goalsB: { increment: rec.goalsB },
          },
        });
      }

      // 4. Update Tournament record
      return tx.tournament.update({
        where: { id: tournament.id },
        data: {
          status: TournamentStatus.COMPLETED,
          winnerId: podium.champion,
          settings: {
            ...((tournament.settings as any) || {}),
            podium,
            pointsDistribution,
          },
        },
      });
    });

    // 5. Broadcast tournament:finished via WebSocket
    if (io) {
      const champPlayer = participants.find((p) => p.playerId === podium.champion)?.player;
      const runnerPlayer = participants.find((p) => p.playerId === podium.runnerUp)?.player;
      const thirdPlayer = participants.find((p) => p.playerId === podium.third)?.player;
      const fourthPlayer = participants.find((p) => p.playerId === podium.fourth)?.player;

      const podiumWithNames = {
        ...podium,
        championName: champPlayer ? `${champPlayer.firstName} ${champPlayer.lastName}`.trim() : podium.champion,
        runnerUpName: runnerPlayer ? `${runnerPlayer.firstName} ${runnerPlayer.lastName}`.trim() : podium.runnerUp,
        thirdName: thirdPlayer ? `${thirdPlayer.firstName} ${thirdPlayer.lastName}`.trim() : podium.third,
        fourthName: fourthPlayer ? `${fourthPlayer.firstName} ${fourthPlayer.lastName}`.trim() : podium.fourth,
      };

      const finishedPayload = {
        tournamentId: tournament.id,
        status: 'COMPLETED',
        podium: podiumWithNames,
        pointsDistribution,
        winnerId: podium.champion,
      };

      io.to(`tournament:${tournament.id}`).emit('tournament:finished', finishedPayload);
      io.emit('tournament:finished', finishedPayload);
    }

    return {
      tournament: updatedTournament,
      podium,
      pointsDistribution,
    };
  }
}

export const historyService = new HistoryService();

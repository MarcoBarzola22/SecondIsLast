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
      return this.getDetailedH2H(playerAId, playerBId);
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
   * Retrieves all players from PostgreSQL database (T47).
   */
  async getAllPlayers() {
    return this.prisma.player.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  /**
   * Resets historical records and completed tournaments (T47 - Admin reset).
   */
  async resetHistory() {
    return this.prisma.$transaction(async (tx) => {
      await tx.annualRankingEntry.deleteMany({});
      await tx.headToHeadRecord.deleteMany({});
      await tx.historicalStats.deleteMany({});
      await tx.tournament.deleteMany({
        where: { status: TournamentStatus.COMPLETED },
      });
      return { success: true };
    });
  }

  /**
   * Retrieves all-time aggregated annual ranking entries (T47).
   */
  async getAllTimeAnnualRanking() {
    const entries = await this.prisma.annualRankingEntry.findMany({
      include: { player: true },
    });

    const playerMap = new Map<string, any>();
    for (const e of entries) {
      if (!playerMap.has(e.playerId)) {
        playerMap.set(e.playerId, {
          playerId: e.playerId,
          player: e.player,
          points: 0,
          tournamentsPlayed: 0,
          podiums: 0,
          yellowCards: 0,
          redCards: 0,
        });
      }
      const p = playerMap.get(e.playerId)!;
      p.points += e.points;
      p.tournamentsPlayed += e.tournamentsPlayed;
      p.podiums += e.podiums;
      p.yellowCards += e.yellowCards;
      p.redCards += e.redCards;
    }

    return Array.from(playerMap.values()).sort((a, b) => b.points - a.points);
  }

  /**
   * Calculates comprehensive Head-to-Head history between two players (T47).
   * Includes total match stats, series/eliminatorias history, penalties, and chronological encounter history.
   */
  async getDetailedH2H(playerAId: string, playerBId: string) {
    const idA = playerAId < playerBId ? playerAId : playerBId;
    const idB = playerAId < playerBId ? playerBId : playerAId;

    const baseRecord = await this.prisma.headToHeadRecord.findUnique({
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

    const tournaments = await this.prisma.tournament.findMany({
      where: {
        status: TournamentStatus.COMPLETED,
        participants: {
          some: { playerId: { in: [playerAId, playerBId] } },
        },
      },
      include: {
        participants: { include: { player: true } },
        matches: {
          include: {
            homeParticipant: { include: { player: true } },
            awayParticipant: { include: { player: true } },
            penaltiesWinner: { include: { player: true } },
          },
          orderBy: [{ round: 'asc' }, { leg: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let seriesPlayed = 0;
    let seriesWonA = 0;
    let seriesWonB = 0;
    let penaltiesPlayed = 0;
    let penaltiesWonA = 0;
    let penaltiesWonB = 0;
    const encountersHistory: Array<{
      id: string;
      tournamentId: string;
      tournamentName: string;
      tournamentDate: string;
      format: string;
      stage: string;
      teamA: string;
      teamB: string;
      scoreText: string;
      penaltiesText: string | null;
      winnerPlayerId: string | null;
      winnerName: string | null;
      outcomeBadge: string;
    }> = [];

    const formatStageName = (seriesId: string | null, round: number, format: string | null) => {
      if (!seriesId || format === 'LEAGUE') return `Fecha ${round}`;
      const s = seriesId.toUpperCase();
      if (s === 'F' || s.startsWith('F_')) return 'Final 🏆';
      if (s === 'GF1' || s === 'GF2') return 'Gran Final 🏆';
      if (s === 'TP') return '3er Puesto 🥉';
      if (s.startsWith('SF')) return 'Semifinal';
      if (s.startsWith('QF')) return 'Cuartos de Final';
      if (s.startsWith('R16')) return 'Octavos de Final';
      if (s.startsWith('WB_F')) return 'Final Llave Ganadores';
      if (s.startsWith('LB_F')) return 'Final Llave Perdedores';
      if (s.startsWith('WB_')) return 'Llave Ganadores';
      if (s.startsWith('LB_')) return 'Llave Perdedores';
      return `Ronda ${round}`;
    };

    for (const t of tournaments) {
      const partA = t.participants.find((p) => p.playerId === playerAId);
      const partB = t.participants.find((p) => p.playerId === playerBId);
      if (!partA || !partB) continue;

      const directMatches = t.matches.filter(
        (m) =>
          (m.homeParticipantId === partA.id && m.awayParticipantId === partB.id) ||
          (m.homeParticipantId === partB.id && m.awayParticipantId === partA.id)
      );
      if (directMatches.length === 0) continue;

      const nameA = `${partA.player.firstName} ${partA.player.lastName}`.trim();
      const nameB = `${partB.player.firstName} ${partB.player.lastName}`.trim();

      const isKnockoutFormat = t.format === 'BRACKET' || t.format === 'DOUBLE_ELIMINATION';

      if (isKnockoutFormat || (t.format === 'LEAGUE_PLAYOFFS' && directMatches.some((m) => m.seriesId))) {
        // Group by seriesId
        const seriesMap = new Map<string, typeof directMatches>();
        for (const m of directMatches) {
          const sId = m.seriesId || m.id;
          if (!seriesMap.has(sId)) seriesMap.set(sId, []);
          seriesMap.get(sId)!.push(m);
        }

        for (const [sId, sMatches] of seriesMap.entries()) {
          seriesPlayed++;
          const winnerRes = determineSeriesWinner(sMatches);
          const wonA = winnerRes.winnerId === partA.id;
          const wonB = winnerRes.winnerId === partB.id;

          if (wonA) seriesWonA++;
          if (wonB) seriesWonB++;

          const penMatch = sMatches.find((m) => m.penaltiesWinnerId);
          let penaltiesText: string | null = null;
          if (penMatch) {
            penaltiesPlayed++;
            if (penMatch.penaltiesWinnerId === partA.id) {
              penaltiesWonA++;
              penaltiesText = `🎯 ${partA.player.firstName} ganó por penales`;
            } else if (penMatch.penaltiesWinnerId === partB.id) {
              penaltiesWonB++;
              penaltiesText = `🎯 ${partB.player.firstName} ganó por penales`;
            }
          }

          let scoreText = '';
          if (sMatches.length === 1) {
            const m = sMatches[0];
            const scA = m.homeParticipantId === partA.id ? m.homeScore ?? 0 : m.awayScore ?? 0;
            const scB = m.homeParticipantId === partA.id ? m.awayScore ?? 0 : m.homeScore ?? 0;
            scoreText = `${scA} - ${scB}`;
          } else {
            const leg1 = sMatches.find((m) => m.leg === 1) || sMatches[0];
            const leg2 = sMatches.find((m) => m.leg === 2) || sMatches[1];
            const l1A = leg1.homeParticipantId === partA.id ? leg1.homeScore ?? 0 : leg1.awayScore ?? 0;
            const l1B = leg1.homeParticipantId === partA.id ? leg1.awayScore ?? 0 : leg1.homeScore ?? 0;
            const l2A = leg2.homeParticipantId === partA.id ? leg2.homeScore ?? 0 : leg2.awayScore ?? 0;
            const l2B = leg2.homeParticipantId === partA.id ? leg2.awayScore ?? 0 : leg2.homeScore ?? 0;
            const totA = l1A + l2A;
            const totB = l1B + l2B;
            scoreText = `Ida: ${l1A}-${l1B} | Vuelta: ${l2A}-${l2B} (Global ${totA}-${totB})`;
          }

          const stage = formatStageName(sId, sMatches[0].round, t.format);
          const isFinal = stage.includes('Final');

          let outcomeBadge = 'Serie empatada';
          if (wonA) {
            outcomeBadge = isFinal ? `🏆 ${partA.player.firstName} Campeón` : `✅ ${partA.player.firstName} avanzó de ronda`;
          } else if (wonB) {
            outcomeBadge = isFinal ? `🏆 ${partB.player.firstName} Campeón` : `✅ ${partB.player.firstName} avanzó de ronda`;
          }

          encountersHistory.push({
            id: sId,
            tournamentId: t.id,
            tournamentName: t.name,
            tournamentDate: t.createdAt.toISOString(),
            format: t.format || 'BRACKET',
            stage,
            teamA: partA.teamName || 'Sin equipo',
            teamB: partB.teamName || 'Sin equipo',
            scoreText,
            penaltiesText,
            winnerPlayerId: wonA ? playerAId : wonB ? playerBId : null,
            winnerName: wonA ? nameA : wonB ? nameB : null,
            outcomeBadge,
          });
        }
      } else {
        // Individual league/group matches
        for (const m of directMatches) {
          const scA = m.homeParticipantId === partA.id ? m.homeScore ?? 0 : m.awayScore ?? 0;
          const scB = m.homeParticipantId === partA.id ? m.awayScore ?? 0 : m.homeScore ?? 0;
          const wonA = scA > scB;
          const wonB = scB > scA;

          encountersHistory.push({
            id: m.id,
            tournamentId: t.id,
            tournamentName: t.name,
            tournamentDate: t.createdAt.toISOString(),
            format: t.format || 'LEAGUE',
            stage: formatStageName(m.seriesId, m.round, t.format),
            teamA: partA.teamName || 'Sin equipo',
            teamB: partB.teamName || 'Sin equipo',
            scoreText: `${scA} - ${scB}`,
            penaltiesText: null,
            winnerPlayerId: wonA ? playerAId : wonB ? playerBId : null,
            winnerName: wonA ? nameA : wonB ? nameB : null,
            outcomeBadge: wonA ? `Ganó ${partA.player.firstName}` : wonB ? `Ganó ${partB.player.firstName}` : 'Empate',
          });
        }
      }
    }

    const isDirectOrder = baseRecord ? baseRecord.playerAId === playerAId : true;
    const matchesPlayed = baseRecord?.matchesPlayed ?? encountersHistory.length;
    const winsA = baseRecord ? (isDirectOrder ? baseRecord.winsA : baseRecord.winsB) : encountersHistory.filter((e) => e.winnerPlayerId === playerAId).length;
    const winsB = baseRecord ? (isDirectOrder ? baseRecord.winsB : baseRecord.winsA) : encountersHistory.filter((e) => e.winnerPlayerId === playerBId).length;
    const draws = baseRecord ? baseRecord.draws : encountersHistory.filter((e) => !e.winnerPlayerId).length;
    const goalsA = baseRecord ? (isDirectOrder ? baseRecord.goalsA : baseRecord.goalsB) : 0;
    const goalsB = baseRecord ? (isDirectOrder ? baseRecord.goalsB : baseRecord.goalsA) : 0;

    return {
      playerAId,
      playerBId,
      playerA: baseRecord?.playerA ?? null,
      playerB: baseRecord?.playerB ?? null,
      matchesPlayed,
      winsA,
      winsB,
      draws,
      goalsA,
      goalsB,
      seriesPlayed,
      seriesWonA,
      seriesWonB,
      penaltiesPlayed,
      penaltiesWonA,
      penaltiesWonB,
      encountersHistory,
    };
  }

  /**
   * Retrieves full profile and historical performance for a player (T47).
   */
  async getPlayerProfile(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        stats: true,
      },
    });

    if (!player) {
      throw new NotFoundError('Jugador no encontrado.');
    }

    const tournaments = await this.prisma.tournament.findMany({
      where: {
        status: TournamentStatus.COMPLETED,
        participants: {
          some: { playerId },
        },
      },
      include: {
        participants: { include: { player: true } },
        matches: {
          include: {
            homeParticipant: { include: { player: true } },
            awayParticipant: { include: { player: true } },
            penaltiesWinner: { include: { player: true } },
          },
          orderBy: [{ round: 'asc' }, { leg: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let titles = 0;
    let runnerUps = 0;
    let thirdPlaces = 0;
    let fourthPlaces = 0;
    let podiums = 0;

    let seriesPlayed = 0;
    let seriesWon = 0;
    let seriesLost = 0;

    let penaltiesPlayed = 0;
    let penaltiesWon = 0;
    let penaltiesLost = 0;

    let pj = 0;
    let pg = 0;
    let pe = 0;
    let pp = 0;
    let gf = 0;
    let gc = 0;
    let yellowCards = 0;
    let redCards = 0;

    const teamsUsed: Array<{
      teamName: string;
      tournamentName: string;
      tournamentDate: string;
      placement: string;
      isChampion: boolean;
    }> = [];

    for (const t of tournaments) {
      const part = t.participants.find((p) => p.playerId === playerId);
      if (!part) continue;

      const podium = this.derivePodium(t, t.matches);
      const isChamp = podium.champion === playerId;
      const isRunner = podium.runnerUp === playerId;
      const isThird = podium.third === playerId;
      const isFourth = podium.fourth === playerId;

      if (isChamp) {
        titles++;
        podiums++;
      } else if (isRunner) {
        runnerUps++;
        podiums++;
      } else if (isThird) {
        thirdPlaces++;
        podiums++;
      } else if (isFourth) {
        fourthPlaces++;
      }

      let placement = 'Fase de Grupos / Eliminado';
      if (isChamp) placement = 'Campeón 🏆';
      else if (isRunner) placement = 'Subcampeón 🥈';
      else if (isThird) placement = '3° Puesto 🥉';
      else if (isFourth) placement = '4° Puesto';

      teamsUsed.push({
        teamName: part.teamName || 'Sin equipo',
        tournamentName: t.name,
        tournamentDate: t.createdAt.toISOString(),
        placement,
        isChampion: isChamp,
      });

      // Matches involving this participant
      const pMatches = t.matches.filter(
        (m) => (m.homeParticipantId === part.id || m.awayParticipantId === part.id) && !m.isBye
      );

      for (const m of pMatches) {
        pj++;
        const isHome = m.homeParticipantId === part.id;
        const hScore = m.homeScore ?? 0;
        const aScore = m.awayScore ?? 0;
        const myScore = isHome ? hScore : aScore;
        const oppScore = isHome ? aScore : hScore;

        gf += myScore;
        gc += oppScore;
        yellowCards += isHome ? m.homeYellowCards ?? 0 : m.awayYellowCards ?? 0;
        redCards += isHome ? m.homeRedCards ?? 0 : m.awayRedCards ?? 0;

        if (myScore > oppScore) pg++;
        else if (myScore < oppScore) pp++;
        else pe++;

        if (m.penaltiesWinnerId) {
          penaltiesPlayed++;
          if (m.penaltiesWinnerId === part.id) penaltiesWon++;
          else penaltiesLost++;
        }
      }

      // Knockout series
      const isKnockoutFormat = t.format === 'BRACKET' || t.format === 'DOUBLE_ELIMINATION';
      if (isKnockoutFormat || (t.format === 'LEAGUE_PLAYOFFS' && pMatches.some((m) => m.seriesId))) {
        const seriesMap = new Map<string, typeof pMatches>();
        for (const m of pMatches) {
          const sId = m.seriesId || m.id;
          if (!seriesMap.has(sId)) seriesMap.set(sId, []);
          seriesMap.get(sId)!.push(m);
        }

        for (const [, sMatches] of seriesMap.entries()) {
          seriesPlayed++;
          const winnerRes = determineSeriesWinner(sMatches);
          if (winnerRes.winnerId === part.id) {
            seriesWon++;
          } else if (winnerRes.loserId === part.id || (winnerRes.winnerId && winnerRes.winnerId !== part.id)) {
            seriesLost++;
          }
        }
      }
    }

    const tournamentsPlayed = tournaments.length;
    const effectivenessPct = tournamentsPlayed > 0 ? (podiums / tournamentsPlayed) * 100 : 0;
    const titlePct = tournamentsPlayed > 0 ? (titles / tournamentsPlayed) * 100 : 0;
    const seriesEffectivenessPct = seriesPlayed > 0 ? (seriesWon / seriesPlayed) * 100 : 0;
    const penaltiesEffectivenessPct = penaltiesPlayed > 0 ? (penaltiesWon / penaltiesPlayed) * 100 : 0;

    const pendingYellows = player.pendingYellowCards ?? 0;
    const pendingReds = player.pendingRedCards ?? 0;
    const suspendedDates = Math.floor(pendingYellows / 4) + pendingReds;

    return {
      player: {
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        pendingYellowCards: pendingYellows,
        pendingRedCards: pendingReds,
        suspendedDates,
      },
      career: {
        tournamentsPlayed,
        titles,
        runnerUps,
        thirdPlaces,
        fourthPlaces,
        podiums,
        effectivenessPct: Number(effectivenessPct.toFixed(1)),
        titlePct: Number(titlePct.toFixed(1)),
      },
      manoAMano: {
        seriesPlayed,
        seriesWon,
        seriesLost,
        seriesEffectivenessPct: Number(seriesEffectivenessPct.toFixed(1)),
        penaltiesPlayed,
        penaltiesWon,
        penaltiesLost,
        penaltiesEffectivenessPct: Number(penaltiesEffectivenessPct.toFixed(1)),
      },
      stats: {
        pj,
        pg,
        pe,
        pp,
        gf,
        gc,
        dg: gf - gc,
        yellowCards,
        redCards,
      },
      discipline: {
        pendingYellowCards: pendingYellows,
        pendingRedCards: pendingReds,
        suspendedDates,
        statusText:
          suspendedDates > 0
            ? `🚨 Sancionado: Debe ${suspendedDates} fecha${suspendedDates > 1 ? 's' : ''} (Su mejor jugador no puede jugar el próximo partido)`
            : pendingYellows > 0
            ? `Acumula ${pendingYellows % 4}/4 amarillas hacia la próxima sanción`
            : 'Limpio sin tarjetas pendientes',
      },
      teamsUsed,
    };
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

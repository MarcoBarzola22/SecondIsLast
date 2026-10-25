import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';
import { BadRequestError } from '../errors.js';

export interface MigrationResult {
  success: boolean;
  migrated: {
    playersCount: number;
    statsCount: number;
    h2hCount: number;
    annualRankingsCount: number;
  };
  message: string;
}

export class MigrationService {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  /**
   * Idempotent migration of AppData (schemaVersion: 2) exported from localStorage into PostgreSQL.
   * Restores Player, HistoricalStats, HeadToHeadRecord, and AnnualRankingEntry without duplicating records.
   */
  async migrateLocalData(rawPayload: any): Promise<MigrationResult> {
    if (!rawPayload || typeof rawPayload !== 'object') {
      throw new BadRequestError('El payload de migración debe ser un objeto JSON válido.');
    }

    // Support nested appData or direct payload
    const appData = rawPayload.appData || rawPayload;

    // Validate schemaVersion if provided (RF-80)
    if (appData.schemaVersion !== undefined && appData.schemaVersion !== 2 && appData.schemaVersion !== 1) {
      throw new BadRequestError(
        `Versión de esquema ${appData.schemaVersion} no soportada. Se requiere schemaVersion: 2.`
      );
    }

    if (!Array.isArray(appData.players)) {
      throw new BadRequestError('El backup debe contener un arreglo de jugadores ("players").');
    }

    return this.prisma.$transaction(async (tx) => {
      // Map local playerId (or name) to canonical PostgreSQL Player.id
      const localToDbPlayerId = new Map<string, string>();

      // 1. Upsert Players (Idempotent by @@unique([firstName, lastName]))
      for (const p of appData.players) {
        const firstName = (p.firstName || '').trim();
        const lastName = (p.lastName || '').trim();

        if (!firstName || !lastName) continue;

        const existing = await tx.player.findUnique({
          where: {
            firstName_lastName: { firstName, lastName },
          },
        });

        let dbPlayerId: string;

        if (existing) {
          dbPlayerId = existing.id;
        } else {
          const created = await tx.player.create({
            data: {
              id: p.id || undefined,
              firstName,
              lastName,
            },
          });
          dbPlayerId = created.id;
        }

        if (p.id) {
          localToDbPlayerId.set(p.id, dbPlayerId);
        }
        localToDbPlayerId.set(`${firstName.toLowerCase()}_${lastName.toLowerCase()}`, dbPlayerId);
      }

      // 2. Derive podium finishes from history (if present in backup)
      const podiumMap = new Map<
        string,
        { first: number; second: number; third: number; totalPodiums: number }
      >();

      if (Array.isArray(appData.history)) {
        for (const t of appData.history) {
          if (t && t.podium) {
            const champDbId = t.podium.champion ? localToDbPlayerId.get(t.podium.champion) : null;
            const runnerDbId = t.podium.runnerUp ? localToDbPlayerId.get(t.podium.runnerUp) : null;
            const thirdDbId = t.podium.third ? localToDbPlayerId.get(t.podium.third) : null;

            if (champDbId) {
              const current = podiumMap.get(champDbId) || { first: 0, second: 0, third: 0, totalPodiums: 0 };
              current.first += 1;
              current.totalPodiums += 1;
              podiumMap.set(champDbId, current);
            }
            if (runnerDbId) {
              const current = podiumMap.get(runnerDbId) || { first: 0, second: 0, third: 0, totalPodiums: 0 };
              current.second += 1;
              current.totalPodiums += 1;
              podiumMap.set(runnerDbId, current);
            }
            if (thirdDbId) {
              const current = podiumMap.get(thirdDbId) || { first: 0, second: 0, third: 0, totalPodiums: 0 };
              current.third += 1;
              current.totalPodiums += 1;
              podiumMap.set(thirdDbId, current);
            }
          }
        }
      }

      // 3. Upsert HistoricalStats (Idempotent by @unique playerId)
      let statsMigratedCount = 0;
      if (appData.stats && typeof appData.stats === 'object') {
        for (const [localId, rawStat] of Object.entries(appData.stats)) {
          const dbPlayerId = localToDbPlayerId.get(localId);
          if (!dbPlayerId) continue;

          const s = rawStat as any;
          const pj = typeof s.pj === 'number' ? s.pj : 0;
          const pg = typeof s.pg === 'number' ? s.pg : 0;
          const pp = typeof s.pp === 'number' ? s.pp : 0;
          const pe = Math.max(0, pj - pg - pp);
          const gf = typeof s.gf === 'number' ? s.gf : 0;
          const gc = typeof s.gc === 'number' ? s.gc : 0;
          const yellowCards = typeof s.yellowCards === 'number' ? s.yellowCards : (s.tj || 0);
          const redCards = typeof s.redCards === 'number' ? s.redCards : 0;

          const pInfo = podiumMap.get(dbPlayerId);
          const podiums = typeof s.podiums === 'number' ? s.podiums : (pInfo?.totalPodiums || 0);
          const firstPlaces = pInfo?.first || 0;
          const secondPlaces = pInfo?.second || 0;
          const thirdPlaces = pInfo?.third || 0;

          await tx.historicalStats.upsert({
            where: { playerId: dbPlayerId },
            create: {
              playerId: dbPlayerId,
              matchesPlayed: pj,
              matchesWon: pg,
              matchesDrawn: pe,
              matchesLost: pp,
              goalsFor: gf,
              goalsAgainst: gc,
              yellowCards,
              redCards,
              podiums,
              firstPlaces,
              secondPlaces,
              thirdPlaces,
            },
            update: {
              matchesPlayed: pj,
              matchesWon: pg,
              matchesDrawn: pe,
              matchesLost: pp,
              goalsFor: gf,
              goalsAgainst: gc,
              yellowCards,
              redCards,
              podiums,
              firstPlaces,
              secondPlaces,
              thirdPlaces,
            },
          });

          statsMigratedCount++;
        }
      }

      // 4. Upsert HeadToHeadRecord (Idempotent by @@unique([playerAId, playerBId]))
      let h2hMigratedCount = 0;
      if (appData.headToHead && typeof appData.headToHead === 'object') {
        for (const rawH2h of Object.values(appData.headToHead)) {
          const h = rawH2h as any;
          if (!h || !h.playerA || !h.playerB) continue;

          const dbA = localToDbPlayerId.get(h.playerA);
          const dbB = localToDbPlayerId.get(h.playerB);
          if (!dbA || !dbB || dbA === dbB) continue;

          const idA = dbA < dbB ? dbA : dbB;
          const idB = dbA < dbB ? dbB : dbA;
          const isCanonical = dbA === idA;

          const winsA = isCanonical ? (h.winsA || 0) : (h.winsB || 0);
          const winsB = isCanonical ? (h.winsB || 0) : (h.winsA || 0);
          const goalsA = isCanonical ? (h.goalsA || 0) : (h.goalsB || 0);
          const goalsB = isCanonical ? (h.goalsB || 0) : (h.goalsA || 0);
          const draws = typeof h.draws === 'number' ? h.draws : 0;
          const matchesPlayed = typeof h.played === 'number' ? h.played : (winsA + winsB + draws);

          await tx.headToHeadRecord.upsert({
            where: {
              playerAId_playerBId: {
                playerAId: idA,
                playerBId: idB,
              },
            },
            create: {
              playerAId: idA,
              playerBId: idB,
              matchesPlayed,
              winsA,
              winsB,
              draws,
              goalsA,
              goalsB,
            },
            update: {
              matchesPlayed,
              winsA,
              winsB,
              draws,
              goalsA,
              goalsB,
            },
          });

          h2hMigratedCount++;
        }
      }

      // 5. Upsert AnnualRankingEntry (Idempotent by @@unique([year, playerId]))
      let annualRankingsCount = 0;
      if (appData.annualRankings && typeof appData.annualRankings === 'object') {
        for (const [yearStr, entries] of Object.entries(appData.annualRankings)) {
          const year = parseInt(yearStr, 10);
          if (isNaN(year) || !entries || typeof entries !== 'object') continue;

          for (const [localId, rawEntry] of Object.entries(entries as any)) {
            const dbPlayerId = localToDbPlayerId.get(localId);
            if (!dbPlayerId) continue;

            const e = rawEntry as any;
            const points = typeof e.pts === 'number' ? e.pts : 0;
            const tournamentsPlayed = typeof e.tournamentsPlayed === 'number' ? e.tournamentsPlayed : 0;
            const podiums =
              typeof e.podiums === 'number'
                ? e.podiums
                : ((e.championships || 0) + (e.runnerUps || 0) + (e.thirdPlaces || 0));
            const yellowCards = typeof e.yellowCards === 'number' ? e.yellowCards : 0;
            const redCards = typeof e.redCards === 'number' ? e.redCards : 0;

            await tx.annualRankingEntry.upsert({
              where: {
                year_playerId: {
                  year,
                  playerId: dbPlayerId,
                },
              },
              create: {
                year,
                playerId: dbPlayerId,
                points,
                tournamentsPlayed,
                podiums,
                yellowCards,
                redCards,
              },
              update: {
                points,
                tournamentsPlayed,
                podiums,
                yellowCards,
                redCards,
              },
            });

            annualRankingsCount++;
          }
        }
      }

      return {
        success: true,
        migrated: {
          playersCount: appData.players.length,
          statsCount: statsMigratedCount,
          h2hCount: h2hMigratedCount,
          annualRankingsCount,
        },
        message: 'Migración de datos locales a PostgreSQL completada con éxito de forma idempotente.',
      };
    });
  }
}

export const migrationService = new MigrationService();

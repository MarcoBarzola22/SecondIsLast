import { PrismaClient, Role, User, WhitelistEntry } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';
import { config } from './env.js';

export interface SeedResult {
  whitelistEntry: WhitelistEntry;
  user: User;
}

export type SeedDatabase = Pick<PrismaClient, 'whitelistEntry' | 'user'>;

export interface DevPlayerSeed {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

export const DEV_PLAYERS: DevPlayerSeed[] = [
  {
    email: 'admin@example.com',
    firstName: 'Marco',
    lastName: 'Barzola',
    role: Role.ADMIN,
  },
  {
    email: 'juan@test.com',
    firstName: 'Juan',
    lastName: 'Torres',
    role: Role.PLAYER,
  },
  {
    email: 'santi@test.com',
    firstName: 'Santi',
    lastName: 'Aguilar',
    role: Role.PLAYER,
  },
  {
    email: 'marto@test.com',
    firstName: 'Marto',
    lastName: 'Audicio',
    role: Role.PLAYER,
  },
];

/**
 * Idempotently seeds the initial administrator into WhitelistEntry and User tables
 * using upsert operations based on the admin's email address.
 *
 * Satisfies RF-92 (Initial Administrator Configuration).
 */
export async function seedInitialAdmin(
  db: SeedDatabase = defaultPrisma,
  adminEmail: string = config.initialAdminEmail
): Promise<SeedResult> {
  const email = adminEmail.trim().toLowerCase();

  if (!email) {
    throw new Error('INITIAL_ADMIN_EMAIL no está configurado o es inválido.');
  }

  const whitelistEntry = await db.whitelistEntry.upsert({
    where: { email },
    update: {
      role: Role.ADMIN,
    },
    create: {
      email,
      role: Role.ADMIN,
    },
  });

  const user = await db.user.upsert({
    where: { email },
    update: {
      role: Role.ADMIN,
    },
    create: {
      email,
      name: 'Administrador',
      googleId: `seeded-admin-${email}`,
      role: Role.ADMIN,
    },
  });

  return { whitelistEntry, user };
}

/**
 * Idempotently seeds development players into Player, HistoricalStats,
 * WhitelistEntry, and User tables, ensuring 4 distinct players with active
 * whitelist and accounts ready for local multiplayer testing.
 */
export async function seedDevelopmentPlayers(
  prisma: PrismaClient = defaultPrisma
): Promise<void> {
  for (const item of DEV_PLAYERS) {
    const email = item.email.trim().toLowerCase();
    const fullName = `${item.firstName} ${item.lastName}`;

    // 1. Ensure Player profile exists
    const player = await prisma.player.upsert({
      where: {
        firstName_lastName: {
          firstName: item.firstName,
          lastName: item.lastName,
        },
      },
      update: {},
      create: {
        firstName: item.firstName,
        lastName: item.lastName,
        stats: {
          create: {},
        },
      },
    });

    // 2. Ensure HistoricalStats exists for player
    await prisma.historicalStats.upsert({
      where: { playerId: player.id },
      update: {},
      create: {
        playerId: player.id,
      },
    });

    // 3. Upsert WhitelistEntry linked to Player
    await prisma.whitelistEntry.upsert({
      where: { email },
      update: {
        role: item.role,
        playerId: player.id,
      },
      create: {
        email,
        role: item.role,
        playerId: player.id,
      },
    });

    // 4. Upsert User linked to Player
    await prisma.user.upsert({
      where: { email },
      update: {
        name: fullName,
        role: item.role,
        playerId: player.id,
      },
      create: {
        email,
        name: fullName,
        googleId: `dev-seed-${email}`,
        role: item.role,
        playerId: player.id,
      },
    });

    console.log(`[Seed] Jugador listo: ${fullName} <${email}> (Rol: ${item.role}, PlayerId: ${player.id})`);
  }
}

// Auto-run when executed directly via CLI
if (
  process.env.NODE_ENV !== 'test' &&
  process.argv[1] &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'))
) {
  (async () => {
    try {
      console.log('[Seed] Ejecutando sembrado inicial de base de datos...');
      await seedInitialAdmin();
      await seedDevelopmentPlayers();
      console.log('[Seed] Base de datos sembrada con éxito.');
      process.exit(0);
    } catch (err) {
      console.error('[Seed] Error al sembrar base de datos:', err);
      process.exit(1);
    }
  })();
}

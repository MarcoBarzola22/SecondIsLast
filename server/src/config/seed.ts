import { PrismaClient, Role, User, WhitelistEntry } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';
import { config } from './env.js';

export interface SeedResult {
  whitelistEntry: WhitelistEntry;
  user: User;
}

export type SeedDatabase = Pick<PrismaClient, 'whitelistEntry' | 'user'>;

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

// Auto-run when executed directly via CLI
if (
  process.env.NODE_ENV !== 'test' &&
  process.argv[1] &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'))
) {
  seedInitialAdmin()
    .then(({ whitelistEntry, user }) => {
      console.log(`[Seed] Admin inicial sembrado exitosamente: ${whitelistEntry.email} (Rol: ${user.role})`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed] Error al sembrar admin inicial:', err);
      process.exit(1);
    });
}

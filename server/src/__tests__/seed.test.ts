import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role, User, WhitelistEntry } from '@prisma/client';
import { seedInitialAdmin, SeedDatabase } from '../config/seed.js';
import { config } from '../config/env.js';

describe('seedInitialAdmin (RF-92)', () => {
  let mockDb: SeedDatabase;
  const mockWhitelistEntry: WhitelistEntry = {
    id: 'whitelist-1',
    email: 'admin@example.com',
    role: Role.ADMIN,
    playerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser: User = {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Administrador',
    googleId: 'seeded-admin-admin@example.com',
    role: Role.ADMIN,
    playerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockDb = {
      whitelistEntry: {
        upsert: vi.fn().mockResolvedValue(mockWhitelistEntry),
      } as unknown as SeedDatabase['whitelistEntry'],
      user: {
        upsert: vi.fn().mockResolvedValue(mockUser),
      } as unknown as SeedDatabase['user'],
    };
  });

  it('should seed admin idempotently with normalized email into WhitelistEntry and User', async () => {
    const result = await seedInitialAdmin(mockDb, '  Admin@Example.COM  ');

    expect(result).toEqual({
      whitelistEntry: mockWhitelistEntry,
      user: mockUser,
    });

    expect(mockDb.whitelistEntry.upsert).toHaveBeenCalledTimes(1);
    expect(mockDb.whitelistEntry.upsert).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
      update: { role: Role.ADMIN },
      create: {
        email: 'admin@example.com',
        role: Role.ADMIN,
      },
    });

    expect(mockDb.user.upsert).toHaveBeenCalledTimes(1);
    expect(mockDb.user.upsert).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
      update: { role: Role.ADMIN },
      create: {
        email: 'admin@example.com',
        name: 'Administrador',
        googleId: 'seeded-admin-admin@example.com',
        role: Role.ADMIN,
      },
    });
  });

  it('should guarantee idempotency on consecutive runs without duplicate errors', async () => {
    const firstRun = await seedInitialAdmin(mockDb, 'admin@example.com');
    const secondRun = await seedInitialAdmin(mockDb, 'admin@example.com');

    expect(firstRun.whitelistEntry.email).toBe('admin@example.com');
    expect(secondRun.whitelistEntry.email).toBe('admin@example.com');
    expect(mockDb.whitelistEntry.upsert).toHaveBeenCalledTimes(2);
    expect(mockDb.user.upsert).toHaveBeenCalledTimes(2);
  });

  it('should throw an error if the email is empty or only whitespace', async () => {
    await expect(seedInitialAdmin(mockDb, '')).rejects.toThrow(
      'INITIAL_ADMIN_EMAIL no está configurado o es inválido.'
    );
    await expect(seedInitialAdmin(mockDb, '   ')).rejects.toThrow(
      'INITIAL_ADMIN_EMAIL no está configurado o es inválido.'
    );
  });

  it('should fallback to config.initialAdminEmail if no custom email is provided', async () => {
    await seedInitialAdmin(mockDb);

    const expectedEmail = config.initialAdminEmail.trim().toLowerCase();
    expect(mockDb.whitelistEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: expectedEmail },
      })
    );
    expect(mockDb.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: expectedEmail },
      })
    );
  });
});

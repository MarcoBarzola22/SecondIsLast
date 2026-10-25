import { PrismaClient, Role, WhitelistEntry } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';

export interface AddWhitelistInput {
  email: string;
  role?: Role;
  playerId?: string | null;
}

export class WhitelistService {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  async listEntries(): Promise<WhitelistEntry[]> {
    return this.prisma.whitelistEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByEmail(email: string): Promise<WhitelistEntry | null> {
    const normalized = email.trim().toLowerCase();
    return this.prisma.whitelistEntry.findUnique({
      where: { email: normalized },
    });
  }

  async isEmailWhitelisted(email: string): Promise<boolean> {
    const entry = await this.getByEmail(email);
    return entry !== null;
  }

  async addEntry(input: AddWhitelistInput): Promise<WhitelistEntry> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.getByEmail(email);
    if (existing) {
      throw new Error('Este correo ya está registrado en la lista blanca.');
    }

    return this.prisma.whitelistEntry.create({
      data: {
        email,
        role: input.role || Role.PLAYER,
        playerId: input.playerId || null,
      },
    });
  }

  async removeEntry(id: string): Promise<WhitelistEntry> {
    const existing = await this.prisma.whitelistEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('La entrada de lista blanca no existe.');
    }

    return this.prisma.whitelistEntry.delete({
      where: { id },
    });
  }
}

export const whitelistService = new WhitelistService();

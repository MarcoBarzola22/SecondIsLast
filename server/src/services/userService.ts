import jwt from 'jsonwebtoken';
import { PrismaClient, User, Player } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';
import { config } from '../config/env.js';
import { whitelistService } from './whitelistService.js';
import { AuthUser } from '../types/auth.js';

export type UserWithPlayer = User & { player: Player | null };

export class UserService {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  signUserToken(user: UserWithPlayer | User): string {
    const player = (user as UserWithPlayer).player;
    const payload: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      playerId: user.playerId,
      player: player
        ? {
            id: player.id,
            firstName: player.firstName,
            lastName: player.lastName,
          }
        : null,
    };
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
  }

  async findById(id: string): Promise<UserWithPlayer | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { player: true },
    });
  }

  async findByEmail(email: string): Promise<UserWithPlayer | null> {
    const normalized = email.trim().toLowerCase();
    return this.prisma.user.findUnique({
      where: { email: normalized },
      include: { player: true },
    });
  }

  /**
   * Authenticates user against Whitelist, linking playerId to historical Player if assigned.
   * Satisfies RF-89 and RF-90.
   */
  async authenticateWithWhitelist(params: {
    email: string;
    name: string;
    googleId: string;
  }): Promise<{ user: UserWithPlayer; token: string }> {
    const email = params.email.trim().toLowerCase();

    // 1. Strict Whitelist validation (RF-89)
    const whitelistEntry = await whitelistService.getByEmail(email);
    if (!whitelistEntry) {
      throw new Error('No estás en la lista blanca de la juntada. Pedile al admin que te habilite');
    }

    // 2. Find or create/update User record with linked historical Player (RF-90)
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: { player: true },
    });

    // Whitelist assigned playerId has precedence, fallback to existing user's playerId
    const targetPlayerId = whitelistEntry.playerId || existingUser?.playerId || null;

    let user: UserWithPlayer;
    if (existingUser) {
      user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          googleId: params.googleId,
          name: params.name || existingUser.name,
          role: whitelistEntry.role,
          playerId: targetPlayerId,
        },
        include: { player: true },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          name: params.name,
          googleId: params.googleId,
          role: whitelistEntry.role,
          playerId: targetPlayerId,
        },
        include: { player: true },
      });
    }

    const token = this.signUserToken(user);
    return { user, token };
  }
}

export const userService = new UserService();

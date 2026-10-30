import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket, ServerOptions } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { whitelistService } from '../services/whitelistService.js';
import type { AuthUser } from '../types/auth.js';
import { registerLobbyHandlers } from './lobbyHandler.js';
import { registerVotingHandlers } from './votingHandler.js';
import { registerDrawHandlers } from './drawHandler.js';
import { registerDraftHandlers } from './draftHandler.js';
import { registerBracketSlotHandlers } from './bracketSlotHandler.js';

export type AppSocketServer = SocketIOServer;

/**
 * Extracts the JWT authentication token from socket handshake auth, headers, or cookies.
 */
export function extractTokenFromHandshake(socket: Socket): string | null {
  // 1. Auth payload: { auth: { token: '...' } }
  if (
    socket.handshake.auth?.token &&
    typeof socket.handshake.auth.token === 'string'
  ) {
    return socket.handshake.auth.token;
  }

  // 2. Authorization header: 'Bearer <token>'
  const authHeader = socket.handshake.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 3. Cookie header: 'token=<token>; ...'
  const cookieHeader = socket.handshake.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

/**
 * Socket.io connection middleware that enforces JWT validation and Whitelist membership (RNF-4).
 * Rejects unauthorized or non-whitelisted connections before socket establishment.
 */
export function createSocketAuthMiddleware(jwtSecret: string = config.jwtSecret) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const token = extractTokenFromHandshake(socket);
      if (!token) {
        return next(new Error('No autorizado: falta token de autenticación.'));
      }

      let decoded: AuthUser;
      try {
        decoded = jwt.verify(token, jwtSecret) as AuthUser;
      } catch {
        return next(new Error('Sesión inválida o expirada.'));
      }

      // Check Whitelist membership (RNF-4, RF-89)
      const isWhitelisted = await whitelistService.isEmailWhitelisted(decoded.email);
      if (!isWhitelisted) {
        return next(
          new Error(
            'No estás en la lista blanca de la juntada. Pedile al admin que te habilite'
          )
        );
      }

      socket.data.user = decoded;
      next();
    } catch (err: any) {
      next(new Error(err.message || 'Error de autenticación en WebSocket.'));
    }
  };
}

let socketServerInstance: AppSocketServer | null = null;

export function getSocketServer(): AppSocketServer | null {
  return socketServerInstance;
}

export function setSocketServer(io: AppSocketServer | null): void {
  socketServerInstance = io;
}

/**
 * Initializes and configures the Socket.io server integrated with the Express HTTP server (RNF-1).
 * Registers authentication middleware and room lifecycle handlers for `tournament:<tournamentId>`.
 */
export function initSocketServer(
  httpServer: HttpServer,
  options?: Partial<ServerOptions>
): AppSocketServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      credentials: true,
    },
    ...options,
  });

  setSocketServer(io);

  io.use(createSocketAuthMiddleware());

  io.on('connection', (socket: Socket) => {
    socket.on('error', (err) => {
      console.warn(`[Socket] Error on client socket ${socket.id}:`, err?.message || err);
    });

    // Auto-join room if tournamentId is supplied during connection handshake
    const initialTournamentId =
      socket.handshake.auth?.tournamentId ||
      socket.handshake.query?.tournamentId;

    if (
      initialTournamentId &&
      typeof initialTournamentId === 'string' &&
      initialTournamentId.trim()
    ) {
      socket.join(`tournament:${initialTournamentId.trim()}`);
    }

    // Handle joining room tournament:<tournamentId>
    socket.on(
      'tournament:join',
      (
        tournamentId: string,
        ack?: (res: { ok: boolean; room: string }) => void
      ) => {
        if (tournamentId && typeof tournamentId === 'string') {
          const room = `tournament:${tournamentId.trim()}`;
          socket.join(room);
          if (ack) ack({ ok: true, room });
        }
      }
    );

    socket.on(
      'join:tournament',
      (
        tournamentId: string,
        ack?: (res: { ok: boolean; room: string }) => void
      ) => {
        if (tournamentId && typeof tournamentId === 'string') {
          const room = `tournament:${tournamentId.trim()}`;
          socket.join(room);
          if (ack) ack({ ok: true, room });
        }
      }
    );

    // Handle leaving room tournament:<tournamentId>
    socket.on(
      'tournament:leave',
      (tournamentId: string, ack?: (res: { ok: boolean }) => void) => {
        if (tournamentId && typeof tournamentId === 'string') {
          const room = `tournament:${tournamentId.trim()}`;
          socket.leave(room);
          if (ack) ack({ ok: true });
        }
      }
    );

    // Register lobby, voting, draw, draft and bracket slot event listeners
    registerLobbyHandlers(io, socket);
    registerVotingHandlers(io, socket);
    registerDrawHandlers(io, socket);
    registerDraftHandlers(io, socket);
    registerBracketSlotHandlers(io, socket);
  });

  return io;
}


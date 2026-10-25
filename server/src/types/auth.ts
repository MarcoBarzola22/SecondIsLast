import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  name?: string;
  playerId?: string | null;
  player?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

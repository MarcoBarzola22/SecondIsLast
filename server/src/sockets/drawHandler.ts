import { Socket } from 'socket.io';
import type { AppSocketServer } from './index.js';
import { prisma as defaultPrisma } from '../db.js';
import type { DrawAnimationStep, DrawPlan } from '../domain/teams.js';

export interface DrawAnimatedPayload {
  step: number;
  totalSteps: number;
  currentItem: string;
  targetParticipantId?: string;
  participantName?: string;
  targetPlayerName?: string;
  isFinal: boolean;
  assignments?: Record<string, string>;
  method?: 'DIRECT_DRAW' | 'DRAFT_ORDER';
  draftOrder?: Array<{ order: number; participantId: string; playerId?: string; participantName: string }>;
}

export interface ActiveDrawSession {
  tournamentId: string;
  type: 'TEAM_ASSIGNMENT' | 'THEME_ROULETTE' | 'FORMAT_TIEBREAK';
  steps: DrawAnimationStep[];
  currentStepIndex: number;
  intervalMs: number;
  timer?: NodeJS.Timeout;
  resolvedState: {
    isComplete: boolean;
    assignments: Record<string, string>;
    method?: 'DIRECT_DRAW' | 'DRAFT_ORDER';
    draftOrder?: Array<{ order: number; participantId: string; playerId?: string; participantName: string }>;
  };
}

const activeDrawSessions = new Map<string, ActiveDrawSession>();

export function getActiveDrawSession(tournamentId: string): ActiveDrawSession | null {
  return activeDrawSessions.get(tournamentId) || null;
}

export function clearActiveDrawSessions(): void {
  for (const session of activeDrawSessions.values()) {
    if (session.timer) {
      clearInterval(session.timer);
    }
  }
  activeDrawSessions.clear();
}

export function cancelDrawAnimation(tournamentId: string): void {
  const session = activeDrawSessions.get(tournamentId);
  if (session?.timer) {
    clearInterval(session.timer);
  }
  activeDrawSessions.delete(tournamentId);
}

/**
 * Initiates and broadcasts a synchronized frame-by-frame draw animation to tournament room (RF-104).
 */
export function startDrawAnimation(
  io: AppSocketServer | null,
  tournamentId: string,
  plan: DrawPlan,
  onComplete?: () => Promise<void> | void,
  intervalMs: number = 1800
): ActiveDrawSession {
  // Clear any existing session for this tournament
  const existing = activeDrawSessions.get(tournamentId);
  if (existing?.timer) {
    clearInterval(existing.timer);
  }

  const session: ActiveDrawSession = {
    tournamentId,
    type: 'TEAM_ASSIGNMENT',
    steps: plan.steps,
    currentStepIndex: 0,
    intervalMs,
    resolvedState: {
      isComplete: false,
      assignments: plan.finalAssignments,
      method: plan.method,
      draftOrder: plan.draftOrder,
    },
  };

  activeDrawSessions.set(tournamentId, session);

  // Helper to emit a step
  const emitStep = (index: number) => {
    if (index >= plan.steps.length) return;
    const stepData = plan.steps[index]!;
    session.currentStepIndex = index;

    const payload: DrawAnimatedPayload = {
      step: stepData.step,
      totalSteps: stepData.totalSteps,
      currentItem: stepData.assignedTeam,
      targetParticipantId: stepData.participantId,
      participantName: stepData.participantName,
      targetPlayerName: stepData.participantName,
      isFinal: stepData.isFinal,
      assignments: stepData.isFinal ? plan.finalAssignments : undefined,
      method: plan.method,
      draftOrder: stepData.isFinal ? plan.draftOrder : undefined,
    };

    if (io) {
      try {
        io.to(`tournament:${tournamentId}`).emit('draw:animated', payload);
      } catch (err) {
        console.warn('[DrawHandler] Error emitting draw:animated:', err);
      }
    }

    if (stepData.isFinal) {
      session.resolvedState.isComplete = true;
      if (session.timer) {
        clearInterval(session.timer);
        session.timer = undefined;
      }
      if (onComplete) {
        Promise.resolve(onComplete()).catch((err) => {
          console.error('[DrawHandler] Error in onComplete callback:', err);
        });
      }
    }
  };

  // Emit first step immediately
  emitStep(0);

  // If there are more steps, schedule interval
  if (plan.steps.length > 1) {
    let currentIdx = 0;
    session.timer = setInterval(() => {
      try {
        currentIdx++;
        emitStep(currentIdx);
        if (currentIdx >= plan.steps.length - 1 && session.timer) {
          clearInterval(session.timer);
          session.timer = undefined;
        }
      } catch (err) {
        console.error('[DrawHandler] Error in draw interval:', err);
      }
    }, intervalMs);
  }

  return session;
}

/**
 * Registers WebSocket handlers for draw synchronization (RF-104 reconnection support).
 */
export function registerDrawHandlers(_io: AppSocketServer, socket: Socket): void {
  socket.on(
    'draw:sync',
    async (
      tournamentId: string,
      ack?: (res: {
        ok: boolean;
        inProgress: boolean;
        isComplete: boolean;
        currentStep?: number;
        totalSteps?: number;
        assignments: Record<string, string>;
        error?: string;
      }) => void
    ) => {
      try {
        const session = getActiveDrawSession(tournamentId);

        if (session) {
          const resData = {
            ok: true,
            inProgress: !session.resolvedState.isComplete,
            isComplete: session.resolvedState.isComplete,
            currentStep: session.currentStepIndex + 1,
            totalSteps: session.steps.length,
            assignments: session.resolvedState.assignments,
          };
          if (ack) ack(resData);
          socket.emit('draw:sync:response', resData);
          return;
        }

        // Check if teams already persisted in DB
        const participants = await defaultPrisma.tournamentParticipant.findMany({
          where: { tournamentId },
          select: { id: true, teamName: true },
        });

        const assignments: Record<string, string> = {};
        let allAssigned = participants.length > 0;

        for (const p of participants) {
          if (p.teamName) {
            assignments[p.id] = p.teamName;
          } else {
            allAssigned = false;
          }
        }

        const resData = {
          ok: true,
          inProgress: false,
          isComplete: allAssigned && participants.length > 0,
          assignments,
        };

        if (ack) ack(resData);
        socket.emit('draw:sync:response', resData);
      } catch (err: any) {
        const errorData = {
          ok: false,
          inProgress: false,
          isComplete: false,
          assignments: {},
          error: err.message || 'Error al sincronizar el sorteo.',
        };
        if (ack) ack(errorData);
        socket.emit('draw:sync:response', errorData);
      }
    }
  );
}

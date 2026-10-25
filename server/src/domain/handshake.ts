export type MatchStatus =
  | 'PENDING_SUBMISSION'
  | 'PENDING_CONFIRMATION'
  | 'CLOSED';

export interface MatchState {
  id: string;
  homeParticipantId: string;
  awayParticipantId: string | null;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  penaltiesWinnerId: string | null;
  version: number;
  isBye: boolean;
  round?: number;
  leg?: number;
}

export interface SubmitMatchPayload {
  homeScore: number;
  awayScore: number;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  penaltiesWinnerId?: string | null;
  expectedVersion: number;
}

/**
 * Validates integer goal counts between 0 and 99 (RF-106).
 */
function isValidGoalCount(score: number): boolean {
  return Number.isInteger(score) && score >= 0 && score <= 99;
}

/**
 * Validates non-negative integer card counts (RF-106).
 */
function isValidCardCount(cards: number): boolean {
  return Number.isInteger(cards) && cards >= 0;
}

/**
 * Helper to build an initial match representation.
 */
export function createInitialMatchState(
  id: string,
  homeParticipantId: string,
  awayParticipantId: string | null,
  isBye: boolean = false
): MatchState {
  return {
    id,
    homeParticipantId,
    awayParticipantId,
    status: isBye ? 'CLOSED' : 'PENDING_SUBMISSION',
    homeScore: null,
    awayScore: null,
    homeYellowCards: 0,
    awayYellowCards: 0,
    homeRedCards: 0,
    awayRedCards: 0,
    penaltiesWinnerId: null,
    version: 1,
    isBye,
  };
}

/**
 * Transitions a match from PENDING_SUBMISSION to PENDING_CONFIRMATION.
 * - Restricted exclusively to the Home participant (RF-106).
 * - Enforces version matching (OCC, RF-109).
 * - Increments match version by 1 (RF-107).
 *
 * @throws Error on invalid state, unauthorized actor, version mismatch or invalid payload values.
 */
export function transitionMatchSubmit(
  match: MatchState,
  actorParticipantId: string,
  payload: SubmitMatchPayload
): MatchState {
  if (match.status !== 'PENDING_SUBMISSION') {
    throw new Error('El partido no está pendiente de carga.');
  }

  if (actorParticipantId !== match.homeParticipantId) {
    throw new Error('Solo el jugador Local puede cargar el resultado.');
  }

  if (match.version !== payload.expectedVersion) {
    throw new Error(
      'Conflicto de concurrencia: el partido fue modificado previamente.'
    );
  }

  if (
    !isValidGoalCount(payload.homeScore) ||
    !isValidGoalCount(payload.awayScore)
  ) {
    throw new Error(
      'Goles inválidos: los marcadores deben ser números enteros entre 0 y 99.'
    );
  }

  if (
    !isValidCardCount(payload.homeYellowCards) ||
    !isValidCardCount(payload.awayYellowCards) ||
    !isValidCardCount(payload.homeRedCards) ||
    !isValidCardCount(payload.awayRedCards)
  ) {
    throw new Error(
      'Tarjetas inválidas: las tarjetas deben ser números enteros mayores o iguales a 0.'
    );
  }

  if (
    payload.penaltiesWinnerId &&
    payload.penaltiesWinnerId !== match.homeParticipantId &&
    payload.penaltiesWinnerId !== match.awayParticipantId
  ) {
    throw new Error(
      'Ganador de penales inválido: debe ser uno de los dos participantes del partido.'
    );
  }

  return {
    ...match,
    status: 'PENDING_CONFIRMATION',
    homeScore: payload.homeScore,
    awayScore: payload.awayScore,
    homeYellowCards: payload.homeYellowCards,
    awayYellowCards: payload.awayYellowCards,
    homeRedCards: payload.homeRedCards,
    awayRedCards: payload.awayRedCards,
    penaltiesWinnerId: payload.penaltiesWinnerId ?? null,
    version: match.version + 1,
  };
}

/**
 * Transitions a match from PENDING_CONFIRMATION to CLOSED.
 * - Restricted exclusively to the Away participant (RF-108, RF-110).
 * - Enforces version matching (OCC, RF-109).
 * - Increments match version by 1.
 *
 * @throws Error on invalid state, unauthorized actor or version mismatch.
 */
export function transitionMatchConfirm(
  match: MatchState,
  actorParticipantId: string,
  expectedVersion: number
): MatchState {
  if (match.status !== 'PENDING_CONFIRMATION') {
    throw new Error('El partido no está esperando confirmación.');
  }

  if (actorParticipantId !== match.awayParticipantId) {
    throw new Error('Solo el jugador Visitante puede confirmar el resultado.');
  }

  if (match.version !== expectedVersion) {
    throw new Error(
      'Conflicto de concurrencia: el resultado fue modificado mientras confirmabas.'
    );
  }

  return {
    ...match,
    status: 'CLOSED',
    version: match.version + 1,
  };
}

/**
 * Transitions a match from PENDING_CONFIRMATION back to PENDING_SUBMISSION.
 * - Restricted exclusively to the Away participant (RF-111).
 * - Enforces version matching (OCC, RF-109).
 * - Increments match version by 1.
 *
 * @throws Error on invalid state, unauthorized actor or version mismatch.
 */
export function transitionMatchReject(
  match: MatchState,
  actorParticipantId: string,
  expectedVersion: number
): MatchState {
  if (match.status !== 'PENDING_CONFIRMATION') {
    throw new Error('El partido no está esperando confirmación.');
  }

  if (actorParticipantId !== match.awayParticipantId) {
    throw new Error('Solo el jugador Visitante puede rechazar el resultado.');
  }

  if (match.version !== expectedVersion) {
    throw new Error(
      'Conflicto de concurrencia: el resultado fue modificado previamente.'
    );
  }

  return {
    ...match,
    status: 'PENDING_SUBMISSION',
    version: match.version + 1,
  };
}

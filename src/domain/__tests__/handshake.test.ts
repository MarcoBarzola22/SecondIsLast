import { describe, expect, it } from 'vitest';
import {
  createInitialMatchState,
  transitionMatchConfirm,
  transitionMatchReject,
  transitionMatchSubmit,
  type MatchState,
  type SubmitMatchPayload,
} from '../handshake';

describe('Handshake State Machine and OCC (RF-105 to RF-112)', () => {
  const initialMatch: MatchState = {
    id: 'm1',
    homeParticipantId: 'pHome',
    awayParticipantId: 'pAway',
    status: 'PENDING_SUBMISSION',
    homeScore: null,
    awayScore: null,
    homeYellowCards: 0,
    awayYellowCards: 0,
    homeRedCards: 0,
    awayRedCards: 0,
    penaltiesWinnerId: null,
    version: 1,
    isBye: false,
  };

  const validPayload: SubmitMatchPayload = {
    homeScore: 2,
    awayScore: 1,
    homeYellowCards: 1,
    awayYellowCards: 2,
    homeRedCards: 0,
    awayRedCards: 1,
    penaltiesWinnerId: null,
    expectedVersion: 1,
  };

  describe('createInitialMatchState helper', () => {
    it('creates a match in PENDING_SUBMISSION with version 1 and null scores', () => {
      const match = createInitialMatchState('match-123', 'pHome', 'pAway');
      expect(match.id).toBe('match-123');
      expect(match.homeParticipantId).toBe('pHome');
      expect(match.awayParticipantId).toBe('pAway');
      expect(match.status).toBe('PENDING_SUBMISSION');
      expect(match.version).toBe(1);
      expect(match.homeScore).toBeNull();
      expect(match.awayScore).toBeNull();
      expect(match.homeYellowCards).toBe(0);
      expect(match.awayYellowCards).toBe(0);
      expect(match.homeRedCards).toBe(0);
      expect(match.awayRedCards).toBe(0);
      expect(match.penaltiesWinnerId).toBeNull();
      expect(match.isBye).toBe(false);
    });

    it('creates a bye match in CLOSED status when isBye is true', () => {
      const byeMatch = createInitialMatchState('match-bye', 'pHome', null, true);
      expect(byeMatch.isBye).toBe(true);
      expect(byeMatch.status).toBe('CLOSED');
      expect(byeMatch.awayParticipantId).toBeNull();
    });
  });

  describe('transitionMatchSubmit (RF-106, RF-107)', () => {
    it('successfully transitions from PENDING_SUBMISSION to PENDING_CONFIRMATION', () => {
      const updated = transitionMatchSubmit(initialMatch, 'pHome', validPayload);

      expect(updated.status).toBe('PENDING_CONFIRMATION');
      expect(updated.version).toBe(2);
      expect(updated.homeScore).toBe(2);
      expect(updated.awayScore).toBe(1);
      expect(updated.homeYellowCards).toBe(1);
      expect(updated.awayYellowCards).toBe(2);
      expect(updated.homeRedCards).toBe(0);
      expect(updated.awayRedCards).toBe(1);
      expect(updated.penaltiesWinnerId).toBeNull();
    });

    it('records penaltiesWinnerId when provided and valid', () => {
      const penaltyPayload: SubmitMatchPayload = {
        ...validPayload,
        homeScore: 1,
        awayScore: 1,
        penaltiesWinnerId: 'pAway',
      };
      const updated = transitionMatchSubmit(initialMatch, 'pHome', penaltyPayload);

      expect(updated.penaltiesWinnerId).toBe('pAway');
      expect(updated.status).toBe('PENDING_CONFIRMATION');
      expect(updated.version).toBe(2);
    });

    it('rejects submission if actor is Away player (RF-106 exclusivity for Local)', () => {
      expect(() =>
        transitionMatchSubmit(initialMatch, 'pAway', validPayload)
      ).toThrow(/Solo el jugador Local puede cargar el resultado/i);
    });

    it('rejects submission if actor is a third party or Admin (RF-106, RF-112)', () => {
      expect(() =>
        transitionMatchSubmit(initialMatch, 'pThirdParty', validPayload)
      ).toThrow(/Solo el jugador Local puede cargar el resultado/i);
    });

    it('rejects submission if expectedVersion does not match current version (RF-109 OCC)', () => {
      const stalePayload: SubmitMatchPayload = {
        ...validPayload,
        expectedVersion: 99,
      };
      expect(() =>
        transitionMatchSubmit(initialMatch, 'pHome', stalePayload)
      ).toThrow(/Conflicto de concurrencia: el partido fue modificado previamente/i);
    });

    it('rejects submission if match is already in PENDING_CONFIRMATION', () => {
      const pendingConfirmationMatch: MatchState = {
        ...initialMatch,
        status: 'PENDING_CONFIRMATION',
        version: 2,
      };
      expect(() =>
        transitionMatchSubmit(pendingConfirmationMatch, 'pHome', {
          ...validPayload,
          expectedVersion: 2,
        })
      ).toThrow(/El partido no está pendiente de carga/i);
    });

    it('rejects submission if match is CLOSED', () => {
      const closedMatch: MatchState = {
        ...initialMatch,
        status: 'CLOSED',
        version: 3,
      };
      expect(() =>
        transitionMatchSubmit(closedMatch, 'pHome', {
          ...validPayload,
          expectedVersion: 3,
        })
      ).toThrow(/El partido no está pendiente de carga/i);
    });

    it('rejects submission on Bye matches', () => {
      const byeMatch: MatchState = {
        ...initialMatch,
        isBye: true,
        status: 'CLOSED',
      };
      expect(() =>
        transitionMatchSubmit(byeMatch, 'pHome', validPayload)
      ).toThrow(/El partido no está pendiente de carga/i);
    });

    it('validates score boundaries (0 to 99 integers)', () => {
      expect(() =>
        transitionMatchSubmit(initialMatch, 'pHome', {
          ...validPayload,
          homeScore: -1,
        })
      ).toThrow(/Goles inválidos/i);

      expect(() =>
        transitionMatchSubmit(initialMatch, 'pHome', {
          ...validPayload,
          awayScore: 100,
        })
      ).toThrow(/Goles inválidos/i);

      expect(() =>
        transitionMatchSubmit(initialMatch, 'pHome', {
          ...validPayload,
          homeScore: 2.5,
        })
      ).toThrow(/Goles inválidos/i);
    });

    it('validates cards (non-negative integers)', () => {
      expect(() =>
        transitionMatchSubmit(initialMatch, 'pHome', {
          ...validPayload,
          homeYellowCards: -1,
        })
      ).toThrow(/Tarjetas inválidas/i);

      expect(() =>
        transitionMatchSubmit(initialMatch, 'pHome', {
          ...validPayload,
          awayRedCards: 1.5,
        })
      ).toThrow(/Tarjetas inválidas/i);
    });

    it('validates penaltiesWinnerId must be home or away participant', () => {
      expect(() =>
        transitionMatchSubmit(initialMatch, 'pHome', {
          ...validPayload,
          penaltiesWinnerId: 'alienParticipant',
        })
      ).toThrow(/Ganador de penales inválido/i);
    });
  });

  describe('transitionMatchConfirm (RF-108, RF-110)', () => {
    const pendingMatch: MatchState = {
      ...initialMatch,
      status: 'PENDING_CONFIRMATION',
      homeScore: 3,
      awayScore: 2,
      homeYellowCards: 1,
      awayYellowCards: 0,
      homeRedCards: 0,
      awayRedCards: 0,
      version: 2,
    };

    it('successfully transitions from PENDING_CONFIRMATION to CLOSED by Away participant', () => {
      const closed = transitionMatchConfirm(pendingMatch, 'pAway', 2);

      expect(closed.status).toBe('CLOSED');
      expect(closed.version).toBe(3);
      expect(closed.homeScore).toBe(3);
      expect(closed.awayScore).toBe(2);
    });

    it('rejects confirmation if actor is Local player (RF-108 exclusivity for Away)', () => {
      expect(() =>
        transitionMatchConfirm(pendingMatch, 'pHome', 2)
      ).toThrow(/Solo el jugador Visitante puede confirmar el resultado/i);
    });

    it('rejects confirmation if actor is Admin or third party (RF-112)', () => {
      expect(() =>
        transitionMatchConfirm(pendingMatch, 'adminId', 2)
      ).toThrow(/Solo el jugador Visitante puede confirmar el resultado/i);
    });

    it('rejects confirmation if expectedVersion does not match current version (RF-109 OCC)', () => {
      expect(() =>
        transitionMatchConfirm(pendingMatch, 'pAway', 1)
      ).toThrow(/Conflicto de concurrencia: el resultado fue modificado mientras confirmabas/i);
    });

    it('rejects confirmation if match status is not PENDING_CONFIRMATION', () => {
      expect(() =>
        transitionMatchConfirm(initialMatch, 'pAway', 1)
      ).toThrow(/El partido no está esperando confirmación/i);

      const alreadyClosed: MatchState = {
        ...pendingMatch,
        status: 'CLOSED',
        version: 3,
      };
      expect(() =>
        transitionMatchConfirm(alreadyClosed, 'pAway', 3)
      ).toThrow(/El partido no está esperando confirmación/i);
    });
  });

  describe('transitionMatchReject (RF-111)', () => {
    const pendingMatch: MatchState = {
      ...initialMatch,
      status: 'PENDING_CONFIRMATION',
      homeScore: 1,
      awayScore: 0,
      version: 2,
    };

    it('successfully transitions from PENDING_CONFIRMATION back to PENDING_SUBMISSION by Away participant', () => {
      const reverted = transitionMatchReject(pendingMatch, 'pAway', 2);

      expect(reverted.status).toBe('PENDING_SUBMISSION');
      expect(reverted.version).toBe(3);
    });

    it('rejects rejection if actor is Local player (RF-111 exclusivity for Away)', () => {
      expect(() =>
        transitionMatchReject(pendingMatch, 'pHome', 2)
      ).toThrow(/Solo el jugador Visitante puede rechazar el resultado/i);
    });

    it('rejects rejection if actor is third party or Admin (RF-112)', () => {
      expect(() =>
        transitionMatchReject(pendingMatch, 'thirdParty', 2)
      ).toThrow(/Solo el jugador Visitante puede rechazar el resultado/i);
    });

    it('rejects rejection if expectedVersion does not match current version (RF-109 OCC)', () => {
      expect(() =>
        transitionMatchReject(pendingMatch, 'pAway', 99)
      ).toThrow(/Conflicto de concurrencia: el resultado fue modificado previamente/i);
    });

    it('rejects rejection if match status is not PENDING_CONFIRMATION', () => {
      expect(() =>
        transitionMatchReject(initialMatch, 'pAway', 1)
      ).toThrow(/El partido no está esperando confirmación/i);
    });
  });

  describe('Full Handshake Flow & Two-Legged series (RF-105, RF-107, RF-110, RF-111)', () => {
    it('executes full submit -> reject -> resubmit -> confirm cycle with version incrementing every step', () => {
      // Step 1: Initial state
      let match = createInitialMatchState('m100', 'p1', 'p2');
      expect(match.status).toBe('PENDING_SUBMISSION');
      expect(match.version).toBe(1);

      // Step 2: p1 (Local) submits erroneous score 5-0
      match = transitionMatchSubmit(match, 'p1', {
        homeScore: 5,
        awayScore: 0,
        homeYellowCards: 0,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0,
        expectedVersion: 1,
      });
      expect(match.status).toBe('PENDING_CONFIRMATION');
      expect(match.version).toBe(2);
      expect(match.homeScore).toBe(5);

      // Step 3: p2 (Away) rejects
      match = transitionMatchReject(match, 'p2', 2);
      expect(match.status).toBe('PENDING_SUBMISSION');
      expect(match.version).toBe(3);

      // Step 4: p1 (Local) corrects score to 1-0 and resubmits
      match = transitionMatchSubmit(match, 'p1', {
        homeScore: 1,
        awayScore: 0,
        homeYellowCards: 1,
        awayYellowCards: 1,
        homeRedCards: 0,
        awayRedCards: 0,
        expectedVersion: 3,
      });
      expect(match.status).toBe('PENDING_CONFIRMATION');
      expect(match.version).toBe(4);
      expect(match.homeScore).toBe(1);

      // Step 5: p2 (Away) confirms
      match = transitionMatchConfirm(match, 'p2', 4);
      expect(match.status).toBe('CLOSED');
      expect(match.version).toBe(5);
      expect(match.homeScore).toBe(1);
      expect(match.awayScore).toBe(0);
    });

    it('enforces role symmetry in two-legged series (RF-105)', () => {
      // Leg 1 (Ida): pA is Home, pB is Away
      let leg1 = createInitialMatchState('leg1', 'pA', 'pB');
      leg1 = transitionMatchSubmit(leg1, 'pA', {
        homeScore: 2,
        awayScore: 0,
        homeYellowCards: 0,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0,
        expectedVersion: 1,
      });
      leg1 = transitionMatchConfirm(leg1, 'pB', 2);
      expect(leg1.status).toBe('CLOSED');

      // Leg 2 (Vuelta): pB is Home, pA is Away
      let leg2 = createInitialMatchState('leg2', 'pB', 'pA');
      // In leg2, pA cannot submit! Only pB (Home) can submit
      expect(() =>
        transitionMatchSubmit(leg2, 'pA', {
          homeScore: 1,
          awayScore: 0,
          homeYellowCards: 0,
          awayYellowCards: 0,
          homeRedCards: 0,
          awayRedCards: 0,
          expectedVersion: 1,
        })
      ).toThrow(/Solo el jugador Local puede cargar el resultado/i);

      leg2 = transitionMatchSubmit(leg2, 'pB', {
        homeScore: 1,
        awayScore: 0,
        homeYellowCards: 0,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0,
        expectedVersion: 1,
      });

      // And in leg2, pB cannot confirm! Only pA (Away) can confirm
      expect(() => transitionMatchConfirm(leg2, 'pB', 2)).toThrow(
        /Solo el jugador Visitante puede confirmar el resultado/i
      );

      leg2 = transitionMatchConfirm(leg2, 'pA', 2);
      expect(leg2.status).toBe('CLOSED');
    });
  });
});

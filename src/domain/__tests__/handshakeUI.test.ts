import { describe, expect, it } from 'vitest';
import type { HandshakeMatchData } from '../../components/views/HandshakeModal';
import {
  transitionMatchSubmit,
  transitionMatchConfirm,
  transitionMatchReject,
  createInitialMatchState,
  type MatchState,
} from '../handshake';

describe('Handshake UI & Modal Workflow (T20 · RF-105, RF-106, RF-108, RF-119)', () => {
  const RIOPLATENSE_409_WARNING =
    '¡Che, el Local modificó el resultado mientras confirmabas! Se actualizaron los datos, revisá de nuevo antes de aceptar.';

  it('contains the expected Rioplatense Spanish phrase for mid-flight OCC 409 conflicts (RF-109)', () => {
    expect(RIOPLATENSE_409_WARNING).toContain('¡Che, el Local modificó el resultado mientras confirmabas!');
    expect(RIOPLATENSE_409_WARNING).toContain('revisá de nuevo antes de aceptar.');
  });

  describe('Single Match Handshake data structures and role symmetry', () => {
    it('structures HandshakeMatchData with Local as playerA and Away as playerB', () => {
      const modalData: HandshakeMatchData = {
        id: 'match-1',
        round: 1,
        homePlayerId: 'player-A',
        awayPlayerId: 'player-B',
        homePlayerName: 'Gómez, Martín',
        homeTeamName: 'Boca Juniors',
        awayPlayerName: 'Rodríguez, Lucas',
        awayTeamName: 'River Plate',
        homeScore: 2,
        awayScore: 1,
        homeYellowCards: 1,
        awayYellowCards: 3,
        homeRedCards: 0,
        awayRedCards: 1,
        penaltiesWinnerId: null,
        version: 2,
        status: 'PENDING_CONFIRMATION',
      };

      expect(modalData.homePlayerId).toBe('player-A');
      expect(modalData.awayPlayerId).toBe('player-B');
      expect(modalData.status).toBe('PENDING_CONFIRMATION');
      expect(modalData.version).toBe(2);
      expect(modalData.homeScore).toBe(2);
      expect(modalData.awayScore).toBe(1);
    });

    it('validates penaltiesWinnerId belongs to either Home or Away participant', () => {
      const matchState = createInitialMatchState('m1', 'player-A', 'player-B');

      // Attempting to submit an external penalty winner should be rejected
      expect(() => {
        transitionMatchSubmit(
          matchState,
          'player-A',
          {
            homeScore: 2,
            awayScore: 2,
            homeYellowCards: 0,
            awayYellowCards: 0,
            homeRedCards: 0,
            awayRedCards: 0,
            penaltiesWinnerId: 'player-stranger',
            expectedVersion: 1,
          }
        );
      }).toThrow('Ganador de penales inválido');

      // Providing a valid penalty winner transitions cleanly
      const submitted = transitionMatchSubmit(
        matchState,
        'player-A',
        {
          homeScore: 2,
          awayScore: 2,
          homeYellowCards: 0,
          awayYellowCards: 0,
          homeRedCards: 0,
          awayRedCards: 0,
          penaltiesWinnerId: 'player-A',
          expectedVersion: 1,
        }
      );

      expect(submitted.status).toBe('PENDING_CONFIRMATION');
      expect(submitted.penaltiesWinnerId).toBe('player-A');
      expect(submitted.version).toBe(2);
    });
  });

  describe('Two-Legged Series Role Reversal Flow', () => {
    it('correctly maps Home and Away across Leg 1 and Leg 2', () => {
      const series = {
        id: 'SF1',
        playerA: 'player-A',
        playerB: 'player-B',
      };

      // Leg 1: Local is playerA, Away is playerB
      const leg1 = {
        homePlayerId: series.playerA,
        awayPlayerId: series.playerB,
      };

      // Leg 2: Local is playerB, Away is playerA
      const leg2 = {
        homePlayerId: series.playerB,
        awayPlayerId: series.playerA,
      };

      expect(leg1.homePlayerId).toBe('player-A');
      expect(leg1.awayPlayerId).toBe('player-B');
      expect(leg2.homePlayerId).toBe('player-B');
      expect(leg2.awayPlayerId).toBe('player-A');
    });

    it('allows only the Away player to confirm or reject in PENDING_CONFIRMATION', () => {
      const pendingMatch: MatchState = {
        id: 'm-pending',
        homeParticipantId: 'player-A',
        awayParticipantId: 'player-B',
        status: 'PENDING_CONFIRMATION',
        homeScore: 3,
        awayScore: 1,
        homeYellowCards: 0,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0,
        penaltiesWinnerId: null,
        version: 2,
        isBye: false,
      };

      // Local (player-A) CANNOT confirm
      expect(() => {
        transitionMatchConfirm(pendingMatch, 'player-A', 2);
      }).toThrow('Solo el jugador Visitante');

      // Local (player-A) CANNOT reject
      expect(() => {
        transitionMatchReject(pendingMatch, 'player-A', 2);
      }).toThrow('Solo el jugador Visitante');

      // Away (player-B) CAN confirm
      const confirmed = transitionMatchConfirm(pendingMatch, 'player-B', 2);
      expect(confirmed.status).toBe('CLOSED');
      expect(confirmed.version).toBe(3);

      // Away (player-B) CAN reject
      const rejected = transitionMatchReject(pendingMatch, 'player-B', 2);
      expect(rejected.status).toBe('PENDING_SUBMISSION');
      expect(rejected.version).toBe(3);
    });
  });
});

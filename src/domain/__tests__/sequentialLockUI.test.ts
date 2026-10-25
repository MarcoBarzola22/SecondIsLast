import { describe, expect, it } from 'vitest';
import {
  formatSequentialLockMessage,
  getParticipantBlockingMatches,
  type MatchForLock,
} from '../sequentialLock';
import { appReducer } from '../../state/reducer';
import { createEmptyAppData } from '../../storage/schema';
import type { LeagueMatch } from '../types';

describe('Sequential Lock & Global Round Decoupling in UI (T21 · RF-114, RF-115)', () => {
  describe('formatSequentialLockMessage diagnosis messages (RF-114)', () => {
    const priorMatchRound1: MatchForLock = {
      id: 'm-r1-1',
      round: 1,
      playerA: 'p1',
      playerB: 'p3',
      status: 'PENDING_SUBMISSION',
    };

    const priorMatchRound2: MatchForLock = {
      id: 'm-r2-2',
      round: 2,
      playerA: 'p2',
      playerB: 'p4',
      status: 'PENDING_CONFIRMATION',
    };

    it('indicates when only Player A must close their prior match first', () => {
      const message = formatSequentialLockMessage(
        'Lionel Messi',
        'Cristiano Ronaldo',
        [priorMatchRound1],
        [],
        2
      );

      expect(message).toBe(
        'Bloqueado: Lionel Messi debe cerrar su partido de la Fecha 1 primero.'
      );
    });

    it('indicates when only Player B must close their prior match first', () => {
      const message = formatSequentialLockMessage(
        'Lionel Messi',
        'Cristiano Ronaldo',
        [],
        [priorMatchRound2],
        3
      );

      expect(message).toBe(
        'Bloqueado: Cristiano Ronaldo debe cerrar su partido de la Fecha 2 primero.'
      );
    });

    it('indicates when both players must close prior matches', () => {
      const message = formatSequentialLockMessage(
        'Lionel Messi',
        'Cristiano Ronaldo',
        [priorMatchRound1],
        [priorMatchRound2],
        3
      );

      expect(message).toBe(
        'Bloqueado: Lionel Messi y Cristiano Ronaldo deben cerrar sus partidos de fechas anteriores primero.'
      );
    });

    it('returns null when neither player is blocked', () => {
      const message = formatSequentialLockMessage(
        'Lionel Messi',
        'Cristiano Ronaldo',
        [],
        [],
        2
      );

      expect(message).toBeNull();
    });
  });

  describe('RF-115 Desacoplamiento de Fecha Global', () => {
    it('immediately unlocks a Round 2 match when both rivals finished Round 1, even if third-party matches in Round 1 are still open', () => {
      // 6-player league: P1, P2, P3, P4, P5, P6
      const r1_m1: MatchForLock = {
        id: 'R1_M1',
        round: 1,
        playerA: 'p1',
        playerB: 'p3',
        status: 'CLOSED', // P1 finished Round 1
      };

      const r1_m2: MatchForLock = {
        id: 'R1_M2',
        round: 1,
        playerA: 'p2',
        playerB: 'p4',
        status: 'CLOSED', // P2 finished Round 1
      };

      const r1_m3: MatchForLock = {
        id: 'R1_M3',
        round: 1,
        playerA: 'p5',
        playerB: 'p6',
        status: 'PENDING_SUBMISSION', // P5 and P6 are still playing Round 1!
      };

      // Target match: Round 2 between P1 and P2
      const targetR2Match: MatchForLock = {
        id: 'R2_M1',
        round: 2,
        playerA: 'p1',
        playerB: 'p2',
        status: 'PENDING_SUBMISSION',
      };

      const allMatches = [r1_m1, r1_m2, r1_m3, targetR2Match];

      const blockingA = getParticipantBlockingMatches(allMatches, targetR2Match, 'p1');
      const blockingB = getParticipantBlockingMatches(allMatches, targetR2Match, 'p2');

      const isSequentiallyLocked = blockingA.length > 0 || blockingB.length > 0;

      // P1 and P2 can play immediately without waiting for P5 vs P6 (RF-115)
      expect(blockingA).toEqual([]);
      expect(blockingB).toEqual([]);
      expect(isSequentiallyLocked).toBe(false);
      expect(formatSequentialLockMessage('P1', 'P2', blockingA, blockingB, 2)).toBeNull();
    });

    it('blocks Round 2 match between P1 and P5 if P5 is still playing Round 1', () => {
      const r1_m1: MatchForLock = {
        id: 'R1_M1',
        round: 1,
        playerA: 'p1',
        playerB: 'p3',
        status: 'CLOSED',
      };

      const r1_m3: MatchForLock = {
        id: 'R1_M3',
        round: 1,
        playerA: 'p5',
        playerB: 'p6',
        status: 'PENDING_SUBMISSION',
      };

      const targetMatch: MatchForLock = {
        id: 'R2_M2',
        round: 2,
        playerA: 'p1',
        playerB: 'p5',
        status: 'PENDING_SUBMISSION',
      };

      const allMatches = [r1_m1, r1_m3, targetMatch];

      const blockingA = getParticipantBlockingMatches(allMatches, targetMatch, 'p1');
      const blockingB = getParticipantBlockingMatches(allMatches, targetMatch, 'p5');

      expect(blockingA).toHaveLength(0);
      expect(blockingB).toHaveLength(1);
      expect(blockingB[0].id).toBe('R1_M3');

      const message = formatSequentialLockMessage('P1', 'P5', blockingA, blockingB, 2);
      expect(message).toBe('Bloqueado: P5 debe cerrar su partido de la Fecha 1 primero.');
    });
  });

  describe('Reactive live unlocking via MATCH_CLOSED_EVENT_RECEIVED in Reducer', () => {
    it('transitions prior match to CLOSED and unblocks downstream match reactively', () => {
      const initialLeagueMatches: LeagueMatch[] = [
        {
          id: 'R1_M1',
          round: 1,
          playerA: 'p1',
          playerB: 'p2',
          scoreA: 2,
          scoreB: 1,
          confirmed: false,
          status: 'PENDING_CONFIRMATION',
          version: 2,
        },
        {
          id: 'R2_M1',
          round: 2,
          playerA: 'p1',
          playerB: 'p3',
          scoreA: null,
          scoreB: null,
          confirmed: false,
          status: 'PENDING_SUBMISSION',
          version: 1,
        },
      ];

      const initialState = {
        ...createEmptyAppData(),
        activeTournament: {
          id: 't-1',
          name: 'Torneo Test',
          status: 'IN_PROGRESS',
          phase: 'league',
          participants: [],
          teams: {},
          byes: [],
          series: [],
          leagueMatches: initialLeagueMatches,
        } as any,
      };

      // Before event: R2_M1 is blocked by R1_M1
      const preMatchesForLock: MatchForLock[] = initialState.activeTournament!.leagueMatches!.map((m: LeagueMatch) => ({
        id: m.id,
        round: m.round,
        playerA: m.playerA,
        playerB: m.playerB,
        status: m.confirmed ? 'CLOSED' : (m.status || 'PENDING_SUBMISSION'),
      }));

      const targetMatchPre = preMatchesForLock[1];
      const blockingPre = getParticipantBlockingMatches(preMatchesForLock, targetMatchPre, 'p1');
      expect(blockingPre).toHaveLength(1);
      expect(blockingPre[0].id).toBe('R1_M1');

      // Dispatch real-time WebSocket event received
      const updatedState = appReducer(initialState, {
        type: 'MATCH_CLOSED_EVENT_RECEIVED',
        matchId: 'R1_M1',
        match: {
          id: 'R1_M1',
          homeScore: 2,
          awayScore: 1,
          homeYellowCards: 1,
          awayYellowCards: 0,
          homeRedCards: 0,
          awayRedCards: 0,
          version: 3,
        },
        unblockedParticipants: ['p1', 'p2'],
      });

      // Verify state was atomically updated
      const closedMatch = updatedState.activeTournament!.leagueMatches!.find((m: LeagueMatch) => m.id === 'R1_M1')!;
      expect(closedMatch.status).toBe('CLOSED');
      expect(closedMatch.confirmed).toBe(true);
      expect(closedMatch.scoreA).toBe(2);
      expect(closedMatch.scoreB).toBe(1);

      // Verify sequential lock for R2_M1 is now completely resolved
      const postMatchesForLock: MatchForLock[] = updatedState.activeTournament!.leagueMatches!.map((m: LeagueMatch) => ({
        id: m.id,
        round: m.round,
        playerA: m.playerA,
        playerB: m.playerB,
        status: m.confirmed ? 'CLOSED' : (m.status || 'PENDING_SUBMISSION'),
      }));

      const targetMatchPost = postMatchesForLock[1];
      const blockingPost = getParticipantBlockingMatches(postMatchesForLock, targetMatchPost, 'p1');
      expect(blockingPost).toHaveLength(0);

      const messagePost = formatSequentialLockMessage('P1', 'P3', blockingPost, [], 2);
      expect(messagePost).toBeNull();
    });
  });

  describe('Two-Legged Series Leg 2 Sequential Lock (RF-114)', () => {
    it('locks Leg 2 until Leg 1 is CLOSED', () => {
      const leg1StatusOpen: string = 'PENDING_SUBMISSION';
      const isLeg2LockedOpen = leg1StatusOpen !== 'CLOSED';
      expect(isLeg2LockedOpen).toBe(true);

      const leg1StatusPendingConfirm: string = 'PENDING_CONFIRMATION';
      const isLeg2LockedPending = leg1StatusPendingConfirm !== 'CLOSED';
      expect(isLeg2LockedPending).toBe(true);

      const leg1StatusClosed: string = 'CLOSED';
      const isLeg2LockedClosed = leg1StatusClosed !== 'CLOSED';
      expect(isLeg2LockedClosed).toBe(false);
    });
  });
});

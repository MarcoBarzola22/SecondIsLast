import { describe, expect, it } from 'vitest';
import { createSeries } from '../bracket';
import { createDoubleEliminationSeries } from '../doubleElimination';
import { createInitialMatchState } from '../handshake';
import {
  canParticipantPlayMatch,
  canPlayerPlayMatch,
  getMatchLockStatus,
  type MatchForLock,
} from '../sequentialLock';

describe('Sequential Lock by Player and Auto-liquidation of Byes (RF-113, RF-114, RF-115)', () => {
  describe('canPlayerPlayMatch & getMatchLockStatus', () => {
    it('allows playing a Round 1 match when no prior matches exist', () => {
      const r1Match: MatchForLock = {
        id: 'r1_m1',
        round: 1,
        homeParticipantId: 'p1',
        awayParticipantId: 'p2',
        status: 'PENDING_SUBMISSION',
      };

      expect(canPlayerPlayMatch([r1Match], r1Match)).toBe(true);
      const status = getMatchLockStatus([r1Match], r1Match);
      expect(status.canPlay).toBe(true);
      expect(status.blockingMatches).toHaveLength(0);
    });

    it('blocks Round 2 match when Local player has an unclosed Round 1 match (RF-114)', () => {
      const p1_r1: MatchForLock = {
        id: 'r1_m1',
        round: 1,
        homeParticipantId: 'p1',
        awayParticipantId: 'p3',
        status: 'PENDING_CONFIRMATION', // Unfinished!
      };
      const p2_r1: MatchForLock = {
        id: 'r1_m2',
        round: 1,
        homeParticipantId: 'p2',
        awayParticipantId: 'p4',
        status: 'CLOSED', // Finished
      };
      const targetR2Match: MatchForLock = {
        id: 'r2_m1',
        round: 2,
        homeParticipantId: 'p1',
        awayParticipantId: 'p2',
        status: 'PENDING_SUBMISSION',
      };

      const allMatches = [p1_r1, p2_r1, targetR2Match];

      expect(canPlayerPlayMatch(allMatches, targetR2Match)).toBe(false);
      expect(canParticipantPlayMatch(allMatches, targetR2Match, 'p1')).toBe(false);
      expect(canParticipantPlayMatch(allMatches, targetR2Match, 'p2')).toBe(true);

      const status = getMatchLockStatus(allMatches, targetR2Match);
      expect(status.canPlay).toBe(false);
      expect(status.blockingMatches).toContainEqual(p1_r1);
      expect(status.blockingMatches).not.toContainEqual(p2_r1);
    });

    it('blocks Round 2 match when Away player has an unclosed Round 1 match (RF-114)', () => {
      const p1_r1: MatchForLock = {
        id: 'r1_m1',
        round: 1,
        homeParticipantId: 'p1',
        awayParticipantId: 'p3',
        status: 'CLOSED', // Finished
      };
      const p2_r1: MatchForLock = {
        id: 'r1_m2',
        round: 1,
        homeParticipantId: 'p4',
        awayParticipantId: 'p2',
        status: 'PENDING_SUBMISSION', // Unfinished!
      };
      const targetR2Match: MatchForLock = {
        id: 'r2_m1',
        round: 2,
        homeParticipantId: 'p1',
        awayParticipantId: 'p2',
        status: 'PENDING_SUBMISSION',
      };

      const allMatches = [p1_r1, p2_r1, targetR2Match];

      expect(canPlayerPlayMatch(allMatches, targetR2Match)).toBe(false);
      expect(canParticipantPlayMatch(allMatches, targetR2Match, 'p1')).toBe(true);
      expect(canParticipantPlayMatch(allMatches, targetR2Match, 'p2')).toBe(false);

      const status = getMatchLockStatus(allMatches, targetR2Match);
      expect(status.canPlay).toBe(false);
      expect(status.blockingMatches).toContainEqual(p2_r1);
    });

    it('blocks Round 2 match when both players have unclosed Round 1 matches', () => {
      const p1_r1: MatchForLock = {
        id: 'r1_m1',
        round: 1,
        homeParticipantId: 'p1',
        awayParticipantId: 'p3',
        status: 'PENDING_SUBMISSION',
      };
      const p2_r1: MatchForLock = {
        id: 'r1_m2',
        round: 1,
        homeParticipantId: 'p2',
        awayParticipantId: 'p4',
        status: 'PENDING_CONFIRMATION',
      };
      const targetR2Match: MatchForLock = {
        id: 'r2_m1',
        round: 2,
        homeParticipantId: 'p1',
        awayParticipantId: 'p2',
        status: 'PENDING_SUBMISSION',
      };

      const allMatches = [p1_r1, p2_r1, targetR2Match];

      expect(canPlayerPlayMatch(allMatches, targetR2Match)).toBe(false);
      const status = getMatchLockStatus(allMatches, targetR2Match);
      expect(status.blockingMatches).toHaveLength(2);
    });

    it('decouples global date: allows Round 2 match if Local and Away finished Round 1, even if others are still in Round 1 (RF-115)', () => {
      // p1 vs p3 -> CLOSED
      const p1_r1: MatchForLock = {
        id: 'r1_m1',
        round: 1,
        homeParticipantId: 'p1',
        awayParticipantId: 'p3',
        status: 'CLOSED',
      };
      // p2 vs p4 -> CLOSED
      const p2_r1: MatchForLock = {
        id: 'r1_m2',
        round: 1,
        homeParticipantId: 'p2',
        awayParticipantId: 'p4',
        status: 'CLOSED',
      };
      // p5 vs p6 -> PENDING_SUBMISSION (Still playing Round 1!)
      const p5_r1: MatchForLock = {
        id: 'r1_m3',
        round: 1,
        homeParticipantId: 'p5',
        awayParticipantId: 'p6',
        status: 'PENDING_SUBMISSION',
      };
      // Next match: p1 vs p2 in Round 2
      const targetR2Match: MatchForLock = {
        id: 'r2_m1',
        round: 2,
        homeParticipantId: 'p1',
        awayParticipantId: 'p2',
        status: 'PENDING_SUBMISSION',
      };

      const allMatches = [p1_r1, p2_r1, p5_r1, targetR2Match];

      // p1 and p2 are ready, p5 vs p6 does not block them!
      expect(canPlayerPlayMatch(allMatches, targetR2Match)).toBe(true);
      const status = getMatchLockStatus(allMatches, targetR2Match);
      expect(status.canPlay).toBe(true);
      expect(status.blockingMatches).toHaveLength(0);
    });

    it('enforces transitive sequential order across multiple rounds (Round 3 blocked by Round 1)', () => {
      const p1_r1: MatchForLock = {
        id: 'r1_m1',
        round: 1,
        homeParticipantId: 'p1',
        awayParticipantId: 'p3',
        status: 'PENDING_SUBMISSION', // Still pending from R1
      };
      const p1_r2: MatchForLock = {
        id: 'r2_m1',
        round: 2,
        homeParticipantId: 'p1',
        awayParticipantId: 'p4',
        status: 'CLOSED',
      };
      const p2_r1: MatchForLock = {
        id: 'r1_m2',
        round: 1,
        homeParticipantId: 'p2',
        awayParticipantId: 'p5',
        status: 'CLOSED',
      };
      const p2_r2: MatchForLock = {
        id: 'r2_m2',
        round: 2,
        homeParticipantId: 'p2',
        awayParticipantId: 'p6',
        status: 'CLOSED',
      };
      const targetR3Match: MatchForLock = {
        id: 'r3_m1',
        round: 3,
        homeParticipantId: 'p1',
        awayParticipantId: 'p2',
        status: 'PENDING_SUBMISSION',
      };

      const allMatches = [p1_r1, p1_r2, p2_r1, p2_r2, targetR3Match];

      expect(canPlayerPlayMatch(allMatches, targetR3Match)).toBe(false);
      const status = getMatchLockStatus(allMatches, targetR3Match);
      expect(status.blockingMatches).toContainEqual(p1_r1);
    });

    it('blocks Leg 2 of a two-legged series until Leg 1 is CLOSED', () => {
      const leg1: MatchForLock = {
        id: 'series1_leg1',
        round: 1,
        leg: 1,
        homeParticipantId: 'p1',
        awayParticipantId: 'p2',
        status: 'PENDING_CONFIRMATION',
      };
      const leg2: MatchForLock = {
        id: 'series1_leg2',
        round: 1,
        leg: 2,
        homeParticipantId: 'p2',
        awayParticipantId: 'p1',
        status: 'PENDING_SUBMISSION',
      };

      const allMatches = [leg1, leg2];

      // Leg 2 blocked while Leg 1 is pending confirmation
      expect(canPlayerPlayMatch(allMatches, leg2)).toBe(false);

      // Once Leg 1 is closed, Leg 2 is unlocked
      const leg1Closed: MatchForLock = { ...leg1, status: 'CLOSED' };
      expect(canPlayerPlayMatch([leg1Closed, leg2], leg2)).toBe(true);
    });

    it('allows advancing when a player had an auto-liquidated Bye in the previous round (RF-113)', () => {
      // p1 had a Bye in Round 1 (auto-closed)
      const p1_bye_r1: MatchForLock = {
        id: 'r1_bye_p1',
        round: 1,
        homeParticipantId: 'p1',
        awayParticipantId: null,
        status: 'CLOSED',
        isBye: true,
      };
      // p2 played and closed their match in Round 1
      const p2_r1: MatchForLock = {
        id: 'r1_m2',
        round: 1,
        homeParticipantId: 'p2',
        awayParticipantId: 'p3',
        status: 'CLOSED',
        isBye: false,
      };
      const targetR2Match: MatchForLock = {
        id: 'r2_m1',
        round: 2,
        homeParticipantId: 'p1',
        awayParticipantId: 'p2',
        status: 'PENDING_SUBMISSION',
      };

      const allMatches = [p1_bye_r1, p2_r1, targetR2Match];

      expect(canPlayerPlayMatch(allMatches, targetR2Match)).toBe(true);
      expect(canParticipantPlayMatch(allMatches, targetR2Match, 'p1')).toBe(true);
      expect(canParticipantPlayMatch(allMatches, targetR2Match, 'p2')).toBe(true);
    });

    it('returns false if target match is already CLOSED or is a Bye', () => {
      const closedMatch: MatchForLock = {
        id: 'm1',
        round: 1,
        homeParticipantId: 'p1',
        awayParticipantId: 'p2',
        status: 'CLOSED',
      };
      const byeMatch: MatchForLock = {
        id: 'm2',
        round: 1,
        homeParticipantId: 'p1',
        awayParticipantId: null,
        status: 'CLOSED',
        isBye: true,
      };

      expect(canPlayerPlayMatch([closedMatch], closedMatch)).toBe(false);
      expect(canPlayerPlayMatch([byeMatch], byeMatch)).toBe(false);
    });

    it('supports playerA / playerB aliases from local Series format', () => {
      const r1Series: MatchForLock = {
        id: 'qf1',
        round: 1,
        playerA: 'p1',
        playerB: 'p2',
        status: 'CLOSED',
      };
      const r2Series: MatchForLock = {
        id: 'sf1',
        round: 2,
        playerA: 'p1',
        playerB: 'p3',
        status: 'PENDING_SUBMISSION',
      };

      expect(canPlayerPlayMatch([r1Series, r2Series], r2Series)).toBe(true);
    });
  });

  describe('Auto-liquidation of Byes born in CLOSED state (RF-113)', () => {
    it('createInitialMatchState creates Bye matches directly in CLOSED status', () => {
      const regularMatch = createInitialMatchState('m1', 'p1', 'p2', false);
      expect(regularMatch.status).toBe('PENDING_SUBMISSION');
      expect(regularMatch.isBye).toBe(false);

      const byeMatch = createInitialMatchState('m2', 'p1', null, true);
      expect(byeMatch.status).toBe('CLOSED');
      expect(byeMatch.isBye).toBe(true);
    });

    it('createSeries in bracket.ts creates series with isBye: true directly in CLOSED status', () => {
      const regularSeries = createSeries('QF1', 'quarterfinal', 'p1', 'p2', null, null, false);
      expect(regularSeries.status).toBe('PENDING_SUBMISSION');
      expect(regularSeries.confirmed).toBe(false);
      expect(regularSeries.isBye).toBe(false);

      const byeSeries = createSeries('QF2', 'quarterfinal', 'p3', null, null, null, true);
      expect(byeSeries.status).toBe('CLOSED');
      expect(byeSeries.confirmed).toBe(true);
      expect(byeSeries.isBye).toBe(true);
      expect(byeSeries.winner).toBe('p3');
    });

    it('createDoubleEliminationSeries in doubleElimination.ts creates series with isBye: true directly in CLOSED status', () => {
      const regularSeries = createDoubleEliminationSeries('WB_QF1', 'wb_quarterfinal', 'p1', 'p2', null, null, false);
      expect(regularSeries.status).toBe('PENDING_SUBMISSION');
      expect(regularSeries.confirmed).toBe(false);
      expect(regularSeries.isBye).toBe(false);

      const byeSeries = createDoubleEliminationSeries('WB_QF2', 'wb_quarterfinal', 'p3', null, null, null, true);
      expect(byeSeries.status).toBe('CLOSED');
      expect(byeSeries.confirmed).toBe(true);
      expect(byeSeries.isBye).toBe(true);
      expect(byeSeries.winner).toBe('p3');
    });
  });
});

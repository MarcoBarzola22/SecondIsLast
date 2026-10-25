import { describe, it, expect } from 'vitest';
import {
  MINIMUM_LOBBY_QUORUM,
  isQuorumReached,
  getMissingPlayersForQuorum,
  canInitiateTournament,
} from '../quorum';

describe('Quorum Domain Logic (RF-96, RF-98)', () => {
  it('defines the minimum quorum constant as 4', () => {
    expect(MINIMUM_LOBBY_QUORUM).toBe(4);
  });

  describe('isQuorumReached (RF-96)', () => {
    it('returns false for 0, 1, 2, and 3 participants', () => {
      expect(isQuorumReached(0)).toBe(false);
      expect(isQuorumReached(1)).toBe(false);
      expect(isQuorumReached(2)).toBe(false);
      expect(isQuorumReached(3)).toBe(false);
    });

    it('returns true for 4 or more participants', () => {
      expect(isQuorumReached(4)).toBe(true);
      expect(isQuorumReached(5)).toBe(true);
      expect(isQuorumReached(8)).toBe(true);
      expect(isQuorumReached(16)).toBe(true);
    });
  });

  describe('getMissingPlayersForQuorum', () => {
    it('returns 4 when count is 0', () => {
      expect(getMissingPlayersForQuorum(0)).toBe(4);
    });

    it('returns 3 when count is 1', () => {
      expect(getMissingPlayersForQuorum(1)).toBe(3);
    });

    it('returns 1 when count is 3', () => {
      expect(getMissingPlayersForQuorum(3)).toBe(1);
    });

    it('returns 0 when count is 4 or higher', () => {
      expect(getMissingPlayersForQuorum(4)).toBe(0);
      expect(getMissingPlayersForQuorum(6)).toBe(0);
    });
  });

  describe('canInitiateTournament (RF-98)', () => {
    it('blocks starting if quorum is not reached even if user is confirmed', () => {
      expect(canInitiateTournament(3, true)).toBe(false);
      expect(canInitiateTournament(2, true)).toBe(false);
    });

    it('blocks starting if quorum is reached but user is not confirmed', () => {
      expect(canInitiateTournament(4, false)).toBe(false);
      expect(canInitiateTournament(6, false)).toBe(false);
    });

    it('allows starting when quorum is reached AND user is confirmed (RF-98)', () => {
      expect(canInitiateTournament(4, true)).toBe(true);
      expect(canInitiateTournament(7, true)).toBe(true);
    });
  });
});

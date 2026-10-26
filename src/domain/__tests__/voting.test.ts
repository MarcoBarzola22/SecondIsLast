import { describe, expect, it } from 'vitest';
import type { TournamentType } from '../types';
import {
  computeVoteResults,
  getValidFormatsForParticipants,
  hasAllParticipantsVoted,
  isFormatValidForParticipants,
  shouldCloseVoting,
  VOTING_DURATION_SECONDS,
  getFormatVotingOptions,
  resolveFormatWinner,
  MATCH_FORMAT_OPTIONS,
} from '../voting';
import { createMulberry32, createSeqRng } from './helpers';

describe('voting domain logic', () => {
  describe('getValidFormatsForParticipants (RF-99)', () => {
    it('excludes group_stage for N = 5', () => {
      const formats = getValidFormatsForParticipants(5);
      expect(formats).not.toContain('group_stage');
      expect(formats).toEqual([
        'bracket',
        'league',
        'league_playoffs',
        'double_elimination',
      ]);
    });

    it('excludes group_stage for N = 4, 7, 8, 10', () => {
      const nonGroupCounts = [4, 7, 8, 10];
      for (const n of nonGroupCounts) {
        const formats = getValidFormatsForParticipants(n);
        expect(formats).not.toContain('group_stage');
        expect(formats).toContain('bracket');
        expect(formats).toContain('league');
        expect(formats).toContain('league_playoffs');
        expect(formats).toContain('double_elimination');
        expect(formats).toHaveLength(4);
      }
    });

    it('includes group_stage strictly when N = 6', () => {
      const formats = getValidFormatsForParticipants(6);
      expect(formats).toContain('group_stage');
      expect(formats).toEqual([
        'bracket',
        'league',
        'group_stage',
        'league_playoffs',
        'double_elimination',
      ]);
    });

    it('includes group_stage strictly when N = 9', () => {
      const formats = getValidFormatsForParticipants(9);
      expect(formats).toContain('group_stage');
      expect(formats).toEqual([
        'bracket',
        'league',
        'group_stage',
        'league_playoffs',
        'double_elimination',
      ]);
    });

    it('throws for participant counts below minimum (< 4)', () => {
      expect(() => getValidFormatsForParticipants(3)).toThrow(
        /participant count/i
      );
      expect(() => getValidFormatsForParticipants(0)).toThrow(
        /participant count/i
      );
      expect(() => getValidFormatsForParticipants(-1)).toThrow(
        /participant count/i
      );
    });

    it('throws for participant counts above maximum (> 10)', () => {
      expect(() => getValidFormatsForParticipants(11)).toThrow(
        /participant count/i
      );
      expect(() => getValidFormatsForParticipants(16)).toThrow(
        /participant count/i
      );
    });

    it('throws for non-integer participant counts', () => {
      expect(() => getValidFormatsForParticipants(5.5)).toThrow(
        /participant count/i
      );
      expect(() => getValidFormatsForParticipants(NaN)).toThrow(
        /participant count/i
      );
    });
  });

  describe('isFormatValidForParticipants (RF-99)', () => {
    it('validates formats correctly according to participant count', () => {
      expect(isFormatValidForParticipants('bracket', 5)).toBe(true);
      expect(isFormatValidForParticipants('group_stage', 5)).toBe(false);
      expect(isFormatValidForParticipants('group_stage', 6)).toBe(true);
      expect(isFormatValidForParticipants('group_stage', 7)).toBe(false);
      expect(isFormatValidForParticipants('group_stage', 9)).toBe(true);
      expect(isFormatValidForParticipants('group_stage', 10)).toBe(false);
    });
  });

  describe('computeVoteResults (RF-99, RF-101, RF-102, Edge Case 3)', () => {
    const validFormats: TournamentType[] = [
      'bracket',
      'league',
      'league_playoffs',
      'double_elimination',
    ];

    it('determines an outright winner without a draw when one option has majority', () => {
      const votes = [
        { participantId: 'p1', choice: 'bracket' },
        { participantId: 'p2', choice: 'bracket' },
        { participantId: 'p3', choice: 'league' },
      ];

      const result = computeVoteResults(votes, validFormats);

      expect(result.winner).toBe('bracket');
      expect(result.wasDraw).toBe(false);
      expect(result.tiedOptions).toBeUndefined();
      expect(result.voteCounts.bracket).toBe(2);
      expect(result.voteCounts.league).toBe(1);
      expect(result.voteCounts.league_playoffs).toBe(0);
      expect(result.voteCounts.double_elimination).toBe(0);
      expect(result.totalValidVotes).toBe(3);
    });

    it('accepts votes as a Record of participantId to choice', () => {
      const votes = {
        p1: 'league_playoffs',
        p2: 'league_playoffs',
        p3: 'bracket',
      };

      const result = computeVoteResults(votes, validFormats);

      expect(result.winner).toBe('league_playoffs');
      expect(result.wasDraw).toBe(false);
      expect(result.totalValidVotes).toBe(3);
    });

    it('accepts votes as a simple string array', () => {
      const votes = ['double_elimination', 'double_elimination', 'league'];

      const result = computeVoteResults(votes, validFormats);

      expect(result.winner).toBe('double_elimination');
      expect(result.wasDraw).toBe(false);
      expect(result.totalValidVotes).toBe(3);
    });

    it('deduplicates multiple votes from the same participant using their latest vote', () => {
      const votes = [
        { participantId: 'p1', choice: 'bracket' },
        { participantId: 'p2', choice: 'league' },
        { participantId: 'p1', choice: 'league' }, // p1 changed vote to league
      ];

      const result = computeVoteResults(votes, validFormats);

      expect(result.winner).toBe('league');
      expect(result.voteCounts.league).toBe(2);
      expect(result.voteCounts.bracket).toBe(0);
      expect(result.totalValidVotes).toBe(2);
    });

    it('discards votes for options that are not valid for the current participants (RF-99)', () => {
      // In N=5, group_stage is invalid
      const votes = [
        { participantId: 'p1', choice: 'group_stage' }, // Invalid! Ignored
        { participantId: 'p2', choice: 'bracket' },
      ];

      const result = computeVoteResults(votes, validFormats);

      expect(result.winner).toBe('bracket');
      expect(result.wasDraw).toBe(false);
      expect(result.voteCounts.bracket).toBe(1);
      expect(result.totalValidVotes).toBe(1);
    });

    it('breaks a 2-way tie deterministically using the injected RNG (RF-101)', () => {
      const votes = [
        { participantId: 'p1', choice: 'bracket' },
        { participantId: 'p2', choice: 'league' },
      ];

      // RNG returning 0 selects index 0 ('bracket')
      const rngFirst = createSeqRng([0.0]);
      const resultFirst = computeVoteResults(votes, validFormats, rngFirst);

      expect(resultFirst.wasDraw).toBe(true);
      expect(resultFirst.tiedOptions).toEqual(['bracket', 'league']);
      expect(resultFirst.winner).toBe('bracket');

      // RNG returning near 1 selects index 1 ('league')
      const rngSecond = createSeqRng([0.99]);
      const resultSecond = computeVoteResults(votes, validFormats, rngSecond);

      expect(resultSecond.wasDraw).toBe(true);
      expect(resultSecond.tiedOptions).toEqual(['bracket', 'league']);
      expect(resultSecond.winner).toBe('league');
    });

    it('breaks a 3-way tie among highest scoring options', () => {
      const votes = [
        { participantId: 'p1', choice: 'bracket' },
        { participantId: 'p2', choice: 'league' },
        { participantId: 'p3', choice: 'double_elimination' },
      ];

      // Tied options should be the 3 tied for max votes (1 each)
      const rng = createSeqRng([0.4]); // 0.4 * 3 = 1.2 -> index 1 ('league')
      const result = computeVoteResults(votes, validFormats, rng);

      expect(result.wasDraw).toBe(true);
      expect(result.tiedOptions).toEqual([
        'bracket',
        'league',
        'double_elimination',
      ]);
      expect(result.winner).toBe('league');
    });

    it('resolves uniformly at random among all valid options when 0 votes are cast (Edge Case 3)', () => {
      const emptyVotes: { participantId: string; choice: string }[] = [];

      // When 0 votes cast, all valid options are tied
      const rngIndex2 = createSeqRng([0.6]); // 0.6 * 4 = 2.4 -> index 2 ('league_playoffs')
      const result = computeVoteResults(emptyVotes, validFormats, rngIndex2);

      expect(result.wasDraw).toBe(true);
      expect(result.totalValidVotes).toBe(0);
      expect(result.tiedOptions).toEqual(validFormats);
      expect(result.winner).toBe('league_playoffs');
      expect(result.voteCounts.bracket).toBe(0);
      expect(result.voteCounts.league).toBe(0);
      expect(result.voteCounts.league_playoffs).toBe(0);
      expect(result.voteCounts.double_elimination).toBe(0);
    });

    it('demonstrates uniform distribution across many tie-breaks', () => {
      const validTwo = ['optionA', 'optionB'] as const;
      const votes = [
        { participantId: 'p1', choice: 'optionA' },
        { participantId: 'p2', choice: 'optionB' },
      ];

      const rng = createMulberry32(1337);
      let countA = 0;
      let countB = 0;
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const res = computeVoteResults(votes, validTwo, rng);
        if (res.winner === 'optionA') countA++;
        else countB++;
      }

      // Each should be selected roughly ~50% (between 44% and 56%)
      expect(countA / iterations).toBeGreaterThan(0.44);
      expect(countA / iterations).toBeLessThan(0.56);
      expect(countA + countB).toBe(iterations);
    });

    it('works generically for Theme voting (RF-102)', () => {
      const themes = ['Champions League', 'Copa Libertadores', 'Mundial 2022'];
      const votes = [
        { participantId: 'p1', choice: 'Champions League' },
        { participantId: 'p2', choice: 'Mundial 2022' },
        { participantId: 'p3', choice: 'Mundial 2022' },
      ];

      const result = computeVoteResults(votes, themes);

      expect(result.winner).toBe('Mundial 2022');
      expect(result.wasDraw).toBe(false);
      expect(result.voteCounts['Mundial 2022']).toBe(2);
      expect(result.voteCounts['Champions League']).toBe(1);
      expect(result.voteCounts['Copa Libertadores']).toBe(0);
    });

    it('throws if validOptions is empty', () => {
      expect(() => computeVoteResults([], [])).toThrow(
        /validOptions must contain at least one option/i
      );
    });
  });

  describe('Voting lifecycle helpers (RF-100)', () => {
    it('hasAllParticipantsVoted returns true only when total votes matches or exceeds confirmed participants', () => {
      expect(hasAllParticipantsVoted(3, 4)).toBe(false);
      expect(hasAllParticipantsVoted(4, 4)).toBe(true);
      expect(hasAllParticipantsVoted(5, 4)).toBe(true);
    });

    it('shouldCloseVoting returns true when 120s timer expires or 100% of participants voted (RF-100)', () => {
      expect(VOTING_DURATION_SECONDS).toBe(120);

      // Neither condition met
      expect(shouldCloseVoting(2, 4, 30)).toBe(false);

      // Condition 1: Time expired (>= 120s) even with fewer votes
      expect(shouldCloseVoting(1, 4, 120)).toBe(true);
      expect(shouldCloseVoting(0, 4, 121)).toBe(true);

      // Condition 2: 100% voted even before time expired
      expect(shouldCloseVoting(4, 4, 15)).toBe(true);
      expect(shouldCloseVoting(6, 6, 45)).toBe(true);
    });
  });

  describe('Random format & match modality options (T28)', () => {
    it('getFormatVotingOptions includes all valid formats plus random', () => {
      const optionsFor4 = getFormatVotingOptions(4);
      expect(optionsFor4).toContain('random');
      expect(optionsFor4).toContain('bracket');
      expect(optionsFor4).toContain('league');
      expect(optionsFor4).not.toContain('group_stage');
      expect(optionsFor4).toHaveLength(5);

      const optionsFor6 = getFormatVotingOptions(6);
      expect(optionsFor6).toContain('random');
      expect(optionsFor6).toContain('group_stage');
      expect(optionsFor6).toHaveLength(6);
    });

    it('resolveFormatWinner resolves random to a valid format using RNG', () => {
      const validFormats = getValidFormatsForParticipants(4);
      const chosen = resolveFormatWinner('random', validFormats, () => 0);
      expect(chosen).toBe(validFormats[0]);

      const chosenLast = resolveFormatWinner('random', validFormats, () => 0.99);
      expect(chosenLast).toBe(validFormats[validFormats.length - 1]);

      // If winner is already a specific format, returns it directly
      expect(resolveFormatWinner('league', validFormats)).toBe('league');
    });

    it('exposes MATCH_FORMAT_OPTIONS for SINGLE_MATCH and TWO_LEGGED', () => {
      expect(MATCH_FORMAT_OPTIONS).toContain('SINGLE_MATCH');
      expect(MATCH_FORMAT_OPTIONS).toContain('TWO_LEGGED');
    });
  });
});

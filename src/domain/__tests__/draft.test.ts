import { describe, expect, it } from 'vitest';
import {
  createDraftOrder,
  getCurrentDrafter,
  isDraftComplete,
  validateTeamName,
} from '../draft';
import { createMulberry32 } from './helpers';

describe('draft - domain logic', () => {
  const participants = ['p1', 'p2', 'p3', 'p4', 'p5'];

  describe('createDraftOrder (RF-11)', () => {
    it('creates a full permutation of participant ids', () => {
      const order = createDraftOrder(participants, createMulberry32(777));
      expect(order).toHaveLength(participants.length);
      expect([...order].sort()).toEqual([...participants].sort());
    });
  });

  describe('getCurrentDrafter (RF-12, RF-15)', () => {
    it('returns the first player in order who has not selected a team', () => {
      const order = ['p3', 'p1', 'p5', 'p2', 'p4'];
      const teams: Record<string, string> = {
        p3: 'Boca Juniors',
      };

      expect(getCurrentDrafter(order, teams)).toBe('p1');
    });

    it('returns null when all players have selected a team', () => {
      const order = ['p1', 'p2', 'p3'];
      const teams = {
        p1: 'Boca',
        p2: 'River',
        p3: 'Milan',
      };

      expect(getCurrentDrafter(order, teams)).toBeNull();
    });

    it('treats whitespace-only teams as unselected', () => {
      const order = ['p1', 'p2'];
      const teams = { p1: '   ' };
      expect(getCurrentDrafter(order, teams)).toBe('p1');
    });
  });

  describe('validateTeamName (RF-13, RF-14)', () => {
    const assignedTeams = {
      p1: 'Boca Juniors',
      p2: 'River Plate',
    };

    it('accepts a valid and unique team name', () => {
      const res = validateTeamName('Milan', assignedTeams, 'p3');
      expect(res.isValid).toBe(true);
      expect(res.errorMessage).toBeNull();
      expect(res.sanitizedTeamName).toBe('Milan');
    });

    it('rejects empty or whitespace-only team name', () => {
      const res = validateTeamName('   ', assignedTeams, 'p3');
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toBe('El nombre del equipo es obligatorio.');
    });

    it('rejects duplicate team names regardless of casing and spaces', () => {
      const res1 = validateTeamName('boca juniors', assignedTeams, 'p3');
      expect(res1.isValid).toBe(false);
      expect(res1.errorMessage).toBe('Ese equipo ya fue elegido por otro participante.');

      const res2 = validateTeamName('  RIVER   PLATE  ', assignedTeams, 'p3');
      expect(res2.isValid).toBe(false);
      expect(res2.errorMessage).toBe('Ese equipo ya fue elegido por otro participante.');
    });

    it('allows a drafter to keep or re-enter their own team name without duplicate error', () => {
      const res = validateTeamName('Boca Juniors', assignedTeams, 'p1');
      expect(res.isValid).toBe(true);
    });
  });

  describe('isDraftComplete (RF-16)', () => {
    it('returns false when some participants lack teams', () => {
      expect(isDraftComplete(participants, { p1: 'A', p2: 'B' })).toBe(false);
    });

    it('returns true when all participants have non-empty teams assigned', () => {
      const allTeams = {
        p1: 'Team A',
        p2: 'Team B',
        p3: 'Team C',
        p4: 'Team D',
        p5: 'Team E',
      };
      expect(isDraftComplete(participants, allTeams)).toBe(true);
    });

    it('returns false for empty participants list', () => {
      expect(isDraftComplete([], {})).toBe(false);
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  formatPlayerName,
  isDuplicatePlayer,
  normalizeName,
  removePlayer,
  sanitizeName,
  validatePlayerInput,
} from '../players';
import type { Player } from '../types';

describe('players - domain logic', () => {
  describe('normalizeName and sanitizeName', () => {
    it('normalizes casing, diacritics and multiple spaces', () => {
      expect(normalizeName('  Martín   PÉREZ  ')).toBe('martin perez');
      expect(normalizeName('Nicolás')).toBe('nicolas');
      expect(normalizeName('FEDE')).toBe('fede');
    });

    it('sanitizes internal and external spaces without altering casing or letters', () => {
      expect(sanitizeName('  Juan    Carlos  ')).toBe('Juan Carlos');
    });
  });

  describe('validatePlayerInput (RF-1, RF-2)', () => {
    it('approves valid first and last name', () => {
      const result = validatePlayerInput('Marco', 'Barzola');
      expect(result.isValid).toBe(true);
      expect(result.errorMessage).toBeNull();
      expect(result.sanitizedFirstName).toBe('Marco');
      expect(result.sanitizedLastName).toBe('Barzola');
    });

    it('rejects empty or whitespace-only first name', () => {
      const res1 = validatePlayerInput('', 'Barzola');
      expect(res1.isValid).toBe(false);
      expect(res1.errorMessage).toBe('El nombre y el apellido son obligatorios.');

      const res2 = validatePlayerInput('   ', 'Barzola');
      expect(res2.isValid).toBe(false);
    });

    it('rejects empty or whitespace-only last name', () => {
      const res = validatePlayerInput('Marco', '   ');
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toBe('El nombre y el apellido son obligatorios.');
    });
  });

  describe('isDuplicatePlayer (RF-3)', () => {
    const existingPlayers: Player[] = [
      {
        id: 'p1',
        firstName: 'Marco',
        lastName: 'Barzola',
        createdAt: '2026-10-09T00:00:00Z',
      },
      {
        id: 'p2',
        firstName: 'Martín',
        lastName: 'López',
        createdAt: '2026-10-09T00:00:00Z',
      },
    ];

    it('detects duplicate with exact match', () => {
      expect(
        isDuplicatePlayer({ firstName: 'Marco', lastName: 'Barzola' }, existingPlayers)
      ).toBe(true);
    });

    it('detects duplicate ignoring case and accents', () => {
      expect(
        isDuplicatePlayer({ firstName: 'martin', lastName: 'lopez' }, existingPlayers)
      ).toBe(true);
      expect(
        isDuplicatePlayer({ firstName: 'MARTÍN', lastName: 'LÓPEZ' }, existingPlayers)
      ).toBe(true);
    });

    it('detects duplicate ignoring excessive whitespace', () => {
      expect(
        isDuplicatePlayer(
          { firstName: '  Marco   ', lastName: '  Barzola ' },
          existingPlayers
        )
      ).toBe(true);
    });

    it('returns false for distinct players', () => {
      expect(
        isDuplicatePlayer({ firstName: 'Lucas', lastName: 'Barzola' }, existingPlayers)
      ).toBe(false);
      expect(
        isDuplicatePlayer({ firstName: 'Marco', lastName: 'Gómez' }, existingPlayers)
      ).toBe(false);
    });

    it('respects excludePlayerId when editing or checking against self', () => {
      expect(
        isDuplicatePlayer(
          { firstName: 'Marco', lastName: 'Barzola' },
          existingPlayers,
          'p1'
        )
      ).toBe(false);
    });
  });

  describe('formatPlayerName (RF-35)', () => {
    it('formats as "Apellido, Nombre"', () => {
      expect(formatPlayerName({ firstName: 'Marco', lastName: 'Barzola' })).toBe(
        'Barzola, Marco'
      );
      expect(
        formatPlayerName({ firstName: '  Juan  Carlos ', lastName: '  Gómez  ' })
      ).toBe('Gómez, Juan Carlos');
    });
  });

  describe('removePlayer (RF-46)', () => {
    const playersList: Player[] = [
      { id: 'p1', firstName: 'Marco', lastName: 'Barzola', createdAt: '2026-10-09T00:00:00Z' },
      { id: 'p2', firstName: 'Lucas', lastName: 'Fernández', createdAt: '2026-10-09T00:00:00Z' },
      { id: 'p3', firstName: 'Mateo', lastName: 'Pérez', createdAt: '2026-10-09T00:00:00Z' },
    ];

    it('removes the specified player without mutating the original array', () => {
      const result = removePlayer(playersList, 'p2');
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.id)).toEqual(['p1', 'p3']);
      expect(playersList).toHaveLength(3); // immutability check
    });

    it('returns all players if the target id is not found', () => {
      const result = removePlayer(playersList, 'non-existent');
      expect(result).toHaveLength(3);
      expect(result.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    });
  });
});


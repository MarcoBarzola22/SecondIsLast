import { describe, expect, it } from 'vitest';
import {
  THEMES,
  addCustomTheme,
  getAllThemes,
  normalizeThemeName,
  pickRandomTheme,
  validateCustomTheme,
} from '../theme';
import { createSeqRng } from './helpers';

describe('theme - domain logic (RF-7, RF-8, RF-56, RF-57, RF-58)', () => {
  it('contains the 5 required base themes (RF-7)', () => {
    expect(THEMES).toEqual([
      'Clásicos PES 6',
      'Apertura 2006',
      'Europa Actual',
      'Selecciones Mundial 06',
      'Solo Sudamérica',
    ]);
  });

  it('selects items according to RNG output (RF-8)', () => {
    // 0.0 -> index 0 ('Clásicos PES 6')
    expect(pickRandomTheme(createSeqRng([0.0]))).toBe('Clásicos PES 6');

    // 0.25 -> index 1 ('Apertura 2006')
    expect(pickRandomTheme(createSeqRng([0.25]))).toBe('Apertura 2006');

    // 0.99 -> index 4 ('Solo Sudamérica')
    expect(pickRandomTheme(createSeqRng([0.99]))).toBe('Solo Sudamérica');
  });

  it('throws when themes array is empty', () => {
    expect(() => pickRandomTheme(() => 0.5, [])).toThrow();
  });

  describe('custom themes (RF-56, RF-57, RF-58)', () => {
    it('normalizes theme names correctly', () => {
      expect(normalizeThemeName('  Premier   League 2008  ')).toBe(
        'premier league 2008'
      );
    });

    it('getAllThemes merges base and custom themes (RF-56)', () => {
      const all = getAllThemes(['Libertadores 2000', 'Mundial 2002']);
      expect(all).toHaveLength(7);
      expect(all).toContain('Libertadores 2000');
      expect(all).toContain('Mundial 2002');
      expect(all[0]).toBe('Clásicos PES 6');
    });

    it('validateCustomTheme rejects empty or whitespace-only names', () => {
      const res = validateCustomTheme('   ');
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toMatch(/obligatorio/i);
    });

    it('validateCustomTheme rejects duplicate of base theme (case-insensitive)', () => {
      const res = validateCustomTheme('clásicos pes 6');
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toMatch(/ya existe/i);
    });

    it('validateCustomTheme rejects duplicate of custom theme (case-insensitive)', () => {
      const existing = ['Champions League 2005'];
      const res = validateCustomTheme('  champions LEAGUE 2005  ', [
        ...THEMES,
        ...existing,
      ]);
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toMatch(/ya existe/i);
    });

    it('validateCustomTheme accepts valid new theme and sanitizes whitespace', () => {
      const res = validateCustomTheme('   Copa   Sudamericana 2007  ');
      expect(res.isValid).toBe(true);
      expect(res.errorMessage).toBeNull();
      expect(res.sanitizedTheme).toBe('Copa Sudamericana 2007');
    });

    it('addCustomTheme adds new theme and returns updated array', () => {
      const custom: string[] = [];
      const updated = addCustomTheme(custom, 'Copa América 2004');
      expect(updated).toEqual(['Copa América 2004']);

      const updated2 = addCustomTheme(updated, 'Mundial 98');
      expect(updated2).toEqual(['Copa América 2004', 'Mundial 98']);
    });

    it('addCustomTheme throws if theme is invalid or duplicate', () => {
      expect(() => addCustomTheme([], '')).toThrow(/obligatorio/i);
      expect(() => addCustomTheme([], 'Apertura 2006')).toThrow(/ya existe/i);
      expect(() =>
        addCustomTheme(['Liga Española'], 'liga española')
      ).toThrow(/ya existe/i);
    });

    it('pickRandomTheme can select from custom themes when included', () => {
      const themes = getAllThemes(['Mundial 2002']);
      // Index 5 is 'Mundial 2002' (5 / 6 = ~0.85)
      const rng = createSeqRng([0.85]);
      expect(pickRandomTheme(rng, themes)).toBe('Mundial 2002');
    });
  });
});

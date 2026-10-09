import { describe, expect, it } from 'vitest';
import { THEMES, pickRandomTheme } from '../theme';
import { createSeqRng } from './helpers';

describe('theme - domain logic', () => {
  it('contains the 5 required themes (RF-7)', () => {
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
});

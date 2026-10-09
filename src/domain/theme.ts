import type { RngFn } from './random';

/**
 * Fixed list of tournament themes for PES 6 tournaments (RF-7).
 */
export const THEMES = [
  'Clásicos PES 6',
  'Apertura 2006',
  'Europa Actual',
  'Selecciones Mundial 06',
  'Solo Sudamérica',
] as const;

export type Theme = (typeof THEMES)[number];

/**
 * Picks a random theme with uniform distribution using an injectable RNG (RF-8).
 */
export function pickRandomTheme(
  rng: RngFn = Math.random,
  themes: readonly string[] = THEMES
): string {
  if (themes.length === 0) {
    throw new Error('Cannot pick a theme from an empty list.');
  }
  const index = Math.floor(rng() * themes.length);
  const clampedIndex = Math.min(Math.max(index, 0), themes.length - 1);
  return themes[clampedIndex]!;
}

import type { RngFn } from './random';

/**
 * Fixed list of tournament base themes for PES 6 tournaments (RF-7).
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
 * Normalizes a theme name for duplicate comparison (case- and whitespace-insensitive).
 */
export function normalizeThemeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Returns all themes combining base themes and any custom user themes (RF-56).
 */
export function getAllThemes(
  customThemes: readonly string[] = [],
  baseThemes: readonly string[] = THEMES
): string[] {
  return [...baseThemes, ...customThemes];
}

export interface ThemeValidationResult {
  isValid: boolean;
  errorMessage: string | null;
  sanitizedTheme: string;
}

/**
 * Validates a candidate theme name:
 * - Must not be empty or whitespace only.
 * - Must not be duplicate of existing themes (case- and whitespace-insensitive) (RF-57).
 */
export function validateCustomTheme(
  name: string,
  existingThemes: readonly string[] = THEMES
): ThemeValidationResult {
  const sanitizedTheme = name.trim().replace(/\s+/g, ' ');

  if (sanitizedTheme.length === 0) {
    return {
      isValid: false,
      errorMessage: 'El nombre de la temática es obligatorio.',
      sanitizedTheme,
    };
  }

  const normalized = normalizeThemeName(sanitizedTheme);
  for (const existing of existingThemes) {
    if (normalizeThemeName(existing) === normalized) {
      return {
        isValid: false,
        errorMessage: 'Esa temática ya existe en la lista.',
        sanitizedTheme,
      };
    }
  }

  return {
    isValid: true,
    errorMessage: null,
    sanitizedTheme,
  };
}

/**
 * Adds a new custom theme to the list after validation (RF-57, RF-58).
 */
export function addCustomTheme(
  customThemes: readonly string[],
  newTheme: string,
  baseThemes: readonly string[] = THEMES
): string[] {
  const allExisting = [...baseThemes, ...customThemes];
  const validation = validateCustomTheme(newTheme, allExisting);
  if (!validation.isValid) {
    throw new Error(validation.errorMessage!);
  }
  return [...customThemes, validation.sanitizedTheme];
}

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

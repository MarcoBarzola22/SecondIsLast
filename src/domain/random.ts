export type RngFn = () => number;

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * Pure function: does NOT mutate the original array.
 *
 * @param items Array of elements to shuffle
 * @param rng Injectable random generator function returning a float in [0, 1). Defaults to Math.random.
 * @returns A new shuffled array containing all original elements
 */
export function shuffle<T>(items: readonly T[], rng: RngFn = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

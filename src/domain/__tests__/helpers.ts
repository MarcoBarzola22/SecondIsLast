import type { RngFn } from '../random';

/**
 * Creates a deterministic 32-bit pseudo-random number generator (Mulberry32).
 *
 * @param seed Integer seed
 * @returns RngFn yielding floats in [0, 1)
 */
export function createMulberry32(seed: number): RngFn {
  let s = Math.floor(seed);
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates an RNG that returns a predetermined sequence of numbers.
 * Loops over the sequence if exhausted.
 *
 * @param values Numbers in [0, 1)
 * @returns RngFn
 */
export function createSeqRng(values: number[]): RngFn {
  if (values.length === 0) {
    throw new Error('createSeqRng requires at least one value');
  }
  let index = 0;
  return () => {
    const val = values[index % values.length]!;
    index++;
    return val;
  };
}

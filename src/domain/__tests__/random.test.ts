import { describe, expect, it } from 'vitest';
import { shuffle } from '../random';
import { createMulberry32 } from './helpers';

describe('random - shuffle', () => {
  it('does not mutate the source array', () => {
    const original = Object.freeze([1, 2, 3, 4, 5, 6]);
    const result = shuffle(original, createMulberry32(42));

    expect(result).not.toBe(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('preserves all elements with identical counts', () => {
    const input = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const result = shuffle(input, createMulberry32(12345));

    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['solo'])).toEqual(['solo']);
  });

  it('is deterministic when given the same seed RNG', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const run1 = shuffle(items, createMulberry32(999));
    const run2 = shuffle(items, createMulberry32(999));

    expect(run1).toEqual(run2);
  });

  it('produces different permutations with different seeds', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const perm1 = shuffle(items, createMulberry32(101));
    const perm2 = shuffle(items, createMulberry32(202));

    expect(perm1).not.toEqual(perm2);
  });
});

import { describe, it, expect } from 'vitest';
import { computeCountdownState } from '../useCountdown.js';

describe('useCountdown & computeCountdownState (RF-99, RF-100)', () => {
  it('returns expired state when expiresAt is null', () => {
    const state = computeCountdownState(null);
    expect(state).toEqual({
      secondsLeft: 0,
      isExpired: true,
      formattedTime: '00:00',
      progressPercentage: 0,
    });
  });

  it('returns expired state when expiresAt is in the past', () => {
    const now = 1700000000000;
    const expiresAt = new Date(now - 5000).toISOString();
    const state = computeCountdownState(expiresAt, now, 120);

    expect(state.secondsLeft).toBe(0);
    expect(state.isExpired).toBe(true);
    expect(state.formattedTime).toBe('00:00');
    expect(state.progressPercentage).toBe(0);
  });

  it('correctly calculates 120s full duration and format 02:00', () => {
    const now = 1700000000000;
    const expiresAt = new Date(now + 120000).toISOString();
    const state = computeCountdownState(expiresAt, now, 120);

    expect(state.secondsLeft).toBe(120);
    expect(state.isExpired).toBe(false);
    expect(state.formattedTime).toBe('02:00');
    expect(state.progressPercentage).toBe(100);
  });

  it('correctly calculates remaining 45s and format 00:45', () => {
    const now = 1700000000000;
    const expiresAt = new Date(now + 45000).toISOString();
    const state = computeCountdownState(expiresAt, now, 120);

    expect(state.secondsLeft).toBe(45);
    expect(state.isExpired).toBe(false);
    expect(state.formattedTime).toBe('00:45');
    // 45 / 120 = 37.5% -> round 38%
    expect(state.progressPercentage).toBe(38);
  });

  it('correctly pads single-digit seconds (e.g. 9s -> 00:09)', () => {
    const now = 1700000000000;
    const expiresAt = new Date(now + 9000).toISOString();
    const state = computeCountdownState(expiresAt, now, 120);

    expect(state.secondsLeft).toBe(9);
    expect(state.isExpired).toBe(false);
    expect(state.formattedTime).toBe('00:09');
  });

  it('caps progressPercentage at 100%', () => {
    const now = 1700000000000;
    const expiresAt = new Date(now + 200000).toISOString();
    const state = computeCountdownState(expiresAt, now, 120);

    expect(state.progressPercentage).toBe(100);
  });
});

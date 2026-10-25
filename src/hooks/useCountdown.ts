import { useState, useEffect } from 'react';

export interface CountdownState {
  secondsLeft: number;
  isExpired: boolean;
  formattedTime: string;
  progressPercentage: number;
}

/**
 * Computes deterministic countdown state given an expiration timestamp and current time.
 */
export function computeCountdownState(
  expiresAt: string | null,
  nowMs: number = Date.now(),
  totalDurationSeconds: number = 120
): CountdownState {
  if (!expiresAt) {
    return {
      secondsLeft: 0,
      isExpired: true,
      formattedTime: '00:00',
      progressPercentage: 0,
    };
  }

  const expiryMs = new Date(expiresAt).getTime();
  const secondsLeft = Math.max(0, Math.ceil((expiryMs - nowMs) / 1000));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const progressPercentage = Math.min(
    100,
    Math.max(0, Math.round((secondsLeft / totalDurationSeconds) * 100))
  );

  return {
    secondsLeft,
    isExpired: secondsLeft <= 0,
    formattedTime,
    progressPercentage,
  };
}

/**
 * Hook to manage a synchronized countdown timer from an expiration timestamp (expiresAt).
 * Implements the 120-second voting timer interface (RF-99, RF-100).
 */
export function useCountdown(
  expiresAt: string | null,
  totalDurationSeconds: number = 120
): CountdownState {
  const [state, setState] = useState<CountdownState>(() =>
    computeCountdownState(expiresAt, Date.now(), totalDurationSeconds)
  );

  useEffect(() => {
    setState(computeCountdownState(expiresAt, Date.now(), totalDurationSeconds));

    if (!expiresAt) return;

    const interval = setInterval(() => {
      const current = computeCountdownState(expiresAt, Date.now(), totalDurationSeconds);
      setState(current);

      if (current.isExpired) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, totalDurationSeconds]);

  return state;
}


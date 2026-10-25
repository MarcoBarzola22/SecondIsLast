import { describe, it, expect } from 'vitest';
import { computeNetworkStatus } from '../useNetworkStatus';

describe('useNetworkStatus & computeNetworkStatus (T24 · RF-120, RNF-3)', () => {
  it('reports online when browser is online and socket is connected', () => {
    const status = computeNetworkStatus({
      isBrowserOnline: true,
      isAuthenticated: true,
      isSocketConnected: true,
    });

    expect(status.isOnline).toBe(true);
    expect(status.isOffline).toBe(false);
    expect(status.offlineReason).toBeNull();
  });

  it('reports offline with reason network when browser is offline regardless of socket', () => {
    const status = computeNetworkStatus({
      isBrowserOnline: false,
      isAuthenticated: true,
      isSocketConnected: true,
    });

    expect(status.isOnline).toBe(false);
    expect(status.isOffline).toBe(true);
    expect(status.offlineReason).toBe('network');
  });

  it('reports offline with reason socket when authenticated user loses socket connection', () => {
    const status = computeNetworkStatus({
      isBrowserOnline: true,
      isAuthenticated: true,
      isSocketConnected: false,
    });

    expect(status.isOnline).toBe(false);
    expect(status.isOffline).toBe(true);
    expect(status.offlineReason).toBe('socket');
  });

  it('does NOT mark unauthenticated users as offline when socket is not connected', () => {
    const status = computeNetworkStatus({
      isBrowserOnline: true,
      isAuthenticated: false,
      isSocketConnected: false,
    });

    expect(status.isOnline).toBe(true);
    expect(status.isOffline).toBe(false);
    expect(status.offlineReason).toBeNull();
  });

  it('reports offline when unauthenticated user loses browser connectivity', () => {
    const status = computeNetworkStatus({
      isBrowserOnline: false,
      isAuthenticated: false,
      isSocketConnected: false,
    });

    expect(status.isOnline).toBe(false);
    expect(status.isOffline).toBe(true);
    expect(status.offlineReason).toBe('network');
  });
});

import { useState, useEffect, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';

export interface NetworkStatus {
  isOnline: boolean;
  isOffline: boolean;
  isBrowserOnline: boolean;
  isSocketConnected: boolean;
  offlineReason: 'network' | 'socket' | null;
}

/**
 * Pure function to derive network status from browser, auth and socket states (RF-120, RNF-3).
 */
export function computeNetworkStatus({
  isBrowserOnline,
  isAuthenticated,
  isSocketConnected,
}: {
  isBrowserOnline: boolean;
  isAuthenticated: boolean;
  isSocketConnected: boolean;
}): NetworkStatus {
  const isSocketOffline = isAuthenticated && !isSocketConnected;
  const isOffline = !isBrowserOnline || isSocketOffline;
  const isOnline = !isOffline;

  let offlineReason: 'network' | 'socket' | null = null;
  if (!isBrowserOnline) {
    offlineReason = 'network';
  } else if (isSocketOffline) {
    offlineReason = 'socket';
  }

  return {
    isOnline,
    isOffline,
    isBrowserOnline,
    isSocketConnected,
    offlineReason,
  };
}

/**
 * useNetworkStatus (T24 · RF-120, RNF-3)
 * Monitors browser connectivity (navigator.onLine) and Socket.IO connection status.
 * Returns isOffline = true whenever browser is offline or Socket is disconnected for an authenticated user.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  const authContext = useContext(AuthContext);
  const socketContext = useContext(SocketContext);

  const isAuthenticated = authContext?.isAuthenticated ?? false;
  const isSocketConnected = socketContext ? socketContext.isConnected : true;

  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return computeNetworkStatus({
    isBrowserOnline,
    isAuthenticated,
    isSocketConnected,
  });
}

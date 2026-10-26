import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface PlayerProfile {
  id: string;
  firstName: string;
  lastName: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'PLAYER';
  playerId?: string | null;
  player?: PlayerProfile | null;
}

export interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  displayName: string;
  loginWithGoogle: () => void;
  devLogin: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/auth/me', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.user === null) {
          setUser(null);
        } else if (data && data.user) {
          setUser(data.user);
        } else if (data && data.id) {
          setUser(data);
        } else {
          setUser(null);
        }
      } else if (res.status === 403) {
        const errData = await res.json().catch(() => null);
        setUser(null);
        setError(errData?.error || 'No estás en la lista blanca de la juntada.');
      } else {
        setUser(null);
      }
    } catch (err: any) {
      setUser(null);
      setError(err?.message || 'Error de conexión con el servidor.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const loginWithGoogle = useCallback(() => {
    window.location.href = '/api/auth/google';
  }, []);

  const devLogin = useCallback(async (email: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar sesión de desarrollo.');
      }

      setUser(data.user);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Display name resolution (RF-90):
  // 1. Linked historical player name: "FirstName LastName"
  // 2. User Google name
  // 3. User email
  const displayName = user
    ? user.player
      ? `${user.player.firstName} ${user.player.lastName}`.trim()
      : user.name || user.email
    : '';

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'ADMIN',
    isLoading,
    error,
    displayName,
    loginWithGoogle,
    devLogin,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}

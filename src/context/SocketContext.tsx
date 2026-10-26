import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

export interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  currentRoom: string | null;
  joinTournament: (tournamentId: string) => void;
  leaveTournament: (tournamentId: string) => void;
}

export const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const activeRoomRef = useRef<string | null>(null);

  useEffect(() => {
    // Only connect socket if authenticated
    if (!isAuthenticated) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

    const socketInstance = io(socketUrl, {
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      // Auto re-join tournament room if one was active before reconnect
      if (activeRoomRef.current) {
        socketInstance.emit('tournament:join', activeRoomRef.current);
      }
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [isAuthenticated]);

  const joinTournament = useCallback(
    (tournamentId: string) => {
      if (!tournamentId) return;
      activeRoomRef.current = tournamentId;
      setCurrentRoom(tournamentId);

      if (socket) {
        socket.emit('tournament:join', tournamentId);
      }
    },
    [socket]
  );

  const leaveTournament = useCallback(
    (tournamentId: string) => {
      if (!tournamentId) return;
      if (activeRoomRef.current === tournamentId) {
        activeRoomRef.current = null;
        setCurrentRoom(null);
      }

      if (socket) {
        socket.emit('tournament:leave', tournamentId);
      }
    },
    [socket]
  );

  const value: SocketContextType = {
    socket,
    isConnected,
    currentRoom,
    joinTournament,
    leaveTournament,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextType {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket debe ser utilizado dentro de un SocketProvider');
  }
  return context;
}

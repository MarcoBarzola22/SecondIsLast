import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Play,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useCountdown } from '../../hooks/useCountdown';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';
import { inputClassName } from '../ui/input';
import {
  isQuorumReached,
  getMissingPlayersForQuorum,
  canInitiateTournament,
} from '../../domain/quorum';

export interface ParticipantPlayer {
  id?: string;
  firstName: string;
  lastName: string;
}

export interface LobbyParticipant {
  id: string;
  playerId: string;
  isPresent: boolean;
  player: ParticipantPlayer;
}

export interface LobbyTournament {
  id: string;
  name: string;
  status: string;
  participantCount: number;
  participants: LobbyParticipant[];
}

export interface LobbyViewProps {
  onProceedToVoting?: () => void;
}

export function LobbyView({ onProceedToVoting }: LobbyViewProps) {
  const { user, isAdmin, isAuthenticated, loginWithGoogle } = useAuth();
  const { socket, isConnected, joinTournament } = useSocket();

  const [tournament, setTournament] = useState<LobbyTournament | null>(null);
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [count, setCount] = useState<number>(0);
  const [canStart, setCanStart] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [newLobbyName, setNewLobbyName] = useState<string>('');
  const [lobbyExpiresAt, setLobbyExpiresAt] = useState<string | null>(null);

  const countdown = useCountdown(lobbyExpiresAt, 120);

  // Fetch active tournament status from server
  const fetchActiveTournament = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/tournaments/active', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 401) {
          setTournament(null);
          return;
        }
        throw new Error('Error al consultar el estado del torneo.');
      }

      const data = await res.json();
      if (data.tournament) {
        setTournament(data.tournament);
        const parts = data.tournament.participants || [];
        setParticipants(parts);
        setCount(parts.length);
        setCanStart(parts.length >= 4);
        if (data.tournament.lobbyExpiresAt || data.lobbyExpiresAt) {
          setLobbyExpiresAt(data.tournament.lobbyExpiresAt || data.lobbyExpiresAt);
        } else if (parts.length < 4) {
          setLobbyExpiresAt(null);
        }
        joinTournament(data.tournament.id);
      } else {
        setTournament(null);
        setParticipants([]);
        setCount(0);
        setCanStart(false);
        setLobbyExpiresAt(null);
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setIsLoading(false);
    }
  }, [joinTournament]);

  useEffect(() => {
    fetchActiveTournament();
  }, [fetchActiveTournament]);

  // Listen to WebSocket lobby:updated events (RF-93, RF-94, RF-95, RF-96)
  useEffect(() => {
    if (!socket) return;

    const handleLobbyUpdated = (payload: {
      participants: LobbyParticipant[];
      count: number;
      canStart: boolean;
      lobbyExpiresAt?: string | null;
    }) => {
      setParticipants(payload.participants || []);
      const newCount = payload.count ?? payload.participants?.length ?? 0;
      setCount(newCount);
      setCanStart(payload.canStart ?? (newCount >= 4));
      if (payload.lobbyExpiresAt) {
        setLobbyExpiresAt(payload.lobbyExpiresAt);
      } else if (payload.lobbyExpiresAt === null || newCount < 4) {
        setLobbyExpiresAt(null);
      }
      setError(null);
    };

    socket.on('lobby:updated', handleLobbyUpdated);

    const handleVoteStarted = () => {
      onProceedToVoting?.();
    };

    const handleTournamentStatus = (payload: any) => {
      if (payload?.status === 'VOTING_FORMAT' || payload?.status === 'VOTING_THEME') {
        onProceedToVoting?.();
      }
    };

    socket.on('vote:started', handleVoteStarted);
    socket.on('tournament:status', handleTournamentStatus);

    return () => {
      socket.off('lobby:updated', handleLobbyUpdated);
      socket.off('vote:started', handleVoteStarted);
      socket.off('tournament:status', handleTournamentStatus);
    };
  }, [socket, onProceedToVoting]);

  // Check if current user is confirmed in the lobby
  const isUserConfirmed = Boolean(
    user &&
      participants.some(
        (p) =>
          p.playerId === user.playerId ||
          (user.player && p.playerId === user.player.id) ||
          (p.player &&
            user.player &&
            p.player.firstName.toLowerCase() === user.player.firstName.toLowerCase() &&
            p.player.lastName.toLowerCase() === user.player.lastName.toLowerCase())
      )
  );

  // Action: Open / Create Lobby (RF-98)
  const handleCreateLobby = async () => {
    if (!isAuthenticated) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch('/api/tournaments/lobby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: newLobbyName.trim() || undefined }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al abrir el lobby.');
      }

      setTournament(data.tournament);
      setParticipants(data.tournament.participants || []);
      setCount(0);
      setCanStart(false);
      joinTournament(data.tournament.id);
      setNewLobbyName('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Confirm Presence (RF-93, RF-94)
  const handleConfirmPresence = async () => {
    if (!tournament) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch('/api/tournaments/lobby/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ tournamentId: tournament.id }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al confirmar presencia.');
      }

      setParticipants(data.participants || []);
      setCount(data.count ?? data.participants?.length ?? 0);
      setCanStart(data.canStart ?? false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Cancel Presence (RF-95)
  const handleCancelPresence = async () => {
    if (!tournament) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch('/api/tournaments/lobby/presence', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ tournamentId: tournament.id }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al cancelar presencia.');
      }

      setParticipants(data.participants || []);
      setCount(data.count ?? data.participants?.length ?? 0);
      setCanStart(data.canStart ?? false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Admin Expel Participant (RF-95)
  const handleKickParticipant = async (participantId: string, playerName: string) => {
    if (!tournament || !isAdmin) return;
    const confirmed = window.confirm(`¿Querés remover a ${playerName} del lobby?`);
    if (!confirmed) return;

    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch(`/api/tournaments/lobby/participants/${participantId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ tournamentId: tournament.id }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al expulsar al participante.');
      }

      setParticipants(data.participants || []);
      setCount(data.count ?? data.participants?.length ?? 0);
      setCanStart(data.canStart ?? false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Start Format Voting (RF-96, RF-98, RF-99)
  const handleStartVoting = async () => {
    if (!tournament) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch('/api/tournaments/start-voting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ tournamentId: tournament.id }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar la votación.');
      }

      onProceedToVoting?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="font-display text-sm tracking-wider uppercase text-muted-foreground">
          Cargando estado del Lobby...
        </p>
      </div>
    );
  }

  // View State 1: No active tournament in progress (RF-97, RF-98)
  if (!tournament) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Panel title="Lobby de la Juntada" subtitle="Modo Nube">
          <div className="text-center space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/80 border border-border">
              <Users className="h-8 w-8 text-primary" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-secondary text-muted-foreground border border-border">
                Sin Torneo Activo
              </span>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                No hay ningún torneo activo en este momento. Cualquiera de los pibes puede abrir el
                Lobby para que todos confirmen presencia desde sus celulares.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded bg-destructive/15 border border-destructive/40 p-3 text-xs text-destructive text-left">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {isAuthenticated ? (
              <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
                  <input
                    type="text"
                    placeholder="Nombre de la juntada (opcional)"
                    value={newLobbyName}
                    onChange={(e) => setNewLobbyName(e.target.value)}
                    className={`${inputClassName} flex-1 text-sm`}
                    maxLength={50}
                  />
                  <PrimaryButton
                    type="button"
                    onClick={handleCreateLobby}
                    disabled={actionLoading}
                    className="w-full sm:w-auto"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Abrir Lobby</span>
                  </PrimaryButton>
                </div>
              </div>
            ) : (
              <div className="pt-2">
                <PrimaryButton type="button" onClick={loginWithGoogle}>
                  <span>Iniciar sesión para abrir el Lobby</span>
                </PrimaryButton>
              </div>
            )}
          </div>
        </Panel>
      </div>
    );
  }

  // View State 2: Active Lobby with presence and quorum (RF-93, RF-94, RF-95, RF-96, RF-119)
  const quorumPercentage = Math.min(100, Math.round((count / 4) * 100));

  return (
    <div className="mx-auto max-w-4xl px-4 py-4 space-y-6">
      {/* Lobby Header Card */}
      <Panel
        title={tournament.name}
        subtitle={isConnected ? 'En vivo' : 'Reconectando...'}
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-primary">
                Fase de Lobby
              </span>
              <span className="text-border">·</span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-mono ${
                  isConnected ? 'text-primary' : 'text-accent'
                }`}
              >
                {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {isConnected ? 'Sincronizado' : 'Sin conexión'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchActiveTournament}
                disabled={isLoading}
                title="Refrescar estado"
                className="p-2 rounded bg-secondary/80 border border-border text-muted-foreground hover:text-foreground transition"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

        {error && (
          <div className="flex items-center gap-2 rounded bg-destructive/15 border border-destructive/40 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quorum Progress Bar (RF-96) */}
        <div className="space-y-2 bg-secondary/40 border border-border/70 rounded-md p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-display font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" />
              Quórum de la Juntada
            </span>
            <span
              className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                canStart
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-accent/20 text-accent border border-accent/40'
              }`}
            >
              {count} / 4 Mínimo
            </span>
          </div>

          <div className="h-2.5 w-full bg-background rounded-full overflow-hidden border border-border/60">
            <div
              className={`h-full transition-all duration-500 ${
                canStart ? 'bg-primary glow-green' : 'bg-accent'
              }`}
              style={{ width: `${quorumPercentage}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            {canStart ? (
              <span className="text-primary font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                ¡Quórum completo! Ya pueden empezar a votar los formatos.
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-accent" />
                Faltan {4 - count} jugador{4 - count === 1 ? '' : 'es'} para habilitar el inicio.
              </span>
            )}
            <span className="font-mono">{count} Confirmado{count === 1 ? '' : 's'}</span>
          </div>
        </div>

        {/* Presence Action Buttons (RF-93, RF-95) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {isAuthenticated ? (
            isUserConfirmed ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full justify-between">
                <div className="flex items-center gap-2 text-primary font-bold text-xs">
                  <UserCheck className="h-4 w-4 shrink-0" />
                  <span>Tu presencia está confirmada</span>
                </div>
                <SecondaryButton
                  type="button"
                  onClick={handleCancelPresence}
                  disabled={actionLoading}
                  className="w-full sm:w-auto text-destructive border-destructive/60 hover:bg-destructive/20"
                >
                  <UserX className="h-4 w-4" />
                  <span>Cancelar presencia</span>
                </SecondaryButton>
              </div>
            ) : (
              <div className="w-full flex justify-end">
                <PrimaryButton
                  type="button"
                  onClick={handleConfirmPresence}
                  disabled={actionLoading}
                  className="w-full sm:w-auto"
                >
                  <UserCheck className="h-4 w-4" />
                  <span>Confirmar presencia</span>
                </PrimaryButton>
              </div>
            )
          ) : (
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Iniciá sesión para marcar tu presencia en la juntada.
              </span>
              <PrimaryButton type="button" onClick={loginWithGoogle} className="w-full sm:w-auto">
                <span>Iniciar sesión</span>
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>
      </Panel>

      {/* Confirmed Participants Grid (RF-119: responsive mobile & desktop) */}
      <Panel title="Jugadores Confirmados" subtitle={`${count} presentes`}>
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h3 className="font-display text-lg font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Jugadores Presentes ({count})
          </h3>
          <span className="text-xs text-muted-foreground font-mono">
            {count >= 4 ? 'Quórum listo' : 'En espera'}
          </span>
        </div>

        {participants.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm space-y-2">
            <Clock className="h-8 w-8 mx-auto opacity-40 mb-2" />
            <p>Todavía no hay jugadores confirmados en el lobby.</p>
            <p className="text-xs">Sé el primero en confirmar presencia arriba.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {participants.map((p, index) => {
              const fullName = `${p.player.firstName} ${p.player.lastName}`.trim();
              const isCurrentUser =
                user &&
                (p.playerId === user.playerId ||
                  (user.player && p.playerId === user.player.id));

              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between gap-2 p-3 rounded-md border transition ${
                    isCurrentUser
                      ? 'border-primary/80 bg-primary/10 glow-green'
                      : 'border-border/80 bg-secondary/50 hover:border-border'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-secondary font-display text-xs font-bold text-muted-foreground border border-border/80">
                      #{index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-sm text-foreground truncate" title={fullName}>
                          {fullName}
                        </p>
                        {isCurrentUser && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground">
                            Vos
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-primary flex items-center gap-1 font-mono">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        Presente
                      </span>
                    </div>
                  </div>

                  {/* Admin Kick Button (RF-95) */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleKickParticipant(p.id, fullName)}
                      disabled={actionLoading}
                      title={`Expulsar a ${fullName} del lobby`}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/15 rounded transition shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Advance to Voting Section (RF-98: Autonomous start when quorum >= 4) */}
      <Panel title="Siguiente Paso" subtitle="Votación de Formato">
        <div className="max-w-md mx-auto space-y-2 text-center">
          <h4 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
            Siguiente Paso: Votación de Formato
          </h4>

          {/* 120s Prominent Countdown when Quorum Reached (>= 4) */}
          {count >= 4 && (
            <div className="my-4 flex flex-col items-center justify-center rounded-xl border border-primary/40 bg-primary/10 p-5 text-center shadow-lg backdrop-blur-sm">
              <span className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5 mb-1.5">
                <Clock className="h-4 w-4 animate-spin text-primary" />
                Esperando más amigos para la juntada
              </span>
              <div
                className={`font-mono text-4xl sm:text-5xl font-black tracking-widest py-1 transition-all ${
                  countdown.secondsLeft <= 15
                    ? 'text-destructive animate-pulse'
                    : countdown.secondsLeft <= 45
                    ? 'text-accent'
                    : 'text-primary glow-green'
                }`}
              >
                {countdown.formattedTime}
              </div>
              <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                Al llegar a cero o al tocar &quot;Iniciar Votación Ahora&quot;, avanzamos automáticamente a la votación de formato.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {isQuorumReached(count)
              ? isUserConfirmed
                ? '¡Quórum alcanzado! Podés esperar a los demás amigos o ir directamente a la votación.'
                : 'Quórum alcanzado. Confirmá tu presencia arriba para habilitar el inicio.'
              : `Faltan ${getMissingPlayersForQuorum(count)} jugador${
                  getMissingPlayersForQuorum(count) === 1 ? '' : 'es'
                } confirmados para habilitar el inicio.`}
          </p>
        </div>

        <div className="flex justify-center mt-4">
          <PrimaryButton
            type="button"
            disabled={!canInitiateTournament(count, isUserConfirmed) || actionLoading}
            onClick={handleStartVoting}
            className={`w-full sm:w-auto px-8 ${
              canInitiateTournament(count, isUserConfirmed)
                ? 'glow-green animate-pulse'
                : 'opacity-50'
            }`}
          >
            <Play className="h-4 w-4" />
            <span>{count >= 4 ? 'Iniciar Votación Ahora (Ya estamos todos)' : 'Iniciar Votación de Formato'}</span>
          </PrimaryButton>
        </div>
      </Panel>
    </div>
  );
}

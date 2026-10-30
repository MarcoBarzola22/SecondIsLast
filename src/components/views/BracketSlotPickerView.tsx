import { useEffect, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  Trophy,
  Shield,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { Panel } from '../ui/Panel';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useCountdown } from '../../hooks/useCountdown';

export interface BracketSlotDef {
  slotIndex: number;
  label: string;
  matchGroup: string;
  round: string;
  isBye?: boolean;
  participantId: string | null;
  participantName: string | null;
  teamName: string | null;
}

export interface BracketSlotTurnEntry {
  order: number;
  participantId: string;
  playerId: string;
  participantName: string;
  teamName: string;
}

export interface BracketSlotPickerViewProps {
  tournamentId?: string;
  onProceedToBracket?: () => void;
}

export function BracketSlotPickerView({
  tournamentId,
  onProceedToBracket,
}: BracketSlotPickerViewProps) {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();

  const [turnOrder, setTurnOrder] = useState<BracketSlotTurnEntry[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number>(0);
  const [slots, setSlots] = useState<Record<number, BracketSlotDef>>({});
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const countdown = useCountdown(expiresAt, 20);

  // Sync active bracket slot session on mount
  useEffect(() => {
    if (!socket || !tournamentId) return;

    socket.emit('bracket_slot:sync', tournamentId, (res: any) => {
      if (res?.ok) {
        if (res.turnOrder) setTurnOrder(res.turnOrder);
        if (typeof res.currentTurnIndex === 'number') setCurrentTurnIndex(res.currentTurnIndex);
        if (res.slots) setSlots(res.slots);
        if (res.expiresAt) setExpiresAt(res.expiresAt);
      }
    });

    const handleSessionStarted = (payload: any) => {
      if (payload.turnOrder) setTurnOrder(payload.turnOrder);
      if (typeof payload.currentTurnIndex === 'number') setCurrentTurnIndex(payload.currentTurnIndex);
      if (payload.slots) setSlots(payload.slots);
      if (payload.expiresAt) setExpiresAt(payload.expiresAt);
      setError(null);
    };

    const handleUpdated = (payload: any) => {
      if (typeof payload.currentTurnIndex === 'number') setCurrentTurnIndex(payload.currentTurnIndex);
      if (payload.slots) setSlots(payload.slots);
      if (payload.expiresAt) setExpiresAt(payload.expiresAt);
      setIsSubmitting(false);
      setError(null);
    };

    const handleCompleted = () => {
      if (onProceedToBracket) {
        onProceedToBracket();
      }
    };

    const handleFixtureReady = () => {
      if (onProceedToBracket) {
        onProceedToBracket();
      }
    };

    socket.on('bracket_slot:session_started', handleSessionStarted);
    socket.on('bracket_slot:updated', handleUpdated);
    socket.on('bracket_slot:completed', handleCompleted);
    socket.on('fixture:ready', handleFixtureReady);

    return () => {
      socket.off('bracket_slot:session_started', handleSessionStarted);
      socket.off('bracket_slot:updated', handleUpdated);
      socket.off('bracket_slot:completed', handleCompleted);
      socket.off('fixture:ready', handleFixtureReady);
    };
  }, [socket, tournamentId, onProceedToBracket]);

  const currentTurn = turnOrder[currentTurnIndex];
  const userPlayerId = user?.playerId || user?.player?.id;
  const isMyTurn = Boolean(
    currentTurn &&
      ((userPlayerId && currentTurn.playerId === userPlayerId) ||
        (user?.id && currentTurn.participantId === user.id))
  );

  const handlePickSlot = async (slotIndex: number) => {
    if (!isMyTurn || isSubmitting || !tournamentId) return;

    try {
      setIsSubmitting(true);
      setError(null);

      if (socket) {
        socket.emit('bracket_slot:pick', { tournamentId, slotIndex }, (res: any) => {
          if (res && !res.ok) {
            setError(res.message || 'Error al seleccionar casillero.');
            setIsSubmitting(false);
          }
        });
      } else {
        const res = await fetch('/api/tournaments/bracket-slots/pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tournamentId, slotIndex }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Error al seleccionar casillero.');
        }
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión.');
      setIsSubmitting(false);
    }
  };

  // Group slots by matchGroup for visual bracket structure
  const groupedSlots = Object.values(slots).reduce<Record<string, BracketSlotDef[]>>((acc, slot) => {
    const group = slot.matchGroup || 'Llave';
    if (!acc[group]) acc[group] = [];
    acc[group].push(slot);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 space-y-6">
      {/* HUD Header */}
      <Panel
        title="Armado Interactivo de Llaves Eliminatorias"
        subtitle={isConnected ? 'Sincronizado en Tiempo Real' : 'Sin conexión'}
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border/60 pb-4">
            <div className="text-center sm:text-left">
              <span className="text-[11px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5 justify-center sm:justify-start">
                <Sparkles className="h-3.5 w-3.5" />
                Elección de Casilleros por Orden
              </span>
              <h2 className="font-display text-2xl font-black text-foreground">
                Ubicá tu Posición en la Llave
              </h2>
            </div>

            {/* Countdown Badge */}
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 rounded-md border px-4 py-2 font-mono font-bold text-lg ${
                  countdown.secondsLeft <= 5
                    ? 'border-destructive bg-destructive/20 text-destructive animate-pulse'
                    : countdown.secondsLeft <= 10
                    ? 'border-accent bg-accent/20 text-accent'
                    : 'border-primary/60 bg-primary/10 text-primary glow-green'
                }`}
              >
                <Clock className="h-5 w-5" />
                <span>{countdown.formattedTime}</span>
              </div>
            </div>
          </div>

          {/* Turn Indicator Banner */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left transition ${
              isMyTurn
                ? 'border-primary bg-primary/20 glow-green text-foreground shadow-lg'
                : 'border-border/80 bg-secondary/40 text-muted-foreground'
            }`}
          >
            <div className="space-y-0.5">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="font-mono text-xs uppercase tracking-widest font-bold">
                  {isMyTurn ? '🔥 ¡ES TU TURNO DE ELEGIR!' : '⏳ TURNO ACTUAL:'}
                </span>
                {currentTurn && (
                  <span className="bg-primary/20 text-primary border border-primary/40 rounded px-2 py-0.5 text-xs font-bold font-mono">
                    Turno {currentTurn.order} de {turnOrder.length}
                  </span>
                )}
              </div>
              <h3 className="font-display text-lg sm:text-xl font-black text-foreground">
                {currentTurn ? (
                  <>
                    <span>{currentTurn.participantName}</span>{' '}
                    <span className="text-accent text-base font-semibold">
                      ({currentTurn.teamName})
                    </span>
                  </>
                ) : (
                  'Iniciando sesión...'
                )}
              </h3>
            </div>

            <p className="text-xs font-medium max-w-xs text-center sm:text-right">
              {isMyTurn
                ? 'Hacé clic en cualquiera de los casilleros libres para colocarte en la llave.'
                : 'Esperando a que el jugador en turno elija su casillero...'}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded bg-destructive/15 border border-destructive/40 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </Panel>

      {/* Bracket Slots Diagram */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Trophy className="h-5 w-5 text-gold" />
            Casilleros de 1ª Ronda
          </h3>
          <span className="text-xs font-mono text-muted-foreground">
            {Object.values(slots).filter((s) => s.participantId).length} / {Object.keys(slots).length} Casilleros Ocupados
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(groupedSlots).map(([groupName, groupSlots]) => (
            <div
              key={groupName}
              className="flex flex-col gap-3 rounded-xl border border-border/80 bg-secondary/30 p-4 shadow-md"
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="font-display text-sm font-bold uppercase tracking-wider text-primary">
                  {groupName}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground uppercase">
                  {groupSlots.some((s) => s.isBye) ? 'Pase Directo / Cruce' : 'Mano a Mano'}
                </span>
              </div>

              <div className="space-y-2.5">
                {groupSlots.map((slot, idx) => {
                  const isOccupied = Boolean(slot.participantId);

                  return (
                    <div key={slot.slotIndex} className="space-y-1">
                      {idx > 0 && !slot.isBye && !groupSlots[idx - 1]?.isBye && (
                        <div className="text-center font-mono text-[10px] uppercase font-bold text-muted-foreground tracking-widest my-1">
                          VS
                        </div>
                      )}

                      {isOccupied ? (
                        <div className="flex items-center justify-between rounded-lg border border-primary/50 bg-primary/10 p-3 shadow-inner">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary border border-primary/40 shrink-0">
                              <Shield className="h-4 w-4" />
                            </div>
                            <div className="truncate">
                              <p className="font-display font-bold text-sm text-foreground truncate">
                                {slot.participantName}
                              </p>
                              <span className="inline-block text-[11px] font-semibold text-accent truncate">
                                {slot.teamName}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono bg-primary/20 border border-primary/40 text-primary px-2 py-0.5 rounded font-bold shrink-0">
                            Ocupado
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!isMyTurn || isSubmitting}
                          onClick={() => handlePickSlot(slot.slotIndex)}
                          className={`w-full flex items-center justify-between rounded-lg border-2 border-dashed p-3 transition text-left ${
                            isMyTurn
                              ? 'border-primary/80 bg-primary/15 hover:bg-primary/25 hover:border-primary glow-green cursor-pointer'
                              : 'border-border/60 bg-background/40 cursor-not-allowed opacity-80'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-muted-foreground">
                              {slot.label}
                            </span>
                          </div>

                          {isMyTurn ? (
                            <span className="text-xs font-bold text-primary bg-primary/20 border border-primary px-2.5 py-1 rounded font-mono animate-pulse">
                              Clic para Ubicarte
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono text-muted-foreground/70">
                              Libre
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Turn Order Sidebar / Footbar */}
      <Panel title="Orden de Elección de Casilleros" subtitle="Sorteado al Azar">
        <div className="flex flex-wrap items-center gap-2.5">
          {turnOrder.map((entry, index) => {
            const isTurnCurrent = index === currentTurnIndex;
            const isTurnDone = index < currentTurnIndex;

            return (
              <div
                key={entry.participantId}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition ${
                  isTurnCurrent
                    ? 'border-primary bg-primary/20 text-primary font-bold shadow-md glow-green'
                    : isTurnDone
                    ? 'border-border/60 bg-secondary/30 text-muted-foreground'
                    : 'border-border/40 bg-background/40 text-muted-foreground/50'
                }`}
              >
                <span className="font-bold">{entry.order}º</span>
                <span className="truncate max-w-[120px] text-foreground font-semibold">
                  {entry.participantName}
                </span>
                {isTurnDone && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                {isTurnCurrent && <span className="text-[10px] uppercase font-bold text-primary shrink-0">En Turno</span>}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

import { useState } from 'react';
import { AlertTriangle, Shield, UserX, Loader2, X, AlertCircle } from 'lucide-react';
import { formatPlayerName } from '../../domain/players';
import type { PlayerId } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { Panel } from '../ui/Panel';
import { DangerButton, SecondaryButton } from '../ui/Buttons';

interface ParticipantsWalkoverPanelProps {
  className?: string;
}

interface WalkoverTarget {
  id: PlayerId;
  name: string;
  isSelf: boolean;
}

export function ParticipantsWalkoverPanel({ className }: ParticipantsWalkoverPanelProps) {
  const { activeTournament, players } = useAppState();
  const dispatch = useAppDispatch();
  const { user, isAdmin } = useAuth();
  const { isOffline } = useNetworkStatus();

  const [modalTarget, setModalTarget] = useState<WalkoverTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  if (!activeTournament) return null;

  const { participantIds, teams, walkoverPlayerIds = [] } = activeTournament;
  const playersMap = new Map(players.map((p) => [p.id, p]));

  const currentUserId = user?.playerId || user?.player?.id;

  const handleOpenModal = (id: PlayerId, name: string) => {
    const isSelf = Boolean(currentUserId && currentUserId === id);
    setModalError(null);
    setModalTarget({ id, name, isSelf });
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setModalTarget(null);
    setModalError(null);
  };

  const handleConfirmWalkover = async () => {
    if (!modalTarget) return;

    setIsSubmitting(true);
    setModalError(null);

    // Locate participant UUID in activeTournament.participants if present, else use playerId
    const participantObj = (activeTournament as any).participants?.find(
      (p: any) => p.id === modalTarget.id || p.playerId === modalTarget.id
    );
    const targetParamId = participantObj?.id ?? modalTarget.id;

    try {
      const res = await fetch(`/api/tournaments/participants/${targetParamId}/walkover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
      });

      if (!res.ok) {
        // If 404 and offline mode, fall back to local client state transition
        if (res.status === 404) {
          dispatch({ type: 'PLAYER_WALKOVER_DECLARED', playerId: modalTarget.id });
          setModalTarget(null);
          return;
        }

        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al procesar el abandono.');
      }

      const data = await res.json();
      dispatch({
        type: 'PLAYER_WALKOVER_DECLARED',
        playerId: modalTarget.id,
        participantId: data.participant?.id,
        matches: data.matches,
      });

      setModalTarget(null);
    } catch (err: any) {
      setModalError(err.message || 'Error de conexión al declarar abandono.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Panel
        title="Participantes del Torneo"
        subtitle="Estado de competencia y gestión de abandonos (W.O.)"
        className={className}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {participantIds.map((id) => {
            const p = playersMap.get(id);
            const name = p ? formatPlayerName(p) : 'Desconocido';
            const team = teams[id] ?? 'Sin equipo';
            const hasWalkover = walkoverPlayerIds.includes(id);

            // RF-116: Only self (auto-walkover) or Admin (administrative walkover) can act
            const isSelf = Boolean(currentUserId && currentUserId === id);
            const canDeclare = !user || isAdmin || isSelf;

            return (
              <div
                key={id}
                className={`flex items-center justify-between gap-3 rounded-md border p-3 transition ${
                  hasWalkover
                    ? 'border-destructive/40 bg-destructive/10 opacity-75'
                    : 'border-border/60 bg-background/50 hover:border-border'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p
                      className={`truncate text-sm font-semibold ${
                        hasWalkover
                          ? 'text-destructive line-through'
                          : 'text-foreground'
                      }`}
                    >
                      {name}
                    </p>
                    {hasWalkover && (
                      <span className="shrink-0 rounded bg-destructive/20 border border-destructive/50 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-destructive flex items-center gap-0.5">
                        <AlertTriangle className="h-2.5 w-2.5" /> W.O.
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Shield className="h-3 w-3 shrink-0 text-primary" />
                    <span className="truncate">{team}</span>
                  </div>
                </div>

                <div>
                  {hasWalkover ? (
                    <span className="inline-flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-destructive">
                      <UserX className="h-3.5 w-3.5" /> Abandono
                    </span>
                  ) : canDeclare ? (
                    <button
                      type="button"
                      disabled={isOffline}
                      onClick={() => handleOpenModal(id, name)}
                      className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/25 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        isOffline
                          ? 'Sin conexión: acción pausada'
                          : isSelf
                          ? 'Auto-declarar abandono del torneo (RF-116 vía 1)'
                          : 'Declarar abandono administrativo (RF-116 vía 2)'
                      }
                    >
                      <UserX className="h-3.5 w-3.5" />
                      <span>Abandonar</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-medium text-muted-foreground/60 italic">
                      En juego
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Modal de Confirmación Estricta de Walkover (RF-116, RF-117) */}
      {modalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="panel-metal w-full max-w-lg rounded-md border border-destructive/60 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b border-destructive/30 px-5 py-3.5 bg-destructive/15">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <h3 className="font-display text-sm font-black tracking-wider uppercase">
                  Declarar Abandono (Walkover)
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="p-1 rounded text-muted-foreground hover:text-foreground transition disabled:opacity-50"
                title="Cerrar modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Cuerpo del modal */}
            <div className="p-5 space-y-4 text-sm">
              {modalError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/15 border border-destructive/40 text-destructive text-xs rounded-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="rounded border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200 space-y-1">
                <p className="font-bold text-amber-400">
                  {modalTarget.isSelf
                    ? 'Vía reglamentaria: Auto-declaración de abandono (RF-116 vía 1)'
                    : 'Vía reglamentaria: Acción de Administrador (RF-116 vía 2)'}
                </p>
                <p>
                  ¿Confirmás que <strong className="text-foreground">{modalTarget.name}</strong> abandona el torneo?
                </p>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="font-bold text-destructive">
                  ¡Atención! Esta acción es definitiva e irreversible:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    Todos sus partidos en el torneo (jugados, en curso y futuros) se sobreescribirán como derrotas por <strong>0-3</strong> (3 goles a favor del rival y 0 tarjetas).
                  </li>
                  <li>
                    Los partidos se cerrarán automáticamente (<strong>CLOSED</strong>) sin requerir confirmación ni handshake de sus rivales.
                  </li>
                  <li>
                    Sus rivales quedarán <strong>liberados y desbloqueados de inmediato</strong> para jugar las siguientes fechas o avanzar en la llave.
                  </li>
                </ul>
              </div>

              {isOffline && (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-center text-xs text-amber-300">
                  Sin conexión con el servidor. El registro de abandono requiere conectividad.
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/50">
                <SecondaryButton
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs"
                >
                  Cancelar
                </SecondaryButton>
                <DangerButton
                  onClick={handleConfirmWalkover}
                  disabled={isSubmitting || isOffline}
                  className="px-4 py-2 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      Procesando abandono...
                    </>
                  ) : (
                    <>
                      <UserX className="h-3.5 w-3.5 mr-1" />
                      Sí, confirmar abandono (W.O.)
                    </>
                  )}
                </DangerButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

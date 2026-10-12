import { AlertTriangle, Shield, UserX } from 'lucide-react';
import { formatPlayerName } from '../../domain/players';
import type { PlayerId } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { Panel } from '../ui/Panel';

interface ParticipantsWalkoverPanelProps {
  className?: string;
}

export function ParticipantsWalkoverPanel({ className }: ParticipantsWalkoverPanelProps) {
  const { activeTournament, players } = useAppState();
  const dispatch = useAppDispatch();

  if (!activeTournament) return null;

  const { participantIds, teams, walkoverPlayerIds = [] } = activeTournament;
  const playersMap = new Map(players.map((p) => [p.id, p]));

  const handleWalkover = (playerId: PlayerId, playerName: string) => {
    const ok = window.confirm(
      `¿Confirmás que ${playerName} abandona el torneo?\n\nEsta acción no se puede deshacer: todos sus partidos (jugados y por jugar) se sobreescribirán automáticamente como derrotas por 0-3.`
    );
    if (ok) {
      dispatch({ type: 'PLAYER_WALKOVER_DECLARED', playerId });
    }
  };

  return (
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
                ) : (
                  <button
                    type="button"
                    onClick={() => handleWalkover(id, name)}
                    className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/25 transition active:scale-95"
                    title={`Declarar abandono de ${name}`}
                  >
                    <UserX className="h-3.5 w-3.5" />
                    <span>Abandonar</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

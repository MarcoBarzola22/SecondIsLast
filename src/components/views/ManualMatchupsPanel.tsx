import { useState, useMemo } from 'react';
import {
  SlidersHorizontal,
  Shuffle,
  Check,
  X,
  Swords,
  Award,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { formatPlayerName } from '../../domain/players';
import {
  getMatchupSlotGroups,
  extractParticipantOrderFromSeries,
} from '../../domain/bracket';
import { shuffle } from '../../domain/random';
import type { ActiveTournament, PlayerId } from '../../domain/types';

interface ManualMatchupsPanelProps {
  mode: 'bracket' | 'double_elimination';
  className?: string;
}

export function ManualMatchupsPanel({
  mode,
  className = '',
}: ManualMatchupsPanelProps) {
  const { activeTournament } = useAppState();

  if (!activeTournament) return null;

  const { series } = activeTournament;

  // Only allowed if no match has started or confirmed (RF-87, D36)
  const canEditMatchups =
    series.length > 0 &&
    series.every(
      (s) =>
        !s.confirmed &&
        s.leg1.a === null &&
        s.leg1.b === null &&
        s.leg2.a === null &&
        s.leg2.b === null
    );

  if (!canEditMatchups) return null;

  return (
    <ManualMatchupsContent
      tournament={activeTournament}
      mode={mode}
      className={className}
    />
  );
}

interface ManualMatchupsContentProps {
  tournament: ActiveTournament;
  mode: 'bracket' | 'double_elimination';
  className?: string;
}

function ManualMatchupsContent({
  tournament,
  mode,
  className = '',
}: ManualMatchupsContentProps) {
  const { players } = useAppState();
  const dispatch = useAppDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { participantIds, teams, series, bracketOrder } = tournament;
  const count = participantIds.length;

  const slotGroups = useMemo(() => getMatchupSlotGroups(count), [count]);
  const playersMap = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  // Initialize draft order
  const initialOrder = useMemo(() => {
    if (bracketOrder && bracketOrder.length === count) {
      return [...bracketOrder];
    }
    return extractParticipantOrderFromSeries(series, count, participantIds);
  }, [bracketOrder, series, count, participantIds]);

  const [currentOrder, setCurrentOrder] = useState<PlayerId[]>(initialOrder);

  // Ensure currentOrder updates if tournament changes
  const handleOpen = () => {
    setCurrentOrder(
      bracketOrder && bracketOrder.length === count
        ? [...bracketOrder]
        : extractParticipantOrderFromSeries(series, count, participantIds)
    );
    setSuccessMessage(null);
    setIsOpen(true);
  };

  const handleSlotChange = (slotIndex: number, newPlayerId: PlayerId) => {
    if (!newPlayerId) return;
    const next = [...currentOrder];
    const existingIndex = next.indexOf(newPlayerId);
    if (existingIndex !== -1 && existingIndex !== slotIndex) {
      // Automatic swap for seamless UX without duplicates
      next[existingIndex] = next[slotIndex];
    }
    next[slotIndex] = newPlayerId;
    setCurrentOrder(next);
  };

  const handleRandomize = () => {
    const shuffled = shuffle(participantIds);
    setCurrentOrder(shuffled);
  };

  const handleReset = () => {
    setCurrentOrder(initialOrder);
  };

  const isValid =
    currentOrder.length === count &&
    new Set(currentOrder).size === count &&
    currentOrder.every((id) => Boolean(id) && participantIds.includes(id));

  const handleSave = () => {
    if (!isValid) return;

    if (mode === 'bracket') {
      dispatch({
        type: 'BRACKET_MATCHUPS_MANUALLY_SET',
        orderedParticipantIds: currentOrder,
      });
    } else {
      dispatch({
        type: 'DOUBLE_ELIMINATION_MATCHUPS_MANUALLY_SET',
        orderedParticipantIds: currentOrder,
      });
    }

    setSuccessMessage('¡Cruces iniciales y Byes actualizados con éxito!');
    setTimeout(() => {
      setSuccessMessage(null);
      setIsOpen(false);
    }, 1200);
  };

  const getPlayerLabel = (id: PlayerId) => {
    const p = playersMap.get(id);
    const name = p ? formatPlayerName(p) : id;
    const team = teams[id] ? ` (${teams[id]})` : '';
    return `${name}${team}`;
  };

  return (
    <div className={`mb-6 ${className}`}>
      {!isOpen ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4 transition hover:border-accent/50">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-accent/15 p-2 text-accent">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">
                Armado Manual de Cruces y Byes
              </h4>
              <p className="text-xs text-muted-foreground">
                Configurá a dedo quién juega contra quién en la primera ronda y
                quiénes tienen pase directo antes de empezar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpen}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent-foreground shadow-md transition hover:bg-accent/90"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Armar Cruces a Mano
          </button>
        </div>
      ) : (
        <div className="panel-metal rounded-lg border border-accent/40 bg-card/95 p-5 shadow-xl md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-4">
            <div className="flex items-center gap-2.5">
              <Swords className="h-5 w-5 text-accent" />
              <div>
                <h3 className="font-display text-base font-black uppercase tracking-wider text-accent">
                  Armado Manual de Cruces y Byes
                </h3>
                <span className="text-xs text-muted-foreground">
                  {mode === 'bracket' ? 'Llaves' : 'Doble Eliminación'} · {count}{' '}
                  participantes
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRandomize}
                className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary"
                title="Sortear aleatoriamente los cruces"
              >
                <Shuffle className="h-3.5 w-3.5 text-accent" />
                Sortear Azar
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary"
                title="Restablecer configuración original"
              >
                <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                Restablecer
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {successMessage && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-400">
              <Check className="h-4 w-4" />
              {successMessage}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
            {slotGroups.map((group) => {
              const isBye = group.type === 'bye';
              return (
                <div
                  key={group.id}
                  className={`rounded-lg border p-4 transition ${
                    isBye
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-border/70 bg-secondary/20'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2">
                    <div className="flex items-center gap-2">
                      {isBye ? (
                        <Award className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Swords className="h-4 w-4 text-accent" />
                      )}
                      <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                        {group.title}
                      </h4>
                    </div>
                    {isBye && (
                      <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        Pase Directo (Bye)
                      </span>
                    )}
                  </div>

                  {group.description && (
                    <p className="mb-3 text-[11px] text-muted-foreground">
                      {group.description}
                    </p>
                  )}

                  <div className="flex flex-col gap-2.5">
                    {group.slots.map((slot, sIdx) => {
                      const selectedVal = currentOrder[slot.index] ?? '';
                      return (
                        <div key={slot.index} className="space-y-1">
                          {group.type === 'matchup' && (
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">
                              {slot.label}
                            </span>
                          )}
                          <select
                            value={selectedVal}
                            onChange={(e) =>
                              handleSlotChange(slot.index, e.target.value)
                            }
                            className="w-full rounded-md border border-border bg-background/90 px-3 py-2 text-xs font-semibold text-foreground transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                          >
                            <option value="">-- Seleccionar Jugador --</option>
                            {participantIds.map((pId) => {
                              const isSelectedHere = selectedVal === pId;
                              const isSelectedElsewhere =
                                !isSelectedHere && currentOrder.includes(pId);
                              return (
                                <option key={pId} value={pId}>
                                  {getPlayerLabel(pId)}{' '}
                                  {isSelectedElsewhere ? '(Intercambiar)' : ''}
                                </option>
                              );
                            })}
                          </select>
                          {group.type === 'matchup' &&
                            sIdx === 0 &&
                            group.slots.length > 1 && (
                              <div className="py-1 text-center font-display text-[10px] font-black uppercase tracking-widest text-accent">
                                — VS —
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-4">
            <div className="flex items-center gap-2">
              {!isValid ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    Debes asignar a todos los participantes sin repetir.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <Check className="h-4 w-4" />
                  <span>Cruces completos y listos para confirmar.</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!isValid}
                onClick={handleSave}
                className="flex items-center gap-2 rounded-md bg-accent px-5 py-2 text-xs font-bold uppercase tracking-wider text-accent-foreground shadow-lg transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Guardar y Actualizar Cruces
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

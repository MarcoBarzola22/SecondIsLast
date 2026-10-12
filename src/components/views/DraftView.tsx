import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Disc3,
  Layers,
  ListOrdered,
  RotateCcw,
  Shield,
  Shuffle,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { generateBracket } from '../../domain/bracket';
import { generateLeagueFixture } from '../../domain/league';
import { generateGroupsFixture } from '../../domain/groupStage';
import { generateDoubleEliminationBracket } from '../../domain/doubleElimination';
import {
  assignTeamsAutomatically,
  getCurrentDrafter,
  isDraftComplete,
  normalizeTeamName,
  validateTeamName,
} from '../../domain/draft';
import { formatPlayerName } from '../../domain/players';
import type { PlayerId } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';
import { inputClassName } from '../ui/input';
import { Panel } from '../ui/Panel';

interface DraftViewProps {
  onProceedToBracket: () => void;
  onProceedToLeague?: () => void;
  onProceedToGroupStage?: () => void;
  onProceedToDoubleElimination?: () => void;
}

export function DraftView({
  onProceedToBracket,
  onProceedToLeague,
  onProceedToGroupStage,
  onProceedToDoubleElimination,
}: DraftViewProps) {
  const { activeTournament, players } = useAppState();
  const dispatch = useAppDispatch();

  const [draftMode, setDraftMode] = useState<'manual' | 'auto'>('manual');
  const [teamInput, setTeamInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Sorteo Automático state (RF-52)
  const [autoTeams, setAutoTeams] = useState<string[]>(() => {
    if (!activeTournament) return [];
    return activeTournament.participantIds.map(
      (id) => activeTournament.teams[id] || ''
    );
  });
  const [autoError, setAutoError] = useState<string | null>(null);
  const [showAutoForm, setShowAutoForm] = useState(false);

  // Animación secuencial de revelado (RF-82)
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealedIndex, setRevealedIndex] = useState(-1);
  const [stagedAssignments, setStagedAssignments] = useState<
    Record<PlayerId, string>
  >({});
  const [shufflingName, setShufflingName] = useState<string>('');
  const revealTimeoutsRef = useRef<number[]>([]);

  const clearAllTimeouts = () => {
    revealTimeoutsRef.current.forEach((t) => window.clearTimeout(t));
    revealTimeoutsRef.current = [];
  };

  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, []);

  if (!activeTournament) {
    return null;
  }

  const { theme, draftOrder, teams, participantIds } = activeTournament;
  const playersMap = new Map(players.map((p) => [p.id, p]));

  const currentDrafterId = getCurrentDrafter(draftOrder, teams);
  const complete = isDraftComplete(participantIds, teams);

  const orderForReveal =
    draftOrder.length === participantIds.length ? draftOrder : participantIds;

  const handleSkipReveal = () => {
    clearAllTimeouts();
    dispatch({
      type: 'TEAMS_BATCH_ASSIGNED',
      teams: stagedAssignments,
    });
    setIsRevealing(false);
    setRevealedIndex(orderForReveal.length);
    setShowAutoForm(false);
  };

  const runSequentialReveal = (assigned: Record<PlayerId, string>) => {
    clearAllTimeouts();
    setIsRevealing(true);
    setRevealedIndex(0);
    setStagedAssignments(assigned);

    const stepDuration = 650; // ms por participante

    orderForReveal.forEach((playerId, i) => {
      const startTime = i * stepDuration;

      // 1. Sorteo rápido estilo slot-machine para el participante i
      const tStart = window.setTimeout(() => {
        setRevealedIndex(i);
        const r1 =
          autoTeams[Math.floor(Math.random() * autoTeams.length)] || '';
        setShufflingName(r1);
      }, startTime);
      revealTimeoutsRef.current.push(tStart);

      const tShuff1 = window.setTimeout(() => {
        const r2 =
          autoTeams[Math.floor(Math.random() * autoTeams.length)] || '';
        setShufflingName(r2);
      }, startTime + 100);
      revealTimeoutsRef.current.push(tShuff1);

      const tShuff2 = window.setTimeout(() => {
        const r3 =
          autoTeams[Math.floor(Math.random() * autoTeams.length)] || '';
        setShufflingName(r3);
      }, startTime + 200);
      revealTimeoutsRef.current.push(tShuff2);

      // 2. Revelado y fijado definitivo para el participante i
      const tLock = window.setTimeout(() => {
        setShufflingName(assigned[playerId] || '');
      }, startTime + 320);
      revealTimeoutsRef.current.push(tLock);
    });

    // 3. Finalización y despacho al terminar todos los participantes
    const totalDuration = orderForReveal.length * stepDuration + 350;
    const tFinal = window.setTimeout(() => {
      setRevealedIndex(orderForReveal.length);
      dispatch({
        type: 'TEAMS_BATCH_ASSIGNED',
        teams: assigned,
      });
      setIsRevealing(false);
      setShowAutoForm(false);
    }, totalDuration);
    revealTimeoutsRef.current.push(tFinal);
  };

  // Live validation for Sorteo Automático (RF-52)
  const duplicateIndices = new Set<number>();
  const normalizedSeen = new Map<string, number>();
  let emptyCount = 0;

  autoTeams.forEach((t, idx) => {
    const trimmed = t.trim();
    if (trimmed.length === 0) {
      emptyCount++;
    } else {
      const norm = normalizeTeamName(trimmed);
      if (normalizedSeen.has(norm)) {
        duplicateIndices.add(idx);
        duplicateIndices.add(normalizedSeen.get(norm)!);
      } else {
        normalizedSeen.set(norm, idx);
      }
    }
  });

  const hasDuplicates = duplicateIndices.size > 0;
  const isAllFilled =
    emptyCount === 0 && autoTeams.length === participantIds.length;
  const isAutoValid = isAllFilled && !hasDuplicates;

  const handleSwitchMode = (mode: 'manual' | 'auto') => {
    if (isRevealing) return;
    if (mode === 'auto') {
      const hasAny = autoTeams.some((t) => t.trim().length > 0);
      if (!hasAny) {
        setAutoTeams(participantIds.map((id) => teams[id] || ''));
      }
    }
    setDraftMode(mode);
  };

  const handleAutoTeamChange = (index: number, value: string) => {
    const updated = [...autoTeams];
    updated[index] = value;
    setAutoTeams(updated);
    if (autoError) setAutoError(null);
  };

  const handleAutoAssign = (e: FormEvent) => {
    e.preventDefault();
    if (!isAutoValid) {
      if (hasDuplicates) {
        setAutoError('No puede haber nombres de equipos duplicados.');
      } else {
        setAutoError('Todos los nombres de equipos son obligatorios.');
      }
      return;
    }

    try {
      const assigned = assignTeamsAutomatically(participantIds, autoTeams);
      setAutoError(null);
      runSequentialReveal(assigned);
    } catch (err) {
      setAutoError(
        err instanceof Error ? err.message : 'Error al sortear equipos.'
      );
    }
  };

  const handleConfirmTeam = (e: FormEvent, playerId: PlayerId) => {
    e.preventDefault();
    setError(null);

    const validation = validateTeamName(teamInput, teams, playerId);
    if (!validation.isValid) {
      setError(validation.errorMessage);
      return;
    }

    dispatch({
      type: 'TEAM_ASSIGNED',
      playerId,
      team: validation.sanitizedTeamName,
    });

    setTeamInput('');
  };

  const handleProceedToCompetition = () => {
    if (!complete) return;

    if (
      activeTournament.tournamentType === 'league' ||
      activeTournament.tournamentType === 'league_playoffs'
    ) {
      const matches = generateLeagueFixture(
        participantIds,
        activeTournament.matchFormat
      );
      dispatch({
        type: 'LEAGUE_GENERATED',
        matches,
      });
      if (onProceedToLeague) {
        onProceedToLeague();
      } else {
        onProceedToBracket();
      }
    } else if (activeTournament.tournamentType === 'group_stage') {
      const { groups, matches } = generateGroupsFixture(
        participantIds,
        activeTournament.matchFormat ?? 'single_match'
      );
      dispatch({
        type: 'GROUP_STAGE_GENERATED',
        groups,
        matches,
      });
      if (onProceedToGroupStage) {
        onProceedToGroupStage();
      } else {
        onProceedToBracket();
      }
    } else if (activeTournament.tournamentType === 'double_elimination') {
      const bracket = generateDoubleEliminationBracket(participantIds);
      dispatch({
        type: 'DOUBLE_ELIMINATION_GENERATED',
        bracket,
      });
      if (onProceedToDoubleElimination) {
        onProceedToDoubleElimination();
      } else {
        onProceedToBracket();
      }
    } else {
      // Shuffle participants and create asymmetric bracket (RF-17)
      const { series, byes, shuffledOrder } = generateBracket(participantIds);

      dispatch({
        type: 'BRACKET_GENERATED',
        series,
        byes,
        bracketOrder: shuffledOrder,
      });

      onProceedToBracket();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Panel
        title="Draft de Equipos"
        subtitle={theme ? `Temática: ${theme}` : 'Orden de selección'}
      >
        {/* Selector de Modo de Draft (T25) */}
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-sm border border-border bg-background/40 p-1.5">
          <button
            type="button"
            onClick={() => handleSwitchMode('manual')}
            className={`flex items-center justify-center gap-2 rounded-sm py-2 px-3 text-sm font-semibold transition ${
              draftMode === 'manual'
                ? 'border border-primary/50 bg-primary/20 text-primary shadow-[0_0_10px_rgba(74,222,128,0.15)]'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            }`}
          >
            <UserCheck className="h-4 w-4" /> Asignación Manual
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('auto')}
            className={`flex items-center justify-center gap-2 rounded-sm py-2 px-3 text-sm font-semibold transition ${
              draftMode === 'auto'
                ? 'border border-primary/50 bg-primary/20 text-primary shadow-[0_0_10px_rgba(74,222,128,0.15)]'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            }`}
          >
            <Shuffle className="h-4 w-4" /> Sorteo Automático
          </button>
        </div>

        {draftMode === 'manual' ? (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              Cada participante elige su equipo o personaje según el orden sorteado. No se pueden repetir equipos.
            </p>

            <ol className="space-y-3">
              {draftOrder.map((playerId, index) => {
                const player = playersMap.get(playerId);
                const assignedTeam = teams[playerId];
                const isCurrentTurn = currentDrafterId === playerId;
                const hasChosen = Boolean(
                  assignedTeam && assignedTeam.trim().length > 0
                );

                return (
                  <li
                    key={playerId}
                    className={`flex flex-col gap-3 rounded-sm border p-4 transition sm:flex-row sm:items-center ${
                      isCurrentTurn
                        ? 'border-accent bg-accent/10 glow-blue shadow-[0_0_15px_rgba(56,189,248,0.2)]'
                        : hasChosen
                          ? 'border-border bg-background/60'
                          : 'border-border/40 bg-background/20 opacity-60'
                    }`}
                  >
                    {/* Posición en el draft */}
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-10 w-12 items-center justify-center rounded-sm font-display font-black text-sm ${
                          index === 0
                            ? 'bg-accent text-accent-foreground glow-blue'
                            : isCurrentTurn
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-accent'
                        }`}
                      >
                        {index + 1}°
                      </span>

                      {/* Nombre del jugador */}
                      <span className="w-44 truncate text-lg font-semibold text-foreground">
                        {player ? formatPlayerName(player) : 'Jugador'}
                      </span>
                    </div>

                    {/* Formulario de equipo o visualización */}
                    <div className="flex-1">
                      {hasChosen ? (
                        <div className="flex items-center justify-between gap-2 rounded-sm border border-border/80 bg-field px-3 py-2 text-foreground">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary" />
                            <span className="font-semibold">{assignedTeam}</span>
                          </div>
                          <span className="flex items-center gap-1 font-display text-xs text-primary">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Elegido
                          </span>
                        </div>
                      ) : isCurrentTurn ? (
                        <form
                          onSubmit={(e) => handleConfirmTeam(e, playerId)}
                          className="flex flex-col gap-2 sm:flex-row"
                        >
                          <input
                            type="text"
                            autoFocus
                            placeholder="Escribí el equipo (ej. Boca, Milan)..."
                            value={teamInput}
                            onChange={(e) => {
                              setTeamInput(e.target.value);
                              if (error) setError(null);
                            }}
                            className={`flex-1 text-base ${inputClassName}`}
                          />
                          <SecondaryButton type="submit">
                            Elegir <ChevronRight className="h-3.5 w-3.5" />
                          </SecondaryButton>
                        </form>
                      ) : (
                        <span className="text-xs uppercase tracking-wider text-muted-foreground/80">
                          Esperando turno...
                        </span>
                      )}

                      {isCurrentTurn && error && (
                        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-destructive">
                          {error}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          /* Sorteo Automático (RF-52, RF-82) */
          <div>
            {isRevealing ? (
              /* Animación secuencial en vivo (RF-82) */
              <div className="space-y-5">
                {/* Banner de Suspenso en Vivo */}
                <div className="relative overflow-hidden rounded-sm border-2 border-accent bg-background/90 p-5 text-center shadow-[0_0_20px_rgba(56,189,248,0.25)] glow-blue">
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3 mb-3">
                    <div className="flex items-center gap-2 text-accent">
                      <Disc3 className="h-5 w-5 animate-spin" />
                      <span className="font-display text-sm font-black uppercase tracking-wider">
                        Sorteo en vivo ({Math.min(revealedIndex + 1, orderForReveal.length)} de {orderForReveal.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSkipReveal}
                      className="text-xs font-semibold text-muted-foreground hover:text-accent underline transition cursor-pointer"
                    >
                      Saltar animación
                    </button>
                  </div>

                  {revealedIndex < orderForReveal.length ? (
                    <div className="space-y-2 py-2">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        Sorteando equipo para
                      </p>
                      <p className="font-sans text-xl font-black text-foreground sm:text-2xl">
                        {playersMap.get(orderForReveal[revealedIndex])
                          ? formatPlayerName(playersMap.get(orderForReveal[revealedIndex])!)
                          : 'Participante'}
                      </p>
                      <div className="inline-flex items-center justify-center gap-2 rounded-sm border border-accent/60 bg-accent/10 px-5 py-2.5 font-display text-lg font-black uppercase text-accent glow-blue">
                        <Shield className="h-5 w-5 animate-pulse text-accent" />
                        <span>{shufflingName || 'Mezclando...'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 py-2 text-primary">
                      <p className="font-display text-lg font-black uppercase">
                        ¡Sorteo finalizado!
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Confirmando todos los equipos asignados...
                      </p>
                    </div>
                  )}
                </div>

                {/* Grid secuencial de participantes */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {orderForReveal.map((playerId, idx) => {
                    const player = playersMap.get(playerId);
                    const isRevealed = idx < revealedIndex;
                    const isCurrent = idx === revealedIndex;
                    const assignedTeam = stagedAssignments[playerId];

                    return (
                      <div
                        key={playerId}
                        className={`flex items-center justify-between rounded-sm border p-3.5 transition duration-300 ${
                          isRevealed
                            ? 'border-primary/60 bg-primary/10 shadow-[0_0_12px_rgba(74,222,128,0.15)]'
                            : isCurrent
                              ? 'border-accent bg-accent/15 glow-blue scale-[1.02] transition-transform'
                              : 'border-border/40 bg-background/30 opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-display text-xs text-muted-foreground w-6">
                            {idx + 1}°
                          </span>
                          <span className="font-semibold text-foreground">
                            {player ? formatPlayerName(player) : 'Jugador'}
                          </span>
                        </div>

                        {isRevealed ? (
                          <div className="flex items-center gap-2 rounded-sm border border-primary/50 bg-field px-2.5 py-1 text-sm text-foreground">
                            <Shield className="h-4 w-4 text-primary" />
                            <span className="font-bold text-primary">{assignedTeam}</span>
                          </div>
                        ) : isCurrent ? (
                          <span className="inline-flex items-center gap-1.5 font-display text-xs font-bold text-accent animate-pulse">
                            <Disc3 className="h-3.5 w-3.5 animate-spin" /> Revelando...
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60 italic font-mono">
                            ? Oculto
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : complete && !showAutoForm ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 rounded-sm border border-primary/40 bg-primary/10 p-4 text-primary sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold">
                        ¡Equipos sorteados y asignados exitosamente!
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Los equipos se mezclaron y asignaron aleatoriamente entre los participantes.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAutoForm(true)}
                    className="flex items-center gap-1.5 self-start rounded-sm border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/20 sm:self-auto"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Volver a sortear
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {participantIds.map((playerId) => {
                    const player = playersMap.get(playerId);
                    const assignedTeam = teams[playerId];
                    return (
                      <div
                        key={playerId}
                        className="flex items-center justify-between rounded-sm border border-border bg-background/50 p-3.5"
                      >
                        <span className="font-semibold text-foreground">
                          {player ? formatPlayerName(player) : 'Jugador'}
                        </span>
                        <div className="flex items-center gap-2 rounded-sm border border-border/80 bg-field px-2.5 py-1 text-sm text-foreground">
                          <Shield className="h-4 w-4 text-primary" />
                          <span className="font-bold">{assignedTeam}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <p className="mb-4 text-sm text-muted-foreground">
                  Cargá los {participantIds.length} equipos para sortearlos aleatoriamente entre los participantes. Ningún nombre puede estar vacío ni repetirse.
                </p>

                <form onSubmit={handleAutoAssign} className="space-y-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {participantIds.map((playerId, index) => {
                      const isDup = duplicateIndices.has(index);
                      return (
                        <div key={playerId} className="space-y-1.5">
                          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Equipo {index + 1}
                          </label>
                          <input
                            type="text"
                            placeholder={`Ej. Equipo ${index + 1} (ej. Boca, Milan)...`}
                            value={autoTeams[index] ?? ''}
                            onChange={(e) =>
                              handleAutoTeamChange(index, e.target.value)
                            }
                            className={`w-full text-base ${inputClassName} ${
                              isDup
                                ? '!border-destructive focus:!border-destructive'
                                : ''
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Feedback en vivo de validación */}
                  {autoError ? (
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{autoError}</span>
                    </div>
                  ) : hasDuplicates ? (
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>No puede haber nombres de equipos duplicados.</span>
                    </div>
                  ) : isAutoValid ? (
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>
                        ¡{participantIds.length} equipos listos para sortear!
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {emptyCount === 1
                        ? 'Falta completar 1 equipo.'
                        : `Faltan completar ${emptyCount} equipos.`}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    {complete && showAutoForm && (
                      <SecondaryButton
                        type="button"
                        onClick={() => setShowAutoForm(false)}
                      >
                        Cancelar
                      </SecondaryButton>
                    )}
                    <PrimaryButton type="submit" disabled={!isAutoValid}>
                      <Shuffle className="h-4 w-4" /> Sortear y asignar equipos
                    </PrimaryButton>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Botón de generar competencia */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 sm:flex-row">
          <div>
            {complete ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {activeTournament.tournamentType === 'league' ||
                activeTournament.tournamentType === 'league_playoffs'
                  ? '¡Todos los equipos fueron elegidos! Podés armar el fixture de la liga.'
                  : activeTournament.tournamentType === 'group_stage'
                    ? '¡Todos los equipos fueron elegidos! Podés sortear los grupos y armar el fixture.'
                    : '¡Todos los equipos fueron elegidos! Podés armar el cuadro de partidos.'}
              </p>
            ) : (
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Esperando a que todos los participantes confirmen su equipo...
              </p>
            )}
          </div>

          <PrimaryButton
            disabled={!complete || isRevealing}
            onClick={handleProceedToCompetition}
          >
            {activeTournament.tournamentType === 'league' ||
            activeTournament.tournamentType === 'league_playoffs' ? (
              <>
                Sortear fixture de liga <ListOrdered className="h-4 w-4" />
              </>
            ) : activeTournament.tournamentType === 'group_stage' ? (
              <>
                Sortear grupos y fixture <Layers className="h-4 w-4" />
              </>
            ) : (
              <>
                Sortear llaves <Trophy className="h-4 w-4" />
              </>
            )}
          </PrimaryButton>
        </div>
      </Panel>
    </div>
  );
}

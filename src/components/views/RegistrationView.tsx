import { useState, type FormEvent } from 'react';
import {
  ChevronRight,
  Plus,
  UserCheck,
  Users,
  AlertCircle,
  Trash2,
  Trophy,
  ListOrdered,
  Layers,
  LayoutGrid,
  GitFork,
  Dices,
} from 'lucide-react';
import {
  formatPlayerName,
  isDuplicatePlayer,
  validatePlayerInput,
} from '../../domain/players';
import type {
  MatchFormat,
  Player,
  PlayerId,
  TournamentType,
} from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';
import { inputClassName } from '../ui/input';
import { Panel } from '../ui/Panel';

interface RegistrationViewProps {
  onProceedToTheme: () => void;
}

export function RegistrationView({ onProceedToTheme }: RegistrationViewProps) {
  const { players, activeTournament } = useAppState();
  const dispatch = useAppDispatch();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Tournament and Match formats (RF-48, RF-49)
  const [tournamentType, setTournamentType] = useState<TournamentType>(() => {
    return activeTournament?.tournamentType ?? 'bracket';
  });
  const [matchFormat, setMatchFormat] = useState<MatchFormat>(() => {
    return activeTournament?.matchFormat ?? 'two_legged';
  });

  // Initial selection from active tournament or empty
  const [selectedIds, setSelectedIds] = useState<PlayerId[]>(() => {
    if (activeTournament) {
      return [...activeTournament.participantIds];
    }
    // Preselect up to 10 players if available
    return players.slice(0, 10).map((p) => p.id);
  });

  const count = selectedIds.length;

  // Qualifying spots for league_playoffs (RF-68, RF-86)
  const [qualifyingSpots, setQualifyingSpots] = useState<number>(() => {
    return (
      activeTournament?.qualifyingSpots ??
      (count <= 5 ? 2 : count <= 9 ? 4 : 8)
    );
  });

  // Guard (RF-45): If tournament is already in an active competitive phase, locked against changing participants
  const isLocked =
    activeTournament !== null &&
    (activeTournament.phase === 'draft' ||
      activeTournament.phase === 'bracket' ||
      activeTournament.phase === 'league' ||
      activeTournament.phase === 'group_stage' ||
      activeTournament.phase === 'group_playoffs' ||
      activeTournament.phase === 'league_playoffs' ||
      activeTournament.phase === 'double_elimination');

  const isValidCount =
    tournamentType === 'group_stage'
      ? count === 6 || count === 9
      : count >= 4 && count <= 10;

  const handleRandomizeFormat = () => {
    if (isLocked) return;
    const validFormats: TournamentType[] =
      count === 6 || count === 9
        ? ['bracket', 'league', 'group_stage', 'league_playoffs', 'double_elimination']
        : ['bracket', 'league', 'league_playoffs', 'double_elimination'];

    const pool = validFormats.filter((f) => f !== tournamentType);
    const options = pool.length > 0 ? pool : validFormats;
    const picked = options[Math.floor(Math.random() * options.length)]!;
    setTournamentType(picked);
  };

  const handleAddPlayer = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validatePlayerInput(firstName, lastName);
    if (!validation.isValid) {
      setError(validation.errorMessage);
      return;
    }

    const candidate = {
      firstName: validation.sanitizedFirstName,
      lastName: validation.sanitizedLastName,
    };

    if (isDuplicatePlayer(candidate, players)) {
      setError('Ya existe un jugador registrado con ese nombre y apellido.');
      return;
    }

    const newPlayer: Player = {
      id: crypto.randomUUID(),
      firstName: validation.sanitizedFirstName,
      lastName: validation.sanitizedLastName,
      createdAt: new Date().toISOString(),
    };

    dispatch({ type: 'PLAYER_ADDED', player: newPlayer });

    // Auto-select if under 10 and not locked
    if (!isLocked && selectedIds.length < 10) {
      setSelectedIds((prev) => [...prev, newPlayer.id]);
    }

    setFirstName('');
    setLastName('');
  };

  const handleDeletePlayer = (playerId: PlayerId, fullName: string) => {
    if (
      activeTournament &&
      isLocked &&
      activeTournament.participantIds.includes(playerId)
    ) {
      alert('No podés eliminar a un jugador que está participando en un torneo en curso.');
      return;
    }

    const confirmed = window.confirm(
      `¿Seguro que querés eliminar a ${fullName} del registro? Se borrarán también sus estadísticas acumuladas.`
    );
    if (confirmed) {
      dispatch({ type: 'PLAYER_REMOVED', playerId });
      setSelectedIds((prev) => prev.filter((id) => id !== playerId));
    }
  };

  const handleToggleParticipant = (playerId: PlayerId) => {
    if (isLocked) return;

    setSelectedIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleContinue = () => {
    if (!isValidCount) return;

    if (isLocked) {
      // Just advance to the active phase
      onProceedToTheme();
      return;
    }

    const tournamentId = activeTournament?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    dispatch({
      type: 'PARTICIPANTS_SET',
      participantIds: selectedIds,
      tournamentType,
      matchFormat,
      qualifyingSpots:
        tournamentType === 'league_playoffs'
          ? Math.min(Math.max(qualifyingSpots, 2), count)
          : undefined,
      tournamentId,
      now,
    });

    onProceedToTheme();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {isLocked && (
        <div className="flex items-center gap-3 rounded-sm border border-accent/60 bg-secondary/80 p-4 text-sm text-foreground">
          <AlertCircle className="h-5 w-5 shrink-0 text-accent" />
          <p>
            Hay un torneo en curso. No podés cambiar los participantes ni las modalidades mientras el torneo esté en fase activa (Draft, Llaves, Liga o Grupos).
          </p>
        </div>
      )}

      {/* 1. Formulario de carga de jugadores */}
      <Panel
        title="Cargar Nuevo Jugador"
        subtitle="Nombre y Apellido obligatorios"
      >
        <form onSubmit={handleAddPlayer} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Nombre
              </label>
              <input
                type="text"
                maxLength={30}
                placeholder="Ej. Marco"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  if (error) setError(null);
                }}
                className={`w-full text-base ${inputClassName}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Apellido
              </label>
              <input
                type="text"
                maxLength={30}
                placeholder="Ej. Barzola"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  if (error) setError(null);
                }}
                className={`w-full text-base ${inputClassName}`}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <SecondaryButton type="submit">
              <Plus className="h-4 w-4" /> Registrar Jugador
            </SecondaryButton>
          </div>
        </form>
      </Panel>

      {/* 2. Modalidades del Torneo (RF-48, RF-49) */}
      <Panel
        title="Formato de Competencia"
        subtitle="Configurá la modalidad del torneo y de los partidos"
      >
        <div className="space-y-5">
          {/* Selector Modalidad de Torneo (RF-48) */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Modalidad de Torneo (RF-48)
              </label>
              <button
                type="button"
                disabled={isLocked}
                onClick={handleRandomizeFormat}
                className="inline-flex items-center gap-1.5 rounded-sm border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-accent transition hover:border-accent hover:bg-accent/20 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                title="Sortear formato al azar"
              >
                <Dices className="h-3.5 w-3.5 text-accent" />
                Sortear Formato
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setTournamentType('bracket')}
                className={`flex flex-col items-start gap-1.5 rounded-sm border p-3.5 text-left transition ${
                  tournamentType === 'bracket'
                    ? 'border-primary/80 bg-primary/10 shadow-[0_0_12px_rgba(74,222,128,0.15)] ring-1 ring-primary'
                    : 'border-border bg-background/50 hover:border-accent hover:bg-background/80'
                } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2">
                  <Trophy
                    className={`h-4 w-4 ${
                      tournamentType === 'bracket'
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    }`}
                  />
                  <span className="font-display text-sm font-bold tracking-wider text-foreground">
                    Llaves (Bracket asimétrico)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Eliminación directa con Byes para los primeros sembrados y definición por 3er puesto.
                </p>
              </button>

              <button
                type="button"
                disabled={isLocked}
                onClick={() => setTournamentType('league')}
                className={`flex flex-col items-start gap-1.5 rounded-sm border p-3.5 text-left transition ${
                  tournamentType === 'league'
                    ? 'border-primary/80 bg-primary/10 shadow-[0_0_12px_rgba(74,222,128,0.15)] ring-1 ring-primary'
                    : 'border-border bg-background/50 hover:border-accent hover:bg-background/80'
                } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2">
                  <ListOrdered
                    className={`h-4 w-4 ${
                      tournamentType === 'league'
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    }`}
                  />
                  <span className="font-display text-sm font-bold tracking-wider text-foreground">
                    Liga (Todos contra todos)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fixture Round Robin completo. Todos juegan contra todos con tabla de posiciones interna en vivo.
                </p>
              </button>

              <button
                type="button"
                disabled={isLocked}
                onClick={() => setTournamentType('group_stage')}
                className={`flex flex-col items-start gap-1.5 rounded-sm border p-3.5 text-left transition ${
                  tournamentType === 'group_stage'
                    ? 'border-primary/80 bg-primary/10 shadow-[0_0_12px_rgba(74,222,128,0.15)] ring-1 ring-primary'
                    : 'border-border bg-background/50 hover:border-accent hover:bg-background/80'
                } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2">
                  <Layers
                    className={`h-4 w-4 ${
                      tournamentType === 'group_stage'
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    }`}
                  />
                  <span className="font-display text-sm font-bold tracking-wider text-foreground">
                    Fase de Grupos + Playoffs
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Grupos de 3 jugadores (6 o 9 participantes obligatorios) y definición final en llaves de Semifinales.
                </p>
              </button>

              <button
                type="button"
                disabled={isLocked}
                onClick={() => setTournamentType('league_playoffs')}
                className={`flex flex-col items-start gap-1.5 rounded-sm border p-3.5 text-left transition ${
                  tournamentType === 'league_playoffs'
                    ? 'border-primary/80 bg-primary/10 shadow-[0_0_12px_rgba(74,222,128,0.15)] ring-1 ring-primary'
                    : 'border-border bg-background/50 hover:border-accent hover:bg-background/80'
                } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid
                    className={`h-4 w-4 ${
                      tournamentType === 'league_playoffs'
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    }`}
                  />
                  <span className="font-display text-sm font-bold tracking-wider text-foreground">
                    Liga + Reducido
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fase regular Round Robin con corte dinámico de clasificados y Playoffs eliminatorios al título.
                </p>
              </button>

              <button
                type="button"
                disabled={isLocked}
                onClick={() => setTournamentType('double_elimination')}
                className={`flex flex-col items-start gap-1.5 rounded-sm border p-3.5 text-left transition ${
                  tournamentType === 'double_elimination'
                    ? 'border-primary/80 bg-primary/10 shadow-[0_0_12px_rgba(74,222,128,0.15)] ring-1 ring-primary'
                    : 'border-border bg-background/50 hover:border-accent hover:bg-background/80'
                } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2">
                  <GitFork
                    className={`h-4 w-4 ${
                      tournamentType === 'double_elimination'
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    }`}
                  />
                  <span className="font-display text-sm font-bold tracking-wider text-foreground">
                    Doble Eliminación (Winner & Loser)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Winner y Loser brackets con Byes asimétricos y Grand Final Reset si el finalista de perdedores gana la serie 1.
                </p>
              </button>
            </div>

            {tournamentType === 'league_playoffs' && (
              <div className="mt-3 rounded-sm border border-primary/40 bg-primary/10 p-3.5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label
                      htmlFor="qualifying-spots-input"
                      className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5"
                    >
                      <LayoutGrid className="h-4 w-4" />
                      Clasificados al Reducido (Bracket Final)
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Definí cuántos jugadores avanzan a las llaves eliminatorias por el título (mínimo 2, máximo {count}).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      id="qualifying-spots-select"
                      disabled={isLocked}
                      value={Math.min(Math.max(qualifyingSpots, 2), Math.max(2, count))}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          setQualifyingSpots(val);
                        }
                      }}
                      className="rounded-sm border border-border bg-background px-3 py-2 text-sm font-mono font-bold text-foreground transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
                    >
                      {Array.from(
                        { length: Math.max(0, count - 1) },
                        (_, i) => i + 2
                      ).map((num) => (
                        <option key={num} value={num}>
                          {num} clasificados
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Selector Modalidad de Partido (RF-49, RF-59) */}
          <div className="border-t border-border/50 pt-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Modalidad de Partido ({tournamentType === 'bracket' || tournamentType === 'double_elimination' ? 'Llaves' : tournamentType === 'group_stage' ? 'Fase de Grupos' : 'Liga'})
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setMatchFormat('two_legged')}
                className={`flex flex-col items-start gap-1.5 rounded-sm border p-3.5 text-left transition ${
                  matchFormat === 'two_legged'
                    ? 'border-primary/80 bg-primary/10 shadow-[0_0_12px_rgba(74,222,128,0.15)] ring-1 ring-primary'
                    : 'border-border bg-background/50 hover:border-accent hover:bg-background/80'
                } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <span className="font-display text-sm font-bold tracking-wider text-foreground">
                  {tournamentType === 'bracket'
                    ? 'Ida y Vuelta (Clásico)'
                    : 'Ida y Vuelta (Doble Rueda)'}
                </span>
                <p className="text-xs text-muted-foreground">
                  {tournamentType === 'bracket'
                    ? 'Dos partidos por serie. Global con definición por penales si hay igualdad.'
                    : 'Se juegan partidos de ida y vuelta invirtiendo las localías.'}
                </p>
              </button>

              <button
                type="button"
                disabled={isLocked}
                onClick={() => setMatchFormat('single_match')}
                className={`flex flex-col items-start gap-1.5 rounded-sm border p-3.5 text-left transition ${
                  matchFormat === 'single_match'
                    ? 'border-primary/80 bg-primary/10 shadow-[0_0_12px_rgba(74,222,128,0.15)] ring-1 ring-primary'
                    : 'border-border bg-background/50 hover:border-accent hover:bg-background/80'
                } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <span className="font-display text-sm font-bold tracking-wider text-foreground">
                  {tournamentType === 'bracket'
                    ? 'Partido Único (Rápido)'
                    : 'Partido Único (Una Rueda)'}
                </span>
                <p className="text-xs text-muted-foreground">
                  {tournamentType === 'bracket'
                    ? 'Un solo partido por serie a 90 min con penales directos en caso de empate.'
                    : 'Rueda simple. Todos juegan una vez contra cada rival.'}
                </p>
              </button>
            </div>
          </div>
        </div>
      </Panel>

      {/* 3. Lista de jugadores registrados y selección de participantes */}
      <Panel
        title="Selección de Participantes"
        subtitle={`${count}/10 seleccionados`}
      >
        {players.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-8 text-center text-muted-foreground">
            <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="font-semibold text-foreground">
              Todavía no hay jugadores registrados en la base local.
            </p>
            <p className="mt-1 text-xs">
              Cargá arriba a tus amigos para armar el torneo de PES 6.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {players.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              const isParticipantInActive =
                isLocked &&
                activeTournament !== null &&
                activeTournament.participantIds.includes(p.id);

              return (
                <li
                  key={p.id}
                  onClick={() => handleToggleParticipant(p.id)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-sm border p-3 transition ${
                    isSelected
                      ? 'border-primary/80 bg-primary/10 shadow-[0_0_12px_rgba(74,222,128,0.15)]'
                      : 'border-border bg-background/50 hover:border-accent hover:bg-background/80'
                  } ${isLocked ? 'cursor-not-allowed opacity-80' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isLocked}
                      onChange={() => handleToggleParticipant(p.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="font-semibold text-foreground">
                      {formatPlayerName(p)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {isSelected && (
                      <span className="flex items-center gap-1 font-display text-xs font-bold uppercase tracking-wider text-primary">
                        <UserCheck className="h-3.5 w-3.5" /> En torneo
                      </span>
                    )}

                    <button
                      type="button"
                      disabled={isParticipantInActive}
                      title={
                        isParticipantInActive
                          ? 'No podés eliminar a un participante de un torneo en curso'
                          : 'Eliminar jugador'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlayer(p.id, `${p.firstName} ${p.lastName}`);
                      }}
                      className="rounded-sm p-1.5 text-muted-foreground/50 transition hover:bg-destructive/20 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}


        {/* 3. Indicador de faltantes / sobrantes y botón de continuar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 sm:flex-row">
          <div>
            {tournamentType === 'group_stage' ? (
              isValidCount ? (
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  ¡Cantidad exacta! {count} jugadores divididos en {count / 3} grupos de 3.
                </p>
              ) : (
                <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                  La Fase de Grupos requiere exactamente 6 o 9 participantes (actualmente: {count}).
                </p>
              )
            ) : (
              <>
                {count < 4 && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                    Faltan {4 - count} participante{4 - count === 1 ? '' : 's'} para alcanzar el mínimo de 4.
                  </p>
                )}
                {count > 10 && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                    Sobran {count - 10} participante{count - 10 === 1 ? '' : 's'}. El máximo permitido son 10.
                  </p>
                )}
                {isValidCount && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    ¡Cantidad justa! {count} jugadores listos para competir.
                  </p>
                )}
              </>
            )}
          </div>

          <PrimaryButton
            disabled={!isValidCount}
            onClick={handleContinue}
          >
            Continuar a Temática <ChevronRight className="h-4 w-4" />
          </PrimaryButton>
        </div>
      </Panel>
    </div>
  );
}

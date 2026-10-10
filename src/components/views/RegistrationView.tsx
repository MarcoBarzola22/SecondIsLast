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

  // Guard (RF-45): If tournament is already in Draft, Bracket or League, locked against changing participants
  const isLocked =
    activeTournament !== null &&
    (activeTournament.phase === 'draft' ||
      activeTournament.phase === 'bracket' ||
      activeTournament.phase === 'league');

  const count = selectedIds.length;
  const isValidCount = count >= 4 && count <= 10;

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
      (activeTournament.phase === 'draft' ||
        activeTournament.phase === 'bracket' ||
        activeTournament.phase === 'league') &&
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
            Hay un torneo en curso. No podés cambiar los participantes ni las modalidades mientras el torneo esté en fase de Draft, Llaves o Liga.
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
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Modalidad de Torneo (RF-48)
            </label>
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
            </div>
          </div>

          {/* Selector Modalidad de Partido (RF-49, RF-59: Visible para Llaves y Liga) */}
          <div className="border-t border-border/50 pt-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Modalidad de Partido ({tournamentType === 'league' ? 'Liga' : 'Llaves'})
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
                  {tournamentType === 'league'
                    ? 'Ida y Vuelta (Doble Rueda)'
                    : 'Ida y Vuelta (Clásico)'}
                </span>
                <p className="text-xs text-muted-foreground">
                  {tournamentType === 'league'
                    ? 'Doble Round Robin. Se juegan partidos de ida y vuelta invirtiendo localías.'
                    : 'Dos partidos por serie. Global con definición por penales si hay igualdad.'}
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
                  {tournamentType === 'league'
                    ? 'Partido Único (Una Rueda)'
                    : 'Partido Único (Rápido)'}
                </span>
                <p className="text-xs text-muted-foreground">
                  {tournamentType === 'league'
                    ? 'Round Robin simple. Todos juegan una vez contra cada rival.'
                    : 'Un solo partido por serie a 90 min con penales directos en caso de empate.'}
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

import { useState, type FormEvent } from 'react';
import { ChevronRight, Plus, UserCheck, Users, AlertCircle } from 'lucide-react';
import {
  formatPlayerName,
  isDuplicatePlayer,
  validatePlayerInput,
} from '../../domain/players';
import type { Player, PlayerId } from '../../domain/types';
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

  // Initial selection from active tournament or empty
  const [selectedIds, setSelectedIds] = useState<PlayerId[]>(() => {
    if (activeTournament) {
      return [...activeTournament.participantIds];
    }
    // Preselect up to 6 players if available
    return players.slice(0, 6).map((p) => p.id);
  });

  // Guard (RF-45): If tournament is already in Draft or Bracket, locked against changing participants
  const isLocked =
    activeTournament !== null &&
    (activeTournament.phase === 'draft' || activeTournament.phase === 'bracket');

  const count = selectedIds.length;
  const isValidCount = count >= 4 && count <= 6;

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

    // Auto-select if under 6 and not locked
    if (!isLocked && selectedIds.length < 6) {
      setSelectedIds((prev) => [...prev, newPlayer.id]);
    }

    setFirstName('');
    setLastName('');
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
            Hay un torneo en curso. No podés cambiar los participantes mientras el torneo esté en fase de Draft o Llaves.
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

      {/* 2. Lista de jugadores registrados y selección de participantes */}
      <Panel
        title="Selección de Participantes"
        subtitle={`${count}/6 seleccionados`}
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

                  {isSelected && (
                    <span className="flex items-center gap-1 font-display text-xs font-bold uppercase tracking-wider text-primary">
                      <UserCheck className="h-3.5 w-3.5" /> En torneo
                    </span>
                  )}
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
            {count > 6 && (
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                Sobran {count - 6} participante{count - 6 === 1 ? '' : 's'}. El máximo permitido son 6.
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

import { useState, type FormEvent } from 'react';
import { CheckCircle2, ChevronRight, Shield, Trophy } from 'lucide-react';
import { generateBracket } from '../../domain/bracket';
import {
  getCurrentDrafter,
  isDraftComplete,
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
}

export function DraftView({ onProceedToBracket }: DraftViewProps) {
  const { activeTournament, players } = useAppState();
  const dispatch = useAppDispatch();

  const [teamInput, setTeamInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!activeTournament) {
    return null;
  }

  const { theme, draftOrder, teams, participantIds } = activeTournament;
  const playersMap = new Map(players.map((p) => [p.id, p]));

  const currentDrafterId = getCurrentDrafter(draftOrder, teams);
  const complete = isDraftComplete(participantIds, teams);

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

  const handleGenerateBracket = () => {
    if (!complete) return;

    // Shuffle participants and create asymmetric bracket (RF-17)
    const { series, byes } = generateBracket(participantIds);

    dispatch({
      type: 'BRACKET_GENERATED',
      series,
      byes,
    });

    onProceedToBracket();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Panel
        title="Draft de Equipos"
        subtitle={theme ? `Temática: ${theme}` : 'Orden de selección'}
      >
        <p className="mb-6 text-sm text-muted-foreground">
          Cada participante elige su equipo o personaje según el orden sorteado. No se pueden repetir equipos.
        </p>

        <ol className="space-y-3">
          {draftOrder.map((playerId, index) => {
            const player = playersMap.get(playerId);
            const assignedTeam = teams[playerId];
            const isCurrentTurn = currentDrafterId === playerId;
            const hasChosen = Boolean(assignedTeam && assignedTeam.trim().length > 0);

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

        {/* Botón de generar llaves */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 sm:flex-row">
          <div>
            {complete ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                ¡Todos los equipos fueron elegidos! Podés armar el cuadro de partidos.
              </p>
            ) : (
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Esperando a que todos los participantes confirmen su equipo...
              </p>
            )}
          </div>

          <PrimaryButton
            disabled={!complete}
            onClick={handleGenerateBracket}
          >
            Sortear llaves <Trophy className="h-4 w-4" />
          </PrimaryButton>
        </div>
      </Panel>
    </div>
  );
}

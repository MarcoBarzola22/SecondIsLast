import { CheckCircle, RotateCcw, Trophy } from 'lucide-react';
import { formatPlayerName } from '../../domain/players';
import type { LeagueMatch, Player, PlayerId } from '../../domain/types';
import { useAppDispatch } from '../../state/AppContext';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';

interface LeagueMatchCardProps {
  match: LeagueMatch;
  playersMap: Map<PlayerId, Player>;
  teams: Record<PlayerId, string>;
  label?: string;
}

export function LeagueMatchCard({
  match,
  playersMap,
  teams,
  label,
}: LeagueMatchCardProps) {
  const dispatch = useAppDispatch();

  const playerA = playersMap.get(match.playerA);
  const playerB = playersMap.get(match.playerB);

  const nameA = playerA ? formatPlayerName(playerA) : 'Jugador A';
  const nameB = playerB ? formatPlayerName(playerB) : 'Jugador B';

  const teamA = teams[match.playerA] || 'Sin equipo';
  const teamB = teams[match.playerB] || 'Sin equipo';

  const isConfirmed = match.confirmed;
  const isComplete = match.scoreA !== null && match.scoreB !== null;

  const isWinnerA = isConfirmed && isComplete && match.scoreA! > match.scoreB!;
  const isWinnerB = isConfirmed && isComplete && match.scoreB! > match.scoreA!;
  const isDraw = isConfirmed && isComplete && match.scoreA! === match.scoreB!;

  const handleScoreChange = (side: 'a' | 'b', valueStr: string) => {
    if (isConfirmed) return;
    const trimmed = valueStr.trim();
    if (trimmed === '') {
      dispatch({
        type: 'LEAGUE_MATCH_SCORE_SET',
        matchId: match.id,
        scoreA: side === 'a' ? null : match.scoreA,
        scoreB: side === 'b' ? null : match.scoreB,
      });
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99) {
      dispatch({
        type: 'LEAGUE_MATCH_SCORE_SET',
        matchId: match.id,
        scoreA: side === 'a' ? parsed : match.scoreA,
        scoreB: side === 'b' ? parsed : match.scoreB,
      });
    }
  };

  const handleConfirm = () => {
    if (!isComplete) return;
    dispatch({
      type: 'LEAGUE_MATCH_CONFIRMED',
      matchId: match.id,
    });
  };

  const handleReopen = () => {
    dispatch({
      type: 'LEAGUE_MATCH_EDIT_REQUESTED',
      matchId: match.id,
    });
  };

  return (
    <div
      className={`overflow-hidden rounded-md border transition ${
        isConfirmed
          ? 'border-border/80 bg-card/90'
          : 'border-accent/70 bg-card shadow-[0_0_15px_rgba(56,189,248,0.15)]'
      }`}
    >
      {/* Header del partido */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-3 py-1.5">
        <span className="font-display text-[11px] font-bold uppercase tracking-widest text-accent">
          {label ?? `Partido ${match.id}`}
        </span>
        {isConfirmed ? (
          <span className="flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-wider text-primary">
            <CheckCircle className="h-3 w-3" /> Confirmado
          </span>
        ) : (
          <span className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
            En juego
          </span>
        )}
      </div>

      {/* Participante A (Local) */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 transition ${
          isWinnerA ? 'bg-primary/15' : 'bg-background/40'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-semibold ${
              isWinnerA ? 'text-primary' : 'text-foreground'
            }`}
          >
            {nameA}
          </p>
          <p className="truncate text-xs text-muted-foreground">{teamA}</p>
        </div>
        {isWinnerA && <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />}
      </div>

      {/* Inputs de goles */}
      <div className="border-y border-border bg-background/60 p-2.5">
        <div className="flex items-center justify-center gap-2">
          <input
            type="number"
            min={0}
            max={99}
            disabled={isConfirmed}
            value={match.scoreA ?? ''}
            onChange={(e) => handleScoreChange('a', e.target.value)}
            placeholder="0"
            className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
            title={`Goles de ${nameA}`}
          />
          <span className="font-display text-base font-bold text-muted-foreground">-</span>
          <input
            type="number"
            min={0}
            max={99}
            disabled={isConfirmed}
            value={match.scoreB ?? ''}
            onChange={(e) => handleScoreChange('b', e.target.value)}
            placeholder="0"
            className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
            title={`Goles de ${nameB}`}
          />
        </div>
        {isDraw && (
          <p className="mt-1 text-center font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Empate (1 PT c/u)
          </p>
        )}
      </div>

      {/* Participante B (Visitante) */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 transition ${
          isWinnerB ? 'bg-primary/15' : 'bg-background/40'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-semibold ${
              isWinnerB ? 'text-primary' : 'text-foreground'
            }`}
          >
            {nameB}
          </p>
          <p className="truncate text-xs text-muted-foreground">{teamB}</p>
        </div>
        {isWinnerB && <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />}
      </div>

      {/* Botón de acción */}
      <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/30 px-3 py-1.5">
        {!isConfirmed ? (
          <PrimaryButton
            disabled={!isComplete}
            onClick={handleConfirm}
            className="py-1 px-3 text-xs"
          >
            Confirmar
          </PrimaryButton>
        ) : (
          <SecondaryButton
            onClick={handleReopen}
            className="py-1 px-2.5 text-[11px]"
            title="Corregir el resultado de este partido"
          >
            <RotateCcw className="h-3 w-3" /> Corregir
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}

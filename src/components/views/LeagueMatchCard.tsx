import { AlertTriangle, CheckCircle, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { formatPlayerName } from '../../domain/players';
import type { MatchScenarioGuidance } from '../../domain/scenarios';
import type { LeagueMatch, Player, PlayerId } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';

interface LeagueMatchCardProps {
  match: LeagueMatch;
  playersMap: Map<PlayerId, Player>;
  teams: Record<PlayerId, string>;
  label?: string;
  isGroupMatch?: boolean;
  scenarioGuidance?: MatchScenarioGuidance | null;
}

export function LeagueMatchCard({
  match,
  playersMap,
  teams,
  label,
  isGroupMatch,
  scenarioGuidance,
}: LeagueMatchCardProps) {
  const { activeTournament } = useAppState();
  const dispatch = useAppDispatch();

  const walkoverPlayerIds = activeTournament?.walkoverPlayerIds ?? [];
  const isWalkoverA = walkoverPlayerIds.includes(match.playerA);
  const isWalkoverB = walkoverPlayerIds.includes(match.playerB);
  const isWalkover = isWalkoverA || isWalkoverB;

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
    if (isConfirmed || isWalkover) return;
    const trimmed = valueStr.trim();
    if (trimmed === '') {
      dispatch(
        isGroupMatch
          ? {
              type: 'GROUP_MATCH_SCORE_SET',
              matchId: match.id,
              scoreA: side === 'a' ? null : match.scoreA,
              scoreB: side === 'b' ? null : match.scoreB,
              cardsA: match.cardsA,
              cardsB: match.cardsB,
            }
          : {
              type: 'LEAGUE_MATCH_SCORE_SET',
              matchId: match.id,
              scoreA: side === 'a' ? null : match.scoreA,
              scoreB: side === 'b' ? null : match.scoreB,
              cardsA: match.cardsA,
              cardsB: match.cardsB,
            }
      );
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99) {
      dispatch(
        isGroupMatch
          ? {
              type: 'GROUP_MATCH_SCORE_SET',
              matchId: match.id,
              scoreA: side === 'a' ? parsed : match.scoreA,
              scoreB: side === 'b' ? parsed : match.scoreB,
              cardsA: match.cardsA,
              cardsB: match.cardsB,
            }
          : {
              type: 'LEAGUE_MATCH_SCORE_SET',
              matchId: match.id,
              scoreA: side === 'a' ? parsed : match.scoreA,
              scoreB: side === 'b' ? parsed : match.scoreB,
              cardsA: match.cardsA,
              cardsB: match.cardsB,
            }
      );
    }
  };

  const handleCardChange = (
    side: 'a' | 'b',
    cardType: 'yellow' | 'red',
    valueStr: string
  ) => {
    if (isConfirmed || isWalkover) return;
    const currentCards =
      (side === 'a' ? match.cardsA : match.cardsB) ?? { yellow: 0, red: 0 };
    const trimmed = valueStr.trim();
    if (trimmed === '') {
      const updatedCards = {
        ...currentCards,
        [cardType]: 0,
      };
      dispatch(
        isGroupMatch
          ? {
              type: 'GROUP_MATCH_SCORE_SET',
              matchId: match.id,
              scoreA: match.scoreA,
              scoreB: match.scoreB,
              cardsA: side === 'a' ? updatedCards : match.cardsA,
              cardsB: side === 'b' ? updatedCards : match.cardsB,
            }
          : {
              type: 'LEAGUE_MATCH_SCORE_SET',
              matchId: match.id,
              scoreA: match.scoreA,
              scoreB: match.scoreB,
              cardsA: side === 'a' ? updatedCards : match.cardsA,
              cardsB: side === 'b' ? updatedCards : match.cardsB,
            }
      );
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99) {
      const updatedCards = {
        ...currentCards,
        [cardType]: parsed,
      };
      dispatch(
        isGroupMatch
          ? {
              type: 'GROUP_MATCH_SCORE_SET',
              matchId: match.id,
              scoreA: match.scoreA,
              scoreB: match.scoreB,
              cardsA: side === 'a' ? updatedCards : match.cardsA,
              cardsB: side === 'b' ? updatedCards : match.cardsB,
            }
          : {
              type: 'LEAGUE_MATCH_SCORE_SET',
              matchId: match.id,
              scoreA: match.scoreA,
              scoreB: match.scoreB,
              cardsA: side === 'a' ? updatedCards : match.cardsA,
              cardsB: side === 'b' ? updatedCards : match.cardsB,
            }
      );
    }
  };

  const handleConfirm = () => {
    if (!isComplete || isWalkover) return;
    dispatch(
      isGroupMatch
        ? {
            type: 'GROUP_MATCH_CONFIRMED',
            matchId: match.id,
          }
        : {
            type: 'LEAGUE_MATCH_CONFIRMED',
            matchId: match.id,
          }
    );
  };

  const handleReopen = () => {
    if (isWalkover) return;
    dispatch(
      isGroupMatch
        ? {
            type: 'GROUP_MATCH_EDIT_REQUESTED',
            matchId: match.id,
          }
        : {
            type: 'LEAGUE_MATCH_EDIT_REQUESTED',
            matchId: match.id,
          }
    );
  };

  return (
    <div
      className={`overflow-hidden rounded-md border transition ${
        isWalkover
          ? 'border-destructive/40 bg-card/80 opacity-90'
          : isConfirmed
            ? 'border-border/80 bg-card/90'
            : 'border-accent/70 bg-card shadow-[0_0_15px_rgba(56,189,248,0.15)]'
      }`}
    >
      {/* Header del partido */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-3 py-1.5">
        <span className="font-display text-[11px] font-bold uppercase tracking-widest text-accent">
          {label ?? `Partido ${match.id}`}
        </span>
        {isWalkover ? (
          <span className="flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-wider text-destructive">
            <AlertTriangle className="h-3 w-3" /> W.O. (Abandono)
          </span>
        ) : isConfirmed ? (
          <span className="flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-wider text-primary">
            <CheckCircle className="h-3 w-3" /> Confirmado
          </span>
        ) : (
          <span className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
            En juego
          </span>
        )}
      </div>

      {/* Banner de Escenarios Predictivos en Fechas Finales (RF-75) */}
      {scenarioGuidance &&
        !isConfirmed &&
        !isWalkover &&
        (scenarioGuidance.guidanceA || scenarioGuidance.guidanceB) && (
          <div className="border-b border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-xs shadow-inner">
            <div className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
              <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
              Escenario de Clasificación
            </div>
            <div className="space-y-1 font-sans text-[11px] leading-tight">
              {scenarioGuidance.guidanceA && (
                <div className="flex items-start gap-1.5">
                  <span className="font-semibold text-foreground shrink-0">
                    {nameA}:
                  </span>
                  <span className="text-emerald-300">
                    {scenarioGuidance.guidanceA}
                  </span>
                </div>
              )}
              {scenarioGuidance.guidanceB && (
                <div className="flex items-start gap-1.5">
                  <span className="font-semibold text-foreground shrink-0">
                    {nameB}:
                  </span>
                  <span className="text-emerald-300">
                    {scenarioGuidance.guidanceB}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Participante A (Local) */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 transition ${
          isWalkoverA
            ? 'bg-destructive/10'
            : isWinnerA
              ? 'bg-primary/15'
              : 'bg-background/40'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={`truncate text-sm font-semibold ${
                isWalkoverA
                  ? 'text-destructive line-through'
                  : isWinnerA
                    ? 'text-primary'
                    : 'text-foreground'
              }`}
            >
              {nameA}
            </p>
            {isWalkoverA && (
              <span className="rounded bg-destructive/20 border border-destructive/50 px-1 py-0.2 text-[9px] font-black uppercase text-destructive">
                W.O.
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{teamA}</p>
        </div>
        {isWinnerA && <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />}
      </div>

      {/* Inputs de goles y tarjetas */}
      <div className="border-y border-border bg-background/60 p-2.5 space-y-2">
        <div className="flex items-center justify-center gap-2">
          <input
            type="number"
            min={0}
            max={99}
            disabled={isConfirmed || isWalkover}
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
            disabled={isConfirmed || isWalkover}
            value={match.scoreB ?? ''}
            onChange={(e) => handleScoreChange('b', e.target.value)}
            placeholder="0"
            className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
            title={`Goles de ${nameB}`}
          />
        </div>

        {/* Inputs de Tarjetas (Fair Play) */}
        <div className="flex items-center justify-between gap-1 rounded bg-background/50 px-2 py-1.5 border border-border/40 text-[11px]">
          {/* Tarjetas Jugador A */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1" title={`Tarjetas amarillas de ${nameA}`}>
              <span className="inline-block h-3 w-2 rounded-[1px] bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]" />
              <input
                type="number"
                min={0}
                max={99}
                disabled={isConfirmed || isWalkover}
                value={match.cardsA?.yellow ?? ''}
                onChange={(e) => handleCardChange('a', 'yellow', e.target.value)}
                placeholder="0"
                className="h-6 w-8 rounded-sm border border-field-border bg-field text-center font-mono text-xs font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
              />
            </div>
            <div className="flex items-center gap-1" title={`Tarjetas rojas de ${nameA}`}>
              <span className="inline-block h-3 w-2 rounded-[1px] bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]" />
              <input
                type="number"
                min={0}
                max={99}
                disabled={isConfirmed || isWalkover}
                value={match.cardsA?.red ?? ''}
                onChange={(e) => handleCardChange('a', 'red', e.target.value)}
                placeholder="0"
                className="h-6 w-8 rounded-sm border border-field-border bg-field text-center font-mono text-xs font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
              />
            </div>
          </div>

          <span className="font-display text-[9px] font-bold uppercase tracking-wider text-muted-foreground select-none">
            Tarjetas
          </span>

          {/* Tarjetas Jugador B */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1" title={`Tarjetas amarillas de ${nameB}`}>
              <span className="inline-block h-3 w-2 rounded-[1px] bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]" />
              <input
                type="number"
                min={0}
                max={99}
                disabled={isConfirmed || isWalkover}
                value={match.cardsB?.yellow ?? ''}
                onChange={(e) => handleCardChange('b', 'yellow', e.target.value)}
                placeholder="0"
                className="h-6 w-8 rounded-sm border border-field-border bg-field text-center font-mono text-xs font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
              />
            </div>
            <div className="flex items-center gap-1" title={`Tarjetas rojas de ${nameB}`}>
              <span className="inline-block h-3 w-2 rounded-[1px] bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]" />
              <input
                type="number"
                min={0}
                max={99}
                disabled={isConfirmed || isWalkover}
                value={match.cardsB?.red ?? ''}
                onChange={(e) => handleCardChange('b', 'red', e.target.value)}
                placeholder="0"
                className="h-6 w-8 rounded-sm border border-field-border bg-field text-center font-mono text-xs font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
              />
            </div>
          </div>
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
          isWalkoverB
            ? 'bg-destructive/10'
            : isWinnerB
              ? 'bg-primary/15'
              : 'bg-background/40'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={`truncate text-sm font-semibold ${
                isWalkoverB
                  ? 'text-destructive line-through'
                  : isWinnerB
                    ? 'text-primary'
                    : 'text-foreground'
              }`}
            >
              {nameB}
            </p>
            {isWalkoverB && (
              <span className="rounded bg-destructive/20 border border-destructive/50 px-1 py-0.2 text-[9px] font-black uppercase text-destructive">
                W.O.
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{teamB}</p>
        </div>
        {isWinnerB && <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />}
      </div>

      {/* Botón de acción */}
      <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/30 px-3 py-1.5 min-h-[36px]">
        {isWalkover ? (
          <span className="text-[11px] font-medium text-destructive/85 italic">
            Bloqueado por abandono (W.O.)
          </span>
        ) : !isConfirmed ? (
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

import { Trophy, CheckCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  canEditSeries,
  getSeriesResult,
  isSeriesReady,
} from '../../domain/series';
import type { CardCounts, PlayerId, Series, Side } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';

interface SeriesCardProps {
  series: Series;
  label: string;
}

export function SeriesCard({ series, label }: SeriesCardProps) {
  const { activeTournament, players } = useAppState();
  const dispatch = useAppDispatch();

  if (!activeTournament) return null;

  const { byes, teams, series: allSeries } = activeTournament;
  const matchFormat = activeTournament.matchFormat ?? 'two_legged';
  const isSingleMatch = matchFormat === 'single_match';

  const walkoverPlayerIds = activeTournament.walkoverPlayerIds ?? [];
  const isWalkoverA = series.playerA ? walkoverPlayerIds.includes(series.playerA) : false;
  const isWalkoverB = series.playerB ? walkoverPlayerIds.includes(series.playerB) : false;
  const isWalkoverSeries = isWalkoverA || isWalkoverB;

  const playersMap = new Map(players.map((p) => [p.id, p]));

  const ready = isSeriesReady(series);
  const result = getSeriesResult(series, matchFormat);
  const editable = canEditSeries(allSeries, series.id, matchFormat);

  const playerA = series.playerA ? playersMap.get(series.playerA) : null;
  const playerB = series.playerB ? playersMap.get(series.playerB) : null;

  const nameA = playerA ? `${playerA.lastName}, ${playerA.firstName}` : 'Por definir';
  const nameB = playerB ? `${playerB.lastName}, ${playerB.firstName}` : 'Por definir';

  const teamA = series.playerA ? teams[series.playerA] ?? 'Sin equipo' : '—';
  const teamB = series.playerB ? teams[series.playerB] ?? 'Sin equipo' : '—';

  const isByeA = series.playerA ? byes.includes(series.playerA) && series.round === 'semifinal' : false;
  const isByeB = series.playerB ? byes.includes(series.playerB) && series.round === 'semifinal' : false;

  const isWinnerA = series.confirmed && result.winner === series.playerA;
  const isWinnerB = series.confirmed && result.winner === series.playerB;

  const handleScoreChange = (
    leg: 'leg1' | 'leg2',
    side: Side,
    valueStr: string
  ) => {
    if (series.confirmed || isWalkoverSeries) return;
    const existingCards = side === 'a' ? series[leg].cardsA : series[leg].cardsB;
    const trimmed = valueStr.trim();
    if (trimmed === '') {
      dispatch({
        type: 'LEG_SCORE_SET',
        seriesId: series.id,
        leg,
        side,
        value: null,
        cards: existingCards,
      });
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99) {
      dispatch({
        type: 'LEG_SCORE_SET',
        seriesId: series.id,
        leg,
        side,
        value: parsed,
        cards: existingCards,
      });
    }
  };

  const handleCardChange = (
    leg: 'leg1' | 'leg2',
    side: Side,
    cardType: 'yellow' | 'red',
    valueStr: string
  ) => {
    if (series.confirmed || isWalkoverSeries) return;
    const currentCards =
      (side === 'a' ? series[leg].cardsA : series[leg].cardsB) ?? {
        yellow: 0,
        red: 0,
      };
    const trimmed = valueStr.trim();
    if (trimmed === '') {
      const updatedCards: CardCounts = {
        ...currentCards,
        [cardType]: 0,
      };
      dispatch({
        type: 'LEG_SCORE_SET',
        seriesId: series.id,
        leg,
        side,
        value: series[leg][side],
        cards: updatedCards,
      });
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99) {
      const updatedCards: CardCounts = {
        ...currentCards,
        [cardType]: parsed,
      };
      dispatch({
        type: 'LEG_SCORE_SET',
        seriesId: series.id,
        leg,
        side,
        value: series[leg][side],
        cards: updatedCards,
      });
    }
  };

  const handlePenaltyChange = (winnerId: PlayerId | null) => {
    if (isWalkoverSeries) return;
    dispatch({
      type: 'PENALTY_WINNER_SET',
      seriesId: series.id,
      playerId: winnerId,
    });
  };

  const handleConfirm = () => {
    if (!result.canConfirm || isWalkoverSeries) return;
    dispatch({ type: 'SERIES_CONFIRMED', seriesId: series.id });
  };

  const handleReopen = () => {
    if (!editable || isWalkoverSeries) return;
    dispatch({ type: 'SERIES_EDIT_REQUESTED', seriesId: series.id });
  };

  const renderSideHeader = (
    name: string,
    team: string,
    isBye: boolean,
    isWinner: boolean,
    isWalkover: boolean
  ) => (
    <div
      className={`flex items-center justify-between gap-2 px-4 py-2.5 transition ${
        isWalkover
          ? 'bg-destructive/10'
          : isWinner
            ? 'bg-primary/15'
            : 'bg-background/40'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate font-semibold ${
              isWalkover
                ? 'text-destructive line-through'
                : isWinner
                  ? 'text-primary'
                  : 'text-foreground'
            }`}
          >
            {name}
          </p>
          {isWalkover && (
            <span className="rounded border border-destructive/40 bg-destructive/20 px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-destructive flex items-center gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" /> W.O.
            </span>
          )}
          {isBye && (
            <span className="rounded border border-accent/40 bg-accent/20 px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-accent">
              Pase directo
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{team}</p>
      </div>

      {isWinner && <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />}
    </div>
  );

  return (
    <div
      className={`overflow-hidden rounded-md border transition ${
        isWalkoverSeries
          ? 'border-destructive/40 bg-card/80 opacity-90'
          : series.confirmed
            ? 'border-border/80 bg-card/90'
            : ready
              ? 'border-accent/70 bg-card shadow-[0_0_15px_rgba(56,189,248,0.15)]'
              : 'border-border/40 bg-card/40 opacity-70'
      }`}
    >
      {/* Header de la serie */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-1.5">
        <span className="font-display text-xs font-bold uppercase tracking-widest text-accent">
          {label}
        </span>
        {isWalkoverSeries ? (
          <span className="flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> W.O. (Abandono)
          </span>
        ) : series.confirmed ? (
          <span className="flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-primary">
            <CheckCircle className="h-3.5 w-3.5" /> Confirmada
          </span>
        ) : null}
      </div>

      {/* Participante A */}
      {renderSideHeader(nameA, teamA, isByeA, isWinnerA, isWalkoverA)}

      {/* Bloque central de resultados */}
      <div className="border-y border-border bg-background/60 p-3">
        {ready ? (
          <>
            {isSingleMatch ? (
              /* Modalidad Partido Único (RF-21, RF-49) */
              <div className="space-y-2">
                <div className="text-center font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Partido Único</span>
                </div>

                <div className="flex items-center justify-center">
                  <div className="flex items-center justify-center gap-2 rounded bg-background/80 p-1.5 border border-border/50">
                    <input
                      type="number"
                      min={0}
                      max={99}
                      disabled={series.confirmed || isWalkoverSeries}
                      value={series.leg1.a ?? ''}
                      onChange={(e) =>
                        handleScoreChange('leg1', 'a', e.target.value)
                      }
                      placeholder="0"
                      className="h-10 w-12 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                      title={`Goles de ${nameA}`}
                    />
                    <span className="text-muted-foreground font-bold text-lg">-</span>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      disabled={series.confirmed || isWalkoverSeries}
                      value={series.leg1.b ?? ''}
                      onChange={(e) =>
                        handleScoreChange('leg1', 'b', e.target.value)
                      }
                      placeholder="0"
                      className="h-10 w-12 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                      title={`Goles de ${nameB}`}
                    />
                  </div>
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
                        disabled={series.confirmed || isWalkoverSeries}
                        value={series.leg1.cardsA?.yellow ?? ''}
                        onChange={(e) => handleCardChange('leg1', 'a', 'yellow', e.target.value)}
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
                        disabled={series.confirmed || isWalkoverSeries}
                        value={series.leg1.cardsA?.red ?? ''}
                        onChange={(e) => handleCardChange('leg1', 'a', 'red', e.target.value)}
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
                        disabled={series.confirmed || isWalkoverSeries}
                        value={series.leg1.cardsB?.yellow ?? ''}
                        onChange={(e) => handleCardChange('leg1', 'b', 'yellow', e.target.value)}
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
                        disabled={series.confirmed || isWalkoverSeries}
                        value={series.leg1.cardsB?.red ?? ''}
                        onChange={(e) => handleCardChange('leg1', 'b', 'red', e.target.value)}
                        placeholder="0"
                        className="h-6 w-8 rounded-sm border border-field-border bg-field text-center font-mono text-xs font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Modalidad Ida y Vuelta (RF-21) */
              <div>
                {/* Headers de partidos */}
                <div className="grid grid-cols-2 gap-2 text-center font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Ida (L - V)</span>
                  <span>Vuelta (L - V)</span>
                </div>

                {/* Inputs de Ida y Vuelta */}
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  {/* Partido de Ida: A es local, B es visitante */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-center gap-1.5 rounded bg-background/80 p-1.5 border border-border/50">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={series.confirmed || isWalkoverSeries}
                        value={series.leg1.a ?? ''}
                        onChange={(e) =>
                          handleScoreChange('leg1', 'a', e.target.value)
                        }
                        placeholder="0"
                        className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                        title={`Goles de ${nameA} en la Ida (Local)`}
                      />
                      <span className="text-muted-foreground font-bold">-</span>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={series.confirmed || isWalkoverSeries}
                        value={series.leg1.b ?? ''}
                        onChange={(e) =>
                          handleScoreChange('leg1', 'b', e.target.value)
                        }
                        placeholder="0"
                        className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                        title={`Goles de ${nameB} en la Ida (Visitante)`}
                      />
                    </div>

                    {/* Tarjetas Ida (A local - B visitante) */}
                    <div className="flex items-center justify-between gap-1 rounded bg-background/50 px-1.5 py-1 border border-border/40 text-[10px]">
                      {/* A local */}
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-0.5" title={`Amarillas de ${nameA} (Ida)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-amber-400" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={series.confirmed || isWalkoverSeries}
                            value={series.leg1.cardsA?.yellow ?? ''}
                            onChange={(e) => handleCardChange('leg1', 'a', 'yellow', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
                          />
                        </div>
                        <div className="flex items-center gap-0.5" title={`Rojas de ${nameA} (Ida)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-red-500" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={series.confirmed || isWalkoverSeries}
                            value={series.leg1.cardsA?.red ?? ''}
                            onChange={(e) => handleCardChange('leg1', 'a', 'red', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                          />
                        </div>
                      </div>

                      {/* B visitante */}
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-0.5" title={`Amarillas de ${nameB} (Ida)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-amber-400" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={series.confirmed || isWalkoverSeries}
                            value={series.leg1.cardsB?.yellow ?? ''}
                            onChange={(e) => handleCardChange('leg1', 'b', 'yellow', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
                          />
                        </div>
                        <div className="flex items-center gap-0.5" title={`Rojas de ${nameB} (Ida)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-red-500" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={series.confirmed || isWalkoverSeries}
                            value={series.leg1.cardsB?.red ?? ''}
                            onChange={(e) => handleCardChange('leg1', 'b', 'red', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Partido de Vuelta: B es local, A es visitante */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-center gap-1.5 rounded bg-background/80 p-1.5 border border-border/50">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={series.confirmed || isWalkoverSeries}
                        value={series.leg2.b ?? ''}
                        onChange={(e) =>
                          handleScoreChange('leg2', 'b', e.target.value)
                        }
                        placeholder="0"
                        className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                        title={`Goles de ${nameB} en la Vuelta (Local)`}
                      />
                      <span className="text-muted-foreground font-bold">-</span>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={series.confirmed || isWalkoverSeries}
                        value={series.leg2.a ?? ''}
                        onChange={(e) =>
                          handleScoreChange('leg2', 'a', e.target.value)
                        }
                        placeholder="0"
                        className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                        title={`Goles de ${nameA} en la Vuelta (Visitante)`}
                      />
                    </div>

                    {/* Tarjetas Vuelta (B local - A visitante) */}
                    <div className="flex items-center justify-between gap-1 rounded bg-background/50 px-1.5 py-1 border border-border/40 text-[10px]">
                      {/* B local */}
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-0.5" title={`Amarillas de ${nameB} (Vuelta)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-amber-400" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={series.confirmed || isWalkoverSeries}
                            value={series.leg2.cardsB?.yellow ?? ''}
                            onChange={(e) => handleCardChange('leg2', 'b', 'yellow', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
                          />
                        </div>
                        <div className="flex items-center gap-0.5" title={`Rojas de ${nameB} (Vuelta)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-red-500" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={series.confirmed || isWalkoverSeries}
                            value={series.leg2.cardsB?.red ?? ''}
                            onChange={(e) => handleCardChange('leg2', 'b', 'red', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                          />
                        </div>
                      </div>

                      {/* A visitante */}
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-0.5" title={`Amarillas de ${nameA} (Vuelta)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-amber-400" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={series.confirmed || isWalkoverSeries}
                            value={series.leg2.cardsA?.yellow ?? ''}
                            onChange={(e) => handleCardChange('leg2', 'a', 'yellow', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
                          />
                        </div>
                        <div className="flex items-center gap-0.5" title={`Rojas de ${nameA} (Vuelta)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-red-500" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={series.confirmed || isWalkoverSeries}
                            value={series.leg2.cardsA?.red ?? ''}
                            onChange={(e) => handleCardChange('leg2', 'a', 'red', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Global en vivo (RF-24) */}
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-xs">
                  <span className="uppercase tracking-widest text-muted-foreground">
                    Global acumulado:
                  </span>
                  <span className="font-display text-xl font-black text-foreground">
                    {result.isComplete ||
                    result.globalA > 0 ||
                    result.globalB > 0
                      ? `${result.globalA} - ${result.globalB}`
                      : '—'}
                  </span>
                </div>
              </div>
            )}

            {/* Selector de penales en caso de empate (RF-25) */}
            {result.isTied && (
              <div className="mt-3 rounded-sm border border-accent bg-accent/10 p-2 text-left">
                <label className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-accent">
                  {isSingleMatch
                    ? 'Empate · Ganador por penales:'
                    : 'Empate global · Ganador por penales:'}
                </label>
                <select
                  disabled={series.confirmed || isWalkoverSeries}
                  value={series.penaltyWinner ?? ''}
                  onChange={(e) =>
                    handlePenaltyChange(
                      (e.target.value || null) as PlayerId | null
                    )
                  }
                  className="w-full rounded-sm border border-field-border bg-field px-2.5 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-accent disabled:opacity-75"
                >
                  <option value="">Seleccionar quién ganó por penales...</option>
                  {series.playerA && (
                    <option value={series.playerA}>
                      {nameA} ({teamA})
                    </option>
                  )}
                  {series.playerB && (
                    <option value={series.playerB}>
                      {nameB} ({teamB})
                    </option>
                  )}
                </select>
              </div>
            )}
          </>
        ) : (
          <p className="py-4 text-center font-display text-xs uppercase tracking-widest text-muted-foreground">
            Esperando definición de rondas previas
          </p>
        )}
      </div>

      {/* Participante B */}
      {renderSideHeader(nameB, teamB, isByeB, isWinnerB, isWalkoverB)}

      {/* Botón de acción: Confirmar o Corregir (RF-23, RF-28) */}
      {ready && (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/30 px-3 py-2">
          {isWalkoverSeries ? (
            <span className="text-[11px] font-medium text-destructive/85 italic">
              Bloqueada por abandono (W.O.)
            </span>
          ) : !series.confirmed ? (
            <PrimaryButton
              disabled={!result.canConfirm}
              onClick={handleConfirm}
              className="py-1.5 px-4 text-xs"
            >
              Confirmar Llave
            </PrimaryButton>
          ) : editable ? (
            <SecondaryButton
              onClick={handleReopen}
              className="py-1 px-3 text-[11px]"
              title="Corregir los goles de esta llave"
            >
              <RotateCcw className="h-3 w-3" /> Corregir
            </SecondaryButton>
          ) : (
            <span className="text-[11px] text-muted-foreground/70 italic">
              Bloqueada por rondas siguientes
            </span>
          )}
        </div>
      )}
    </div>
  );
}

import { Trophy, CheckCircle, RotateCcw } from 'lucide-react';
import {
  canEditSeries,
  getSeriesResult,
  isSeriesReady,
} from '../../domain/series';
import type { PlayerId, Series, Side } from '../../domain/types';
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
  const playersMap = new Map(players.map((p) => [p.id, p]));

  const ready = isSeriesReady(series);
  const result = getSeriesResult(series);
  const editable = canEditSeries(allSeries, series.id);

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
    if (series.confirmed) return;
    const trimmed = valueStr.trim();
    if (trimmed === '') {
      dispatch({
        type: 'LEG_SCORE_SET',
        seriesId: series.id,
        leg,
        side,
        value: null,
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
      });
    }
  };

  const handlePenaltyChange = (winnerId: PlayerId | null) => {
    dispatch({
      type: 'PENALTY_WINNER_SET',
      seriesId: series.id,
      playerId: winnerId,
    });
  };

  const handleConfirm = () => {
    if (!result.canConfirm) return;
    dispatch({ type: 'SERIES_CONFIRMED', seriesId: series.id });
  };

  const handleReopen = () => {
    if (!editable) return;
    dispatch({ type: 'SERIES_EDIT_REQUESTED', seriesId: series.id });
  };

  const renderSideHeader = (
    name: string,
    team: string,
    isBye: boolean,
    isWinner: boolean
  ) => (
    <div
      className={`flex items-center justify-between gap-2 px-4 py-2.5 transition ${
        isWinner ? 'bg-primary/15' : 'bg-background/40'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate font-semibold ${
              isWinner ? 'text-primary' : 'text-foreground'
            }`}
          >
            {name}
          </p>
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
        series.confirmed
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
        {series.confirmed && (
          <span className="flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-primary">
            <CheckCircle className="h-3.5 w-3.5" /> Confirmada
          </span>
        )}
      </div>

      {/* Participante A */}
      {renderSideHeader(nameA, teamA, isByeA, isWinnerA)}

      {/* Bloque central de resultados */}
      <div className="border-y border-border bg-background/60 p-3">
        {ready ? (
          <>
            {/* Headers de partidos */}
            <div className="grid grid-cols-2 gap-2 text-center font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Ida (L - V)</span>
              <span>Vuelta (L - V)</span>
            </div>

            {/* Inputs de Ida y Vuelta */}
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              {/* Partido de Ida: A es local, B es visitante */}
              <div className="flex items-center justify-center gap-1.5 rounded bg-background/80 p-1.5 border border-border/50">
                <input
                  type="number"
                  min={0}
                  max={99}
                  disabled={series.confirmed}
                  value={series.leg1.a ?? ''}
                  onChange={(e) => handleScoreChange('leg1', 'a', e.target.value)}
                  placeholder="0"
                  className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                  title={`Goles de ${nameA} en la Ida (Local)`}
                />
                <span className="text-muted-foreground font-bold">-</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  disabled={series.confirmed}
                  value={series.leg1.b ?? ''}
                  onChange={(e) => handleScoreChange('leg1', 'b', e.target.value)}
                  placeholder="0"
                  className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                  title={`Goles de ${nameB} en la Ida (Visitante)`}
                />
              </div>

              {/* Partido de Vuelta: B es local, A es visitante */}
              <div className="flex items-center justify-center gap-1.5 rounded bg-background/80 p-1.5 border border-border/50">
                <input
                  type="number"
                  min={0}
                  max={99}
                  disabled={series.confirmed}
                  value={series.leg2.b ?? ''}
                  onChange={(e) => handleScoreChange('leg2', 'b', e.target.value)}
                  placeholder="0"
                  className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                  title={`Goles de ${nameB} en la Vuelta (Local)`}
                />
                <span className="text-muted-foreground font-bold">-</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  disabled={series.confirmed}
                  value={series.leg2.a ?? ''}
                  onChange={(e) => handleScoreChange('leg2', 'a', e.target.value)}
                  placeholder="0"
                  className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                  title={`Goles de ${nameA} en la Vuelta (Visitante)`}
                />
              </div>
            </div>

            {/* Global en vivo (RF-24) */}
            <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-xs">
              <span className="uppercase tracking-widest text-muted-foreground">
                Global acumulado:
              </span>
              <span className="font-display text-xl font-black text-foreground">
                {result.isComplete || result.globalA > 0 || result.globalB > 0
                  ? `${result.globalA} - ${result.globalB}`
                  : '—'}
              </span>
            </div>

            {/* Selector de penales en caso de empate global (RF-25) */}
            {result.isTied && (
              <div className="mt-3 rounded-sm border border-accent bg-accent/10 p-2 text-left">
                <label className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-accent">
                  Empate global · Ganador por penales:
                </label>
                <select
                  disabled={series.confirmed}
                  value={series.penaltyWinner ?? ''}
                  onChange={(e) =>
                    handlePenaltyChange((e.target.value || null) as PlayerId | null)
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
      {renderSideHeader(nameB, teamB, isByeB, isWinnerB)}

      {/* Botón de acción: Confirmar o Corregir (RF-23, RF-28) */}
      {ready && (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/30 px-3 py-2">
          {!series.confirmed ? (
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

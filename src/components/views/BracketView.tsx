import type { ReactNode } from 'react';
import { useAppState } from '../../state/AppContext';
import { Panel } from '../ui/Panel';
import { SeriesCard } from './SeriesCard';

interface BracketViewProps {
  children?: ReactNode; // Podium panel placeholder for T15
}

export function BracketView({ children }: BracketViewProps) {
  const { activeTournament } = useAppState();

  if (!activeTournament) {
    return (
      <Panel title="Llaves del Torneo" subtitle="Sin torneo activo">
        <p className="text-center text-muted-foreground">
          No hay ningún torneo activo en este momento.
        </p>
      </Panel>
    );
  }

  const { series, theme, matchFormat } = activeTournament;
  const isSingleMatch = matchFormat === 'single_match';
  const formatLabel = isSingleMatch ? 'Partido Único' : 'Ida y Vuelta';

  // Filter series by round
  const r16Series = series.filter((s) => s.round === 'round_of_16');
  const qfSeries = series.filter((s) => s.round === 'quarterfinal');
  const sfSeries = series.filter((s) => s.round === 'semifinal');
  const finalSeries = series.find((s) => s.id === 'F');
  const thirdPlaceSeries = series.find((s) => s.id === 'TP');

  const hasRoundOf16 = r16Series.length > 0;
  const hasQuarterfinals = qfSeries.length > 0;

  return (
    <div className="space-y-6">
      <Panel
        title="Llaves del Torneo"
        subtitle={theme ? `Temática: ${theme} · ${formatLabel}` : formatLabel}
      >
        <div className="overflow-x-auto pb-4 scroll-smooth">
          <div
            className={`flex ${
              hasRoundOf16
                ? 'min-w-[1250px]'
                : hasQuarterfinals
                ? 'min-w-[950px]'
                : 'min-w-[700px]'
            } items-start gap-8`}
          >
            {/* 1. Octavos de final (Play-in para 9 o 10 participantes) */}
            {hasRoundOf16 && (
              <div className="flex flex-1 flex-col gap-4">
                <div className="border-b border-border/80 pb-2 text-center">
                  <h3 className="font-display text-xs font-black uppercase tracking-[0.25em] text-accent">
                    Octavos de Final
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Fase previa (Play-in)
                  </span>
                </div>
                <div className="flex flex-col gap-6">
                  {r16Series.map((s, idx) => (
                    <SeriesCard
                      key={s.id}
                      series={s}
                      label={`Octavos ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 2. Cuartos de final */}
            {hasQuarterfinals && (
              <div className="flex flex-1 flex-col gap-4">
                <div className="border-b border-border/80 pb-2 text-center">
                  <h3 className="font-display text-xs font-black uppercase tracking-[0.25em] text-accent">
                    Cuartos de Final
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    {hasRoundOf16 ? 'Clasificación a Semis' : 'Fase previa'}
                  </span>
                </div>
                <div className="flex flex-col gap-6">
                  {qfSeries.map((s, idx) => (
                    <SeriesCard
                      key={s.id}
                      series={s}
                      label={`Cuartos ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 2. Semifinales */}
            <div className="flex flex-1 flex-col gap-4">
              <div className="border-b border-border/80 pb-2 text-center">
                <h3 className="font-display text-xs font-black uppercase tracking-[0.25em] text-accent">
                  Semifinales
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  Pase a la Gran Final
                </span>
              </div>
              <div className="flex flex-col gap-6">
                {sfSeries.map((s, idx) => (
                  <SeriesCard
                    key={s.id}
                    series={s}
                    label={`Semifinal ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* 3. Gran Final y 3er Puesto */}
            <div className="flex flex-1 flex-col gap-4">
              <div className="border-b border-border/80 pb-2 text-center">
                <h3 className="font-display text-xs font-black uppercase tracking-[0.25em] text-accent">
                  Definición del Podio
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  Final y 3er Puesto
                </span>
              </div>
              <div className="flex flex-col gap-6">
                {finalSeries && (
                  <SeriesCard series={finalSeries} label="Gran Final 🏆" />
                )}
                {thirdPlaceSeries && (
                  <SeriesCard series={thirdPlaceSeries} label="3er y 4to Puesto 🥉" />
                )}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Podium panel slot (T15) */}
      {children}
    </div>
  );
}

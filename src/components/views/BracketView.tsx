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

  const { series, theme } = activeTournament;

  // Filter series by round
  const qfSeries = series.filter((s) => s.round === 'quarterfinal');
  const sfSeries = series.filter((s) => s.round === 'semifinal');
  const finalSeries = series.find((s) => s.id === 'F');
  const thirdPlaceSeries = series.find((s) => s.id === 'TP');

  const hasQuarterfinals = qfSeries.length > 0;

  return (
    <div className="space-y-6">
      <Panel
        title="Llaves del Torneo"
        subtitle={theme ? `Temática: ${theme} · Ida y Vuelta` : 'Ida y Vuelta'}
      >
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-[950px] items-start gap-8">
            {/* 1. Cuartos de final (solo si hay 5 o 6 participantes) */}
            {hasQuarterfinals && (
              <div className="flex flex-1 flex-col gap-4">
                <div className="border-b border-border/80 pb-2 text-center">
                  <h3 className="font-display text-xs font-black uppercase tracking-[0.25em] text-accent">
                    Cuartos de Final
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Fase previa (Play-in)
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

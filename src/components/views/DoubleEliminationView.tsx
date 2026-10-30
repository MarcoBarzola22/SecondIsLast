import { useState } from 'react';
import {
  Trophy,
  ShieldAlert,
  Flame,
  Zap,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { useAppState } from '../../state/AppContext';
import { Panel } from '../ui/Panel';
import { SeriesCard } from './SeriesCard';
import { ParticipantsWalkoverPanel } from './ParticipantsWalkoverPanel';
import { PodiumPanel } from './PodiumPanel';
import {
  evaluateGrandFinal,
  isDoubleEliminationComplete,
} from '../../domain/doubleElimination';
import type { Series } from '../../domain/types';

interface DoubleEliminationViewProps {
  onTournamentFinished: () => void;
}

type TabType = 'all' | 'winner' | 'loser' | 'final';

export function DoubleEliminationView({
  onTournamentFinished,
}: DoubleEliminationViewProps) {
  const { activeTournament } = useAppState();
  const [activeTab, setActiveTab] = useState<TabType>('all');

  if (!activeTournament) {
    return (
      <Panel title="Doble Eliminación" subtitle="Sin torneo activo">
        <p className="text-center text-muted-foreground">
          No hay ningún torneo activo en este momento.
        </p>
      </Panel>
    );
  }

  const { series, theme, matchFormat } = activeTournament;
  const isSingleMatch = matchFormat === 'single_match';
  const formatLabel = isSingleMatch ? 'Partido Único' : 'Ida y Vuelta';

  // Group Winner Bracket series
  const wbR16 = series.filter(
    (s) => s.round === 'wb_round_of_16' || s.id.startsWith('WB_R16')
  );
  const wbQf = series.filter(
    (s) => s.round === 'wb_quarterfinal' || s.id.startsWith('WB_QF')
  );
  const wbSf = series.filter(
    (s) => s.round === 'wb_semifinal' || s.id.startsWith('WB_SF')
  );
  const wbFinal = series.find(
    (s) => s.round === 'wb_final' || s.id === 'WB_F'
  );

  // Group Loser Bracket series
  const lbR0 = series.filter(
    (s) => s.round === 'lb_round_0' || s.id.startsWith('LB_R0')
  );
  const lbR1 = series.filter(
    (s) => s.round === 'lb_round_1' || s.id.startsWith('LB_R1')
  );
  const lbR2 = series.filter(
    (s) =>
      s.round === 'lb_round_2' ||
      s.round === 'lb_quarterfinal' ||
      s.id.startsWith('LB_R2') ||
      s.id.startsWith('LB_QF')
  );
  const lbSf = series.filter(
    (s) =>
      s.round === 'lb_semifinal' ||
      s.round === 'lb_round_3' ||
      s.id.startsWith('LB_R3') ||
      s.id === 'LB_SF'
  );
  const lbFinal = series.find(
    (s) => s.round === 'lb_final' || s.id === 'LB_F'
  );

  // Grand Final series
  const gf1 = series.find((s) => s.id === 'GF1');
  const gf2 = series.find((s) => s.id === 'GF2');

  const evalResult = evaluateGrandFinal(series, matchFormat ?? 'two_legged');
  const isFinished = isDoubleEliminationComplete(
    series,
    matchFormat ?? 'two_legged'
  );
  const isResetRequired = evalResult.isResetRequired || gf2 !== undefined;

  const renderRoundColumn = (title: string, subtitle: string, items: Series[], prefixLabel: string) => {
    if (items.length === 0) return null;
    return (
      <div className="flex min-w-[280px] flex-1 flex-col gap-3">
        <div className="border-b border-border/70 pb-2 text-center">
          <h4 className="font-display text-xs font-black uppercase tracking-wider text-foreground">
            {title}
          </h4>
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        </div>
        <div className="flex flex-col gap-4">
          {items.map((s, idx) => (
            <SeriesCard
              key={s.id}
              series={s}
              label={items.length > 1 ? `${prefixLabel} ${idx + 1}` : prefixLabel}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Panel
        title="Doble Eliminación (Winner & Loser Bracket)"
        subtitle={
          theme
            ? `Temática: ${theme} · ${formatLabel} · ${activeTournament.participantIds.length} Jugadores`
            : `${formatLabel} · ${activeTournament.participantIds.length} Jugadores`
        }
      >
        {/* Navigation tabs for mobile / desktop filtering */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-border/60 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
              activeTab === 'all'
                ? 'border border-primary bg-primary/20 text-primary glow-green'
                : 'border border-border/50 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <Layers className="h-3.5 w-3.5" /> Vista General (3 Secciones)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('winner')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
              activeTab === 'winner'
                ? 'border border-emerald-500 bg-emerald-500/20 text-emerald-400'
                : 'border border-border/50 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-emerald-400" /> Winner Bracket
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('loser')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
              activeTab === 'loser'
                ? 'border border-amber-500 bg-amber-500/20 text-amber-400'
                : 'border border-border/50 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <Flame className="h-3.5 w-3.5 text-amber-400" /> Loser Bracket
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('final')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
              activeTab === 'final'
                ? 'border border-accent bg-accent/20 text-accent glow-blue'
                : 'border border-border/50 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <Trophy className="h-3.5 w-3.5 text-accent" /> Gran Final {isResetRequired && '· Reset'}
          </button>
        </div>

        {/* 1. WINNER BRACKET */}
        {(activeTab === 'all' || activeTab === 'winner') && (
          <div className="mb-8 rounded-md border border-emerald-500/40 bg-emerald-950/10 p-4">
            <div className="mb-4 flex items-center justify-between border-b border-emerald-500/30 pb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-emerald-400" />
                <h3 className="font-display text-sm font-black uppercase tracking-widest text-emerald-300">
                  Winner Bracket (Cuadro de Ganadores)
                </h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Quien pierde en WB cae a la ronda correspondiente de Loser Bracket
              </span>
            </div>

            <div className="overflow-x-auto pb-3 scroll-smooth">
              <div className="flex min-w-[700px] items-start gap-6">
                {renderRoundColumn('Octavos de Final', 'Play-in WB', wbR16, 'Octavos')}
                {renderRoundColumn('Cuartos de Final', 'Clasificación a Semis', wbQf, 'Cuartos')}
                {renderRoundColumn('Semifinales', 'Pase a la Final WB', wbSf, 'Semifinal')}
                {wbFinal &&
                  renderRoundColumn('Final de Ganadores', 'Clasifica directo a la Gran Final', [wbFinal], 'Final WB')}
              </div>
            </div>
          </div>
        )}

        {/* 2. LOSER BRACKET */}
        {(activeTab === 'all' || activeTab === 'loser') && (
          <div className="mb-8 rounded-md border border-amber-500/40 bg-amber-950/10 p-4">
            <div className="mb-4 flex items-center justify-between border-b border-amber-500/30 pb-2">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-amber-400" />
                <h3 className="font-display text-sm font-black uppercase tracking-widest text-amber-300">
                  Loser Bracket (Cuadro de Perdedores)
                </h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Quien pierde en LB queda eliminado definitivamente
              </span>
            </div>

            <div className="overflow-x-auto pb-3 scroll-smooth">
              <div className="flex min-w-[700px] items-start gap-6">
                {renderRoundColumn('Ronda Preliminar', 'Entrada LB 1', lbR0, 'LB Preliminar')}
                {renderRoundColumn('Ronda 1', 'Primera oportunidad LB', lbR1, 'LB R1')}
                {renderRoundColumn('Ronda 2 / Cuartos', 'Avance en LB', lbR2, 'LB R2')}
                {renderRoundColumn('Semifinal LB', 'Pase a la Final LB', lbSf, 'LB Semis')}
                {lbFinal &&
                  renderRoundColumn('Final de Perdedores', 'Define 3er puesto y finalista', [lbFinal], 'Final LB')}
              </div>
            </div>
          </div>
        )}

        {/* 3. GRAND FINAL */}
        {(activeTab === 'all' || activeTab === 'final') && (
          <div className="rounded-md border-2 border-accent/60 bg-accent/10 p-5 shadow-xl">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-accent/40 pb-3">
              <div className="flex items-center gap-2.5">
                <Trophy className="h-6 w-6 text-accent text-glow" />
                <div>
                  <h3 className="font-display text-base font-black uppercase tracking-widest text-foreground">
                    Gran Final
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Campeón Winner Bracket vs Campeón Loser Bracket (RF-69)
                  </p>
                </div>
              </div>

              {/* Reset indicator badge */}
              {isResetRequired ? (
                <div className="flex items-center gap-2 rounded-sm border border-amber-500 bg-amber-500/20 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-amber-300 animate-pulse">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span>Grand Final Reset Activado</span>
                </div>
              ) : isFinished && evalResult.champion ? (
                <div className="flex items-center gap-1.5 rounded-sm border border-primary bg-primary/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                  <CheckCircle2 className="h-4 w-4" /> Final Concluida
                </div>
              ) : null}
            </div>

            {/* Reset explanatory banner */}
            {isResetRequired && (
              <div className="mb-5 flex items-start gap-3 rounded-sm border border-amber-500/60 bg-amber-950/40 p-3.5 text-sm text-foreground">
                <Zap className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <p className="font-bold text-amber-300">
                    ¡BRACKET RESET ACTIVADO! (RF-69)
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    El finalista del Loser Bracket derrotó al campeón del Winner Bracket en la primera serie. Al sufrir su primera derrota, ambos finalistas quedan igualados con 1 derrota.
                    Se disputa obligatoriamente la <strong>Serie 2 (GF2)</strong>: ¡quien gane este partido se consagrará Campeón!
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* GF1 */}
              {gf1 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="font-display text-xs font-black uppercase tracking-wider text-foreground">
                      Serie 1 · Gran Final
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {gf1.confirmed ? 'Finalizado' : 'En disputa'}
                    </span>
                  </div>
                  <SeriesCard series={gf1} label="Gran Final (GF1)" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Esperando finalistas de WB y LB...
                </p>
              )}

              {/* GF2 (Reset) */}
              {gf2 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="font-display text-xs font-black uppercase tracking-wider text-amber-300">
                      Serie 2 · Grand Final Reset (Decisiva)
                    </span>
                    <span className="text-[11px] text-amber-400 font-bold">
                      {gf2.confirmed ? 'Finalizado' : 'Por el Título'}
                    </span>
                  </div>
                  <SeriesCard series={gf2} label="Grand Final Reset (GF2)" />
                </div>
              ) : isResetRequired ? (
                <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-amber-500/50 p-6 text-center">
                  <Zap className="h-8 w-8 text-amber-400 animate-bounce mb-2" />
                  <p className="font-bold text-amber-300 text-sm">
                    Serie de Desempate (GF2)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Se jugará el partido definitorio por el campeonato.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Panel>

      {/* Walkovers individual panel */}
      <ParticipantsWalkoverPanel />

      {/* Podium when complete */}
      <PodiumPanel onTournamentFinished={onTournamentFinished} />
    </div>
  );
}

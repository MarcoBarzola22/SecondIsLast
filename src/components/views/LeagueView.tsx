import { useMemo } from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Medal,
  Trophy,
} from 'lucide-react';
import {
  computeLeagueTable,
  getLeaguePodium,
  isLeagueComplete,
} from '../../domain/league';
import { getPlayoffsCutoffCount } from '../../domain/leaguePlayoffs';
import { formatPlayerName } from '../../domain/players';
import {
  calculateMathematicalElimination,
  calculateMathematicalQualification,
  getMatchScenarioGuidance,
  isLastRounds,
} from '../../domain/scenarios';
import type { LeagueMatch } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { PrimaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';
import { LeagueMatchCard } from './LeagueMatchCard';
import { LeagueTable } from './LeagueTable';
import { ParticipantsWalkoverPanel } from './ParticipantsWalkoverPanel';
import { PodiumPanel } from './PodiumPanel';
import { SeriesCard } from './SeriesCard';

interface LeagueViewProps {
  onTournamentFinished: () => void;
}

export function LeagueView({ onTournamentFinished }: LeagueViewProps) {
  const { activeTournament, players } = useAppState();
  const dispatch = useAppDispatch();

  if (!activeTournament) {
    return (
      <Panel title="Torneo de Liga" subtitle="Sin torneo activo">
        <p className="text-center text-muted-foreground">
          No hay ningún torneo activo en este momento.
        </p>
      </Panel>
    );
  }

  const {
    theme,
    participantIds,
    teams,
    leagueMatches,
    matchFormat,
    tournamentType,
    phase,
    series = [],
  } = activeTournament;

  const isTwoLegged = matchFormat === 'two_legged';
  const matches = leagueMatches ?? [];

  const isLeaguePlayoffsFormat = tournamentType === 'league_playoffs';
  const isPlayoffsPhase = phase === 'league_playoffs';
  const cutoffCount = isLeaguePlayoffsFormat
    ? activeTournament.qualifyingSpots ?? getPlayoffsCutoffCount(participantIds.length)
    : 0;

  const qualifyingCutoff = isLeaguePlayoffsFormat
    ? cutoffCount
    : activeTournament.qualifyingSpots !== undefined
    ? activeTournament.qualifyingSpots
    : participantIds.length <= 4
    ? 2
    : participantIds.length >= 10
    ? 8
    : 4;

  const playersMap = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  const standings = useMemo(
    () => computeLeagueTable(matches, participantIds, teams, players),
    [matches, participantIds, teams, players]
  );

  const remainingMatches = useMemo(
    () => matches.filter((m) => !m.confirmed),
    [matches]
  );

  const totalRounds = useMemo(
    () => (matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0),
    [matches]
  );

  const mathematicallyQualified = useMemo(() => {
    if (matches.length === 0 || standings.length === 0) return {};
    return calculateMathematicalQualification(
      standings,
      remainingMatches,
      qualifyingCutoff
    );
  }, [standings, remainingMatches, qualifyingCutoff, matches.length]);

  const mathematicallyEliminated = useMemo(() => {
    if (matches.length === 0 || standings.length === 0) return {};
    return calculateMathematicalElimination(
      standings,
      remainingMatches,
      qualifyingCutoff
    );
  }, [standings, remainingMatches, qualifyingCutoff, matches.length]);

  const complete = isLeagueComplete(matches);

  // Group matches by round (Fechas)
  const rounds = useMemo(() => {
    const map = new Map<number, LeagueMatch[]>();
    for (const m of matches) {
      const list = map.get(m.round) ?? [];
      list.push(m);
      map.set(m.round, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [matches]);

  // Extract pure league podium if complete and not in playoffs format
  const podium = useMemo(() => {
    if (!complete || standings.length < 4 || isLeaguePlayoffsFormat) return null;
    return getLeaguePodium(standings);
  }, [complete, standings, isLeaguePlayoffsFormat]);

  const champPlayer = podium ? playersMap.get(podium.champion) : null;
  const runnerPlayer = podium ? playersMap.get(podium.runnerUp) : null;
  const thirdPlayer = podium ? playersMap.get(podium.third) : null;
  const fourthPlayer = podium ? playersMap.get(podium.fourth) : null;

  const champName = champPlayer ? formatPlayerName(champPlayer) : 'Campeón';
  const runnerName = runnerPlayer ? formatPlayerName(runnerPlayer) : 'Subcampeón';
  const thirdName = thirdPlayer ? formatPlayerName(thirdPlayer) : '3er Puesto';
  const fourthName = fourthPlayer ? formatPlayerName(fourthPlayer) : '4to Puesto';

  const champTeam = podium ? teams[podium.champion] ?? '—' : '—';
  const runnerTeam = podium ? teams[podium.runnerUp] ?? '—' : '—';
  const thirdTeam = podium ? teams[podium.third] ?? '—' : '—';
  const fourthTeam = podium ? teams[podium.fourth] ?? '—' : '—';

  const handleFinish = () => {
    if (!complete) return;
    dispatch({
      type: 'TOURNAMENT_FINISHED',
      summaryId: crypto.randomUUID(),
      now: new Date().toISOString(),
    });
    onTournamentFinished();
  };

  const handleStartPlayoffs = () => {
    if (!complete) return;
    dispatch({
      type: 'LEAGUE_PLAYOFFS_STARTED',
    });
  };

  // Playoff series filtered by round
  const r16Series = series.filter((s) => s.round === 'round_of_16');
  const qfSeries = series.filter((s) => s.round === 'quarterfinal');
  const sfSeries = series.filter((s) => s.round === 'semifinal');
  const finalSeries = series.find((s) => s.id === 'F');
  const thirdPlaceSeries = series.find((s) => s.id === 'TP');

  const hasRoundOf16 = r16Series.length > 0;
  const hasQuarterfinals = qfSeries.length > 0;
  const hasSemifinals = sfSeries.length > 0;

  // RENDER A: FASE DE PLAYOFFS DEL REDUCIDO (RF-68)
  if (isPlayoffsPhase) {
    return (
      <div className="space-y-8">
        {/* Encabezado del Reducido */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                <GitBranch className="h-3.5 w-3.5" /> Reducido por el Título
              </span>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Liga + Reducido · Eliminación Directa ({isTwoLegged ? 'Ida y Vuelta' : 'Partido Único'})
              </span>
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wider text-foreground">
              {theme ? `Temática: ${theme}` : 'Cuadro de Playoffs'}
            </h2>
          </div>
        </div>

        {/* Cuadro de Playoffs */}
        <Panel
          title="Cuadro del Reducido (Playoffs)"
          subtitle={`Clasificados según tabla de posiciones · ${
            isTwoLegged ? 'Ida y Vuelta' : 'Partido Único'
          }`}
        >
          <div className="overflow-x-auto pb-4 scroll-smooth">
            <div
              className={`flex ${
                hasRoundOf16
                  ? 'min-w-[1250px]'
                  : hasQuarterfinals
                  ? 'min-w-[950px]'
                  : hasSemifinals
                  ? 'min-w-[700px]'
                  : 'min-w-[450px]'
              } items-start gap-8`}
            >
              {/* Octavos de final / Play-in */}
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

              {/* Cuartos de final */}
              {hasQuarterfinals && (
                <div className="flex flex-1 flex-col gap-4">
                  <div className="border-b border-border/80 pb-2 text-center">
                    <h3 className="font-display text-xs font-black uppercase tracking-[0.25em] text-accent">
                      Cuartos de Final
                    </h3>
                    <span className="text-[11px] text-muted-foreground">
                      Top 8 de la fase regular
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

              {/* Semifinales (para 6 a 10 participantes) */}
              {hasSemifinals && (
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
              )}

              {/* Definición del Podio (Gran Final y 3er Puesto) */}
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
                    <SeriesCard
                      series={thirdPlaceSeries}
                      label="3er y 4to Puesto 🥉"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </Panel>

        {/* Podio Oficial al completar todas las series de playoffs */}
        <PodiumPanel onTournamentFinished={onTournamentFinished} />

        {/* Participantes y Gestión de Abandonos (RF-64, RF-66) */}
        <ParticipantsWalkoverPanel />

        {/* Historial de la Fase Regular (Tabla y Fixture) */}
        <Panel
          title="Fase Regular — Tabla de Posiciones Final"
          subtitle={`Clasificaron los mejores ${cutoffCount} al Reducido eliminatorio`}
        >
          <LeagueTable
            standings={standings}
            walkoverPlayerIds={activeTournament.walkoverPlayerIds}
            qualifyingCutoff={cutoffCount}
            mathematicallyQualifiedIds={mathematicallyQualified}
            mathematicallyEliminatedIds={mathematicallyEliminated}
            qualificationLegend={
              cutoffCount === 2
                ? 'Los primeros 2 clasificaron a la Final directa'
                : `Los primeros ${cutoffCount} clasificaron al Reducido eliminatorio`
            }
          />
        </Panel>
      </div>
    );
  }

  // RENDER B: FASE REGULAR DE LA LIGA (phase === 'league')
  return (
    <div className="space-y-8">
      {/* 1. Tabla de Posiciones Interna en Vivo (RF-53, RF-68, RF-73, RF-74, RF-83) */}
      <Panel
        title="Tabla de Posiciones"
        subtitle={
          isLeaguePlayoffsFormat
            ? `Fase Regular · Clasifican los mejores ${cutoffCount} al Reducido eliminatorio (${
                isTwoLegged ? 'Ida y Vuelta · Doble rueda' : 'Una rueda'
              })`
            : theme
            ? `Temática: ${theme} · Todos contra todos (${
                isTwoLegged ? 'Ida y Vuelta · Doble rueda' : 'Una rueda'
              })`
            : `Todos contra todos (${
                isTwoLegged ? 'Ida y Vuelta · Doble rueda' : 'Una rueda'
              })`
        }
      >
        <LeagueTable
          standings={standings}
          walkoverPlayerIds={activeTournament.walkoverPlayerIds}
          qualifyingCutoff={qualifyingCutoff}
          mathematicallyQualifiedIds={mathematicallyQualified}
          mathematicallyEliminatedIds={mathematicallyEliminated}
          qualificationLegend={
            isLeaguePlayoffsFormat
              ? cutoffCount === 2
                ? 'Los primeros 2 clasifican a la Final'
                : `Los primeros ${cutoffCount} clasifican al Reducido`
              : qualifyingCutoff === 2
                ? 'Los primeros 2 clasifican a la Final'
                : 'Los primeros 4 definen los puestos de podio'
          }
        />
      </Panel>

      {/* Participantes y Gestión de Abandonos (RF-64, RF-66) */}
      <ParticipantsWalkoverPanel />

      {/* 2. Banner para Iniciar el Reducido (Liga + Reducido) (RF-68) */}
      {isLeaguePlayoffsFormat && complete && (
        <div className="flex flex-col items-center justify-between gap-4 rounded-md border border-primary/50 bg-primary/10 p-5 shadow-[0_0_20px_rgba(74,222,128,0.15)] sm:flex-row">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-primary" />
            <div>
              <h3 className="font-display text-base font-bold uppercase tracking-wider text-foreground">
                ¡Fase Regular Finalizada!
              </h3>
              <p className="text-xs text-muted-foreground">
                {cutoffCount === 2
                  ? `Clasificaron los 2 mejores a la Final directa: 1° (${standings[0]?.displayName ?? '1°'}) y 2° (${standings[1]?.displayName ?? '2°'}). El 3° y 4° disputarán el 3er Puesto.`
                  : cutoffCount === 4
                  ? `Clasificaron los 4 mejores a Semifinales (1° vs 4°, 2° vs 3°).`
                  : cutoffCount === 8
                  ? `Clasificaron los 8 mejores a Cuartos de Final (1° vs 8°, 2° vs 7°, 3° vs 6°, 4° vs 5°).`
                  : `Clasificaron los ${cutoffCount} mejores al Reducido eliminatorio.`}
              </p>
            </div>
          </div>
          <PrimaryButton onClick={handleStartPlayoffs}>
            Comenzar Reducido <Trophy className="h-4 w-4" />
          </PrimaryButton>
        </div>
      )}

      {/* 3. Podio Oficial de Liga pura al completar todas las fechas (RF-30, RF-55) */}
      {!isLeaguePlayoffsFormat && complete && podium && (
        <Panel
          title="🏆 Podio Oficial de la Liga"
          subtitle="Torneo completado · Todas las fechas disputadas"
          className="border-primary/80 glow-green"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1° Campeón */}
            <div className="flex flex-col items-center justify-between rounded-sm border-2 border-primary bg-primary/10 p-5 text-center shadow-[0_0_20px_rgba(74,222,128,0.25)]">
              <div className="flex flex-col items-center">
                <Trophy className="h-10 w-10 text-primary glow-green" />
                <span className="mt-2 font-display text-xs font-black uppercase tracking-widest text-primary">
                  Campeón (+10 PTS)
                </span>
                <p className="mt-2 text-lg font-bold text-foreground">{champName}</p>
                <p className="text-xs text-muted-foreground">{champTeam}</p>
              </div>
            </div>

            {/* 2° Subcampeón */}
            <div className="flex flex-col items-center justify-between rounded-sm border border-accent bg-accent/10 p-5 text-center">
              <div className="flex flex-col items-center">
                <Medal className="h-10 w-10 text-accent glow-blue" />
                <span className="mt-2 font-display text-xs font-black uppercase tracking-widest text-accent">
                  Subcampeón (+7 PTS)
                </span>
                <p className="mt-2 text-lg font-bold text-foreground">{runnerName}</p>
                <p className="text-xs text-muted-foreground">{runnerTeam}</p>
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground/75 italic">
                El segundo es el primero de los perdedores
              </p>
            </div>

            {/* 3° Tercer Puesto */}
            <div className="flex flex-col items-center justify-between rounded-sm border border-border bg-background/60 p-5 text-center">
              <div className="flex flex-col items-center">
                <Award className="h-9 w-9 text-gold" />
                <span className="mt-2 font-display text-xs font-black uppercase tracking-widest text-gold">
                  3er Puesto (+5 PTS)
                </span>
                <p className="mt-2 text-lg font-bold text-foreground">{thirdName}</p>
                <p className="text-xs text-muted-foreground">{thirdTeam}</p>
              </div>
            </div>

            {/* 4° Cuarto Puesto */}
            <div className="flex flex-col items-center justify-between rounded-sm border border-border/60 bg-background/40 p-5 text-center opacity-85">
              <div className="flex flex-col items-center">
                <Award className="h-9 w-9 text-muted-foreground" />
                <span className="mt-2 font-display text-xs font-black uppercase tracking-widest text-muted-foreground">
                  4to Puesto (+3 PTS)
                </span>
                <p className="mt-2 text-lg font-bold text-foreground">{fourthName}</p>
                <p className="text-xs text-muted-foreground">{fourthTeam}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              Al finalizar, se guardará el resumen en el historial y se sumarán los puntos y estadísticas a la tabla histórica acumulada.
            </p>

            <PrimaryButton onClick={handleFinish} className="px-8 py-3.5">
              Finalizar Torneo y Ver Tabla <ChevronRight className="h-4 w-4" />
            </PrimaryButton>
          </div>
        </Panel>
      )}

      {/* 4. Fixture Round Robin organizado por Fechas (RF-50, RF-51, RF-54) */}
      <Panel
        title="Fixture y Resultados"
        subtitle={
          isTwoLegged
            ? `Doble Round Robin · Ida y Vuelta (${matches.length} partidos en ${rounds.length} fechas)`
            : `Round Robin simple · Una rueda (${matches.length} partidos en ${rounds.length} fechas)`
        }
      >
        <div className="space-y-8">
          {rounds.map(([roundNum, roundMatches]) => {
            // Check for bye in 5-player tournaments
            const playing = new Set(
              roundMatches.flatMap((m) => [m.playerA, m.playerB])
            );
            const freeId = participantIds.find((id) => !playing.has(id));
            const freePlayer = freeId ? playersMap.get(freeId) : null;
            const roundComplete = roundMatches.every((m) => m.confirmed);

            return (
              <div
                key={roundNum}
                className="rounded-sm border border-border/80 bg-background/40 p-4"
              >
                {/* Cabecera de la Fecha */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-accent" />
                    <h3 className="font-display text-sm font-black uppercase tracking-wider text-accent">
                      Fecha {roundNum}
                      {isTwoLegged && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({roundNum <= rounds.length / 2 ? 'Rueda 1 · Ida' : 'Rueda 2 · Vuelta'})
                        </span>
                      )}
                    </h3>
                    {roundComplete && (
                      <span className="flex items-center gap-1 font-display text-[10px] font-bold uppercase text-primary">
                        <CheckCircle2 className="h-3 w-3" /> Completa
                      </span>
                    )}
                  </div>

                  {freePlayer && (
                    <span className="rounded-sm border border-accent/40 bg-accent/15 px-2 py-0.5 text-xs text-accent">
                      Libre:{' '}
                      <strong className="font-semibold text-foreground">
                        {formatPlayerName(freePlayer)}
                      </strong>{' '}
                      ({teams[freePlayer.id] || 'Sin equipo'})
                    </span>
                  )}
                </div>

                {/* Grid de partidos de la Fecha */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {roundMatches.map((m, idx) => {
                    const showGuidance =
                      isLastRounds(roundNum, totalRounds) && !m.confirmed;
                    const scenarioGuidance = showGuidance
                      ? getMatchScenarioGuidance(
                          m,
                          standings,
                          remainingMatches,
                          qualifyingCutoff
                        )
                      : null;

                    return (
                      <LeagueMatchCard
                        key={m.id}
                        match={m}
                        playersMap={playersMap}
                        teams={teams}
                        label={`Fecha ${roundNum} · Partido ${idx + 1}`}
                        scenarioGuidance={scenarioGuidance}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

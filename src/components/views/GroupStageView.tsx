import { useMemo } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Layers,
  Medal,
  Trophy,
} from 'lucide-react';
import {
  computeAllGroupStandings,
  isGroupStageComplete,
  sortCrossGroupStandings,
} from '../../domain/groupStage';
import {
  calculateMathematicalElimination,
  calculateMathematicalQualification,
  getMatchScenarioGuidance,
  isLastRounds,
} from '../../domain/scenarios';
import type { GroupId, GroupMatch, LeagueStandingRow } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { PrimaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';
import { LeagueMatchCard } from './LeagueMatchCard';
import { LeagueTable } from './LeagueTable';
import { ParticipantsWalkoverPanel } from './ParticipantsWalkoverPanel';

interface GroupStageViewProps {
  onProceedToPlayoffs: () => void;
}

export function GroupStageView({ onProceedToPlayoffs }: GroupStageViewProps) {
  const { activeTournament, players } = useAppState();
  const dispatch = useAppDispatch();

  if (!activeTournament) {
    return (
      <Panel title="Fase de Grupos" subtitle="Sin torneo activo">
        <p className="text-center text-muted-foreground">
          No hay ningún torneo activo en este momento.
        </p>
      </Panel>
    );
  }

  const {
    theme,
    groups = {},
    groupMatches = [],
    teams,
    matchFormat,
    walkoverPlayerIds = [],
  } = activeTournament;

  const isTwoLegged = matchFormat === 'two_legged';

  const playersMap = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  const groupStandings = useMemo(
    () => computeAllGroupStandings(groupMatches, groups, teams, players),
    [groupMatches, groups, teams, players]
  );

  const groupIds = useMemo(
    () =>
      (['A', 'B', 'C'] as GroupId[]).filter((gid) => Boolean(groups[gid])),
    [groups]
  );

  const isComplete = useMemo(
    () => isGroupStageComplete(groupMatches),
    [groupMatches]
  );

  // For 9 participants: runners-up comparison table (RF-67)
  const runnersUpComparison = useMemo(() => {
    if (groupIds.length !== 3) return null;
    const list: Array<LeagueStandingRow & { originGroup: GroupId }> = [];

    for (const gid of groupIds) {
      const standings = groupStandings[gid];
      if (standings && standings.length >= 2) {
        list.push({ ...standings[1], originGroup: gid });
      }
    }

    const sorted = sortCrossGroupStandings(list);
    return sorted as Array<LeagueStandingRow & { originGroup: GroupId }>;
  }, [groupIds, groupStandings]);

  const bestRunnerUp = runnersUpComparison ? runnersUpComparison[0] : null;

  const handleStartPlayoffs = () => {
    if (!isComplete) return;
    dispatch({
      type: 'GROUP_PLAYOFFS_STARTED',
    });
    onProceedToPlayoffs();
  };

  return (
    <div className="space-y-8">
      {/* 1. Encabezado de la fase */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">
              <Layers className="h-3.5 w-3.5" /> Fase de Grupos
            </span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {groupIds.length} Grupos de 3 · {isTwoLegged ? 'Ida y Vuelta' : 'Partido Único'}
            </span>
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wider text-foreground">
            {theme ? `Temática: ${theme}` : 'Torneo de Grupos'}
          </h2>
        </div>

        {isComplete && (
          <PrimaryButton onClick={handleStartPlayoffs} className="shrink-0">
            Comenzar Playoffs (Semifinales) <ChevronRight className="h-4 w-4" />
          </PrimaryButton>
        )}
      </div>

      {/* 2. Banner de fase completada */}
      {isComplete && (
        <div className="flex flex-col items-center justify-between gap-4 rounded-md border border-primary/50 bg-primary/10 p-5 shadow-[0_0_20px_rgba(74,222,128,0.15)] sm:flex-row">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-primary" />
            <div>
              <h3 className="font-display text-base font-bold uppercase tracking-wider text-foreground">
                ¡Fase de Grupos Finalizada!
              </h3>
              <p className="text-xs text-muted-foreground">
                {groupIds.length === 2
                  ? 'Clasificaron los 1° y 2° de cada grupo a Semifinales cruzadas (1°A vs 2°B, 1°B vs 2°A).'
                  : `Clasificaron los 3 primeros de grupo y el mejor segundo (${
                      bestRunnerUp?.displayName ?? 'Mejor 2°'
                    }) a Semifinales.`}
              </p>
            </div>
          </div>
          <PrimaryButton onClick={handleStartPlayoffs}>
            Comenzar Playoffs <Trophy className="h-4 w-4" />
          </PrimaryButton>
        </div>
      )}

      {/* 3. Panel de participantes y abandonos (RF-64, RF-65) */}
      <ParticipantsWalkoverPanel />

      {/* 4. Tablas Comparativas para 9 participantes (RF-67) */}
      {runnersUpComparison && runnersUpComparison.length > 0 && (
        <Panel
          title="Tabla Comparativa de Segundos (RF-67)"
          subtitle="El mejor 2° avanza a Semifinales con los 3 punteros de grupo. Criterio de desempate: PTS, DG, PG, menos TR, menos TA, GF, nombre."
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left min-w-[650px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="py-2.5 pl-3 text-center w-12">Pos</th>
                  <th className="py-2.5 px-3">Participante</th>
                  <th className="py-2.5 px-2 text-center">Grupo</th>
                  <th className="py-2.5 px-2 text-center">PTS</th>
                  <th className="py-2.5 px-2 text-center">PJ</th>
                  <th className="py-2.5 px-2 text-center">PG</th>
                  <th className="py-2.5 px-2 text-center">PE</th>
                  <th className="py-2.5 px-2 text-center">PP</th>
                  <th className="py-2.5 px-2 text-center">GF</th>
                  <th className="py-2.5 px-2 text-center">GC</th>
                  <th className="py-2.5 px-2 text-center">DG</th>
                  <th className="py-2.5 px-2 text-center" title="Tarjetas Rojas">TR</th>
                  <th className="py-2.5 px-2 text-center" title="Tarjetas Amarillas">TA</th>
                  <th className="py-2.5 pr-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono text-sm">
                {runnersUpComparison.map((r, index) => {
                  const isBest = index === 0;
                  return (
                    <tr
                      key={r.playerId}
                      className={`transition ${
                        isBest
                          ? 'bg-primary/10 shadow-[inset_0_0_15px_rgba(74,222,128,0.08)]'
                          : 'hover:bg-background/40'
                      }`}
                    >
                      <td className="py-3 pl-3 text-center font-display font-black text-sm">
                        {index + 1}°
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-foreground">
                          {r.displayName}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground font-sans">
                          ({r.team})
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center font-display font-bold text-accent">
                        Grupo {r.originGroup}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-primary">
                        {r.pts}
                      </td>
                      <td className="py-3 px-2 text-center text-muted-foreground">{r.pj}</td>
                      <td className="py-3 px-2 text-center text-muted-foreground">{r.pg}</td>
                      <td className="py-3 px-2 text-center text-muted-foreground">{r.pe}</td>
                      <td className="py-3 px-2 text-center text-muted-foreground">{r.pp}</td>
                      <td className="py-3 px-2 text-center text-muted-foreground">{r.gf}</td>
                      <td className="py-3 px-2 text-center text-muted-foreground">{r.gc}</td>
                      <td
                        className={`py-3 px-2 text-center font-semibold ${
                          r.dg > 0
                            ? 'text-primary'
                            : r.dg < 0
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {r.dg > 0 ? `+${r.dg}` : r.dg}
                      </td>
                      <td className="py-3 px-2 text-center text-red-400">
                        {r.redCards ?? 0}
                      </td>
                      <td className="py-3 px-2 text-center text-amber-400">
                        {r.yellowCards ?? 0}
                      </td>
                      <td className="py-3 pr-3 text-right">
                        {isBest ? (
                          <span className="inline-flex items-center gap-1 rounded-sm border border-primary/50 bg-primary/20 px-2 py-0.5 font-display text-xs font-bold uppercase tracking-wider text-primary">
                            <Medal className="h-3 w-3" /> Clasifica
                          </span>
                        ) : (
                          <span className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                            Eliminado
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* 5. Grupos en Paralelo (Tablas y Fixture) */}
      <div
        className={`grid grid-cols-1 gap-8 ${
          groupIds.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
        }`}
      >
        {groupIds.map((gid) => {
          const standings = groupStandings[gid] ?? [];
          const matchesInGroup = groupMatches.filter((m) => m.groupId === gid);
          const groupCutoff = groupIds.length === 2 ? 2 : 1;
          const remainingInGroup = matchesInGroup.filter((m) => !m.confirmed);
          const mathQualifiedInGroup = calculateMathematicalQualification(
            standings,
            remainingInGroup,
            groupCutoff
          );
          const mathEliminatedInGroup = calculateMathematicalElimination(
            standings,
            remainingInGroup,
            groupCutoff
          );
          const totalGroupRounds =
            matchesInGroup.length > 0
              ? Math.max(...matchesInGroup.map((m) => m.round))
              : 0;

          // Group matches by round (Fechas)
          const roundsMap = new Map<number, GroupMatch[]>();
          for (const m of matchesInGroup) {
            const list = roundsMap.get(m.round) ?? [];
            list.push(m);
            roundsMap.set(m.round, list);
          }
          const rounds = Array.from(roundsMap.entries()).sort(
            ([a], [b]) => a - b
          );

          return (
            <div key={gid} className="space-y-6">
              {/* Encabezado del Grupo */}
              <div className="flex items-center justify-between border-b border-border/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary/20 font-display font-black text-primary">
                    {gid}
                  </span>
                  <h3 className="font-display text-lg font-bold uppercase tracking-wider text-foreground">
                    Grupo {gid}
                  </h3>
                </div>
                <span className="text-xs text-muted-foreground">
                  {groups[gid]?.length ?? 3} participantes
                </span>
              </div>

              {/* Tabla de posiciones del Grupo (RF-73, RF-74, RF-83) */}
              <div className="overflow-hidden rounded-md border border-border/60 bg-secondary/30">
                <LeagueTable
                  standings={standings}
                  walkoverPlayerIds={walkoverPlayerIds}
                  qualifyingCutoff={groupCutoff}
                  mathematicallyQualifiedIds={mathQualifiedInGroup}
                  mathematicallyEliminatedIds={mathEliminatedInGroup}
                  qualificationLegend={
                    groupIds.length === 2
                      ? '1° y 2° del grupo clasifican a Semifinales'
                      : 'El 1° clasifica directo a Semifinales'
                  }
                  isGroupTable={true}
                />
              </div>

              {/* Fixture de Partidos del Grupo */}
              <div className="space-y-4">
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Partidos — Grupo {gid}
                </h4>

                <div className="space-y-4">
                  {rounds.map(([roundNum, matches]) => (
                    <div key={roundNum} className="space-y-2">
                      <div className="flex items-center justify-between border-b border-border/40 pb-1">
                        <span className="font-display text-xs font-bold uppercase tracking-wider text-accent">
                          Fecha {roundNum}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {matches.length} partido{matches.length > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {matches.map((match) => {
                          const showGuidance =
                            isLastRounds(roundNum, totalGroupRounds) &&
                            !match.confirmed;
                          const scenarioGuidance = showGuidance
                            ? getMatchScenarioGuidance(
                                match,
                                standings,
                                remainingInGroup,
                                groupCutoff
                              )
                            : null;

                          return (
                            <LeagueMatchCard
                              key={match.id}
                              match={match}
                              playersMap={playersMap}
                              teams={teams}
                              label={`Grupo ${gid} · Fecha ${roundNum}`}
                              isGroupMatch={true}
                              scenarioGuidance={scenarioGuidance}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

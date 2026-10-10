import { useMemo } from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Medal,
  Trophy,
} from 'lucide-react';
import {
  computeLeagueTable,
  getLeaguePodium,
  isLeagueComplete,
} from '../../domain/league';
import { formatPlayerName } from '../../domain/players';
import type { LeagueMatch } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { PrimaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';
import { LeagueMatchCard } from './LeagueMatchCard';
import { LeagueTable } from './LeagueTable';

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

  const { theme, participantIds, teams, leagueMatches, matchFormat } =
    activeTournament;
  const isTwoLegged = matchFormat === 'two_legged';
  const matches = leagueMatches ?? [];

  const playersMap = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  const standings = useMemo(
    () => computeLeagueTable(matches, participantIds, teams, players),
    [matches, participantIds, teams, players]
  );

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

  // Extract podium if complete
  const podium = useMemo(() => {
    if (!complete || standings.length < 4) return null;
    return getLeaguePodium(standings);
  }, [complete, standings]);

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

  return (
    <div className="space-y-8">
      {/* 1. Tabla de Posiciones Interna en Vivo (RF-53) */}
      <Panel
        title="Tabla de Posiciones"
        subtitle={
          theme
            ? `Temática: ${theme} · Todos contra todos (${
                isTwoLegged ? 'Ida y Vuelta · Doble rueda' : 'Una rueda'
              })`
            : `Todos contra todos (${
                isTwoLegged ? 'Ida y Vuelta · Doble rueda' : 'Una rueda'
              })`
        }
      >
        <LeagueTable standings={standings} />
      </Panel>

      {/* 2. Podio Oficial al completar todas las fechas (RF-30, RF-55) */}
      {complete && podium && (
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

      {/* 3. Fixture Round Robin organizado por Fechas (RF-50, RF-51, RF-54) */}
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
                  {roundMatches.map((m, idx) => (
                    <LeagueMatchCard
                      key={m.id}
                      match={m}
                      playersMap={playersMap}
                      teams={teams}
                      label={`Fecha ${roundNum} · Partido ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  Flame,
  Medal,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Swords,
  TrendingDown,
  Trophy,
  Users,
} from 'lucide-react';
import {
  computeAnnualRanking,
  computePlayerAwards,
  getHeadToHeadBetween,
  getSortedAnnualRanking,
  type SortedAnnualRankingEntry,
} from '../../domain/awardsAndRankings';
import { formatPlayerName } from '../../domain/players';
import { buildStandings } from '../../domain/standings';
import type { PlayerId, PlayerStats } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { DangerButton, SecondaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';

type StandingsTab = 'general' | 'annual' | 'h2h' | 'awards';

export function StandingsView() {
  const { players, stats, history, headToHead, annualRankings, activeTournament } =
    useAppState();
  const dispatch = useAppDispatch();

  const [activeTab, setActiveTab] = useState<StandingsTab>('general');

  // Server data state from /api/history/*
  const [serverStats, setServerStats] = useState<any[] | null>(null);
  const [serverAnnual, setServerAnnual] = useState<any[] | null>(null);
  const [serverH2H, setServerH2H] = useState<any[] | null>(null);
  const [serverTournaments, setServerTournaments] = useState<any[] | null>(null);

  // Available years for Annual Ranking
  const currentCalendarYear = new Date().getFullYear().toString();
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    if (annualRankings) {
      Object.keys(annualRankings).forEach((y) => yearsSet.add(y));
    }
    history.forEach((t) => {
      if (t.finishedAt) {
        yearsSet.add(new Date(t.finishedAt).getFullYear().toString());
      }
    });
    if (yearsSet.size === 0) {
      yearsSet.add(currentCalendarYear);
    }
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [annualRankings, history, currentCalendarYear]);

  const [selectedYear, setSelectedYear] = useState<string>(
    availableYears[0] ?? currentCalendarYear
  );

  // Fetch from PostgreSQL /api/history/* endpoints
  useEffect(() => {
    let isMounted = true;
    const fetchHistoryData = async () => {
      try {
        const [statsRes, annualRes, h2hRes, tourneyRes] = await Promise.all([
          fetch('/api/history/stats', { credentials: 'include' }).catch(() => null),
          fetch(`/api/history/annual?year=${selectedYear}`, { credentials: 'include' }).catch(() => null),
          fetch('/api/history/h2h', { credentials: 'include' }).catch(() => null),
          fetch('/api/history/tournaments', { credentials: 'include' }).catch(() => null),
        ]);

        if (statsRes?.ok && isMounted) {
          const statsData = await statsRes.json();
          setServerStats(statsData.stats ?? statsData);
        }
        if (annualRes?.ok && isMounted) {
          const annualData = await annualRes.json();
          setServerAnnual(annualData.entries ?? annualData);
        }
        if (h2hRes?.ok && isMounted) {
          const h2hData = await h2hRes.json();
          setServerH2H(h2hData.records ?? h2hData);
        }
        if (tourneyRes?.ok && isMounted) {
          const tourneyData = await tourneyRes.json();
          setServerTournaments(tourneyData.tournaments ?? tourneyData);
        }
      } catch {
        // Offline / dev fallback: preserve client state
      }
    };

    fetchHistoryData();
    return () => {
      isMounted = false;
    };
  }, [selectedYear]);

  // Registered players mapping + inclusion of server players
  const effectivePlayers = useMemo(() => {
    if (serverStats && serverStats.length > 0) {
      const existingIds = new Set(players.map((p) => p.id));
      const extraPlayers: typeof players = [];
      serverStats.forEach((s) => {
        if (s.player && !existingIds.has(s.playerId)) {
          const parts = (s.player.name || '').trim().split(' ');
          extraPlayers.push({
            id: s.player.id,
            firstName: parts[0] || 'Jugador',
            lastName: parts.slice(1).join(' '),
            createdAt: s.player.createdAt ? new Date(s.player.createdAt).toISOString() : new Date().toISOString(),
          });
        }
      });
      return [...players, ...extraPlayers];
    }
    return players;
  }, [players, serverStats]);

  const playersMap = useMemo(
    () => new Map(effectivePlayers.map((p) => [p.id, p])),
    [effectivePlayers]
  );

  // General Standings rows (RF-34)
  const effectiveStats = useMemo(() => {
    if (serverStats && serverStats.length > 0) {
      const map: Record<PlayerId, PlayerStats> = {};
      serverStats.forEach((s) => {
        map[s.playerId] = {
          playerId: s.playerId,
          pts: s.points,
          pj: s.matchesPlayed,
          pg: s.matchesWon,
          pp: s.matchesLost,
          gf: s.goalsFor,
          gc: s.goalsAgainst,
          tj: (s.yellowCards || 0) + (s.redCards || 0),
          yellowCards: s.yellowCards,
          redCards: s.redCards,
          podiums: s.podiums,
        };
      });
      return map;
    }
    return stats;
  }, [serverStats, stats]);

  const rows = useMemo(() => buildStandings(effectivePlayers, effectiveStats), [effectivePlayers, effectiveStats]);
  const totalTournaments = serverTournaments !== null ? serverTournaments.length : history.length;

  // Annual ranking for selected year (RF-78)
  const annualEntries: SortedAnnualRankingEntry[] = useMemo(() => {
    if (serverAnnual && serverAnnual.length > 0) {
      return serverAnnual.map((entry, index) => {
        const foundPlayer = playersMap.get(entry.playerId);
        const displayName = entry.player?.name ?? (foundPlayer ? formatPlayerName(foundPlayer) : 'Desconocido');
        return {
          rank: index + 1,
          playerId: entry.playerId,
          displayName,
          pts: entry.points,
          tournamentsPlayed: entry.tournamentsPlayed,
          championships: entry.podiums ? entry.podiums : 0,
          runnerUps: 0,
          thirdPlaces: 0,
          fourthPlaces: 0,
          podiums: entry.podiums ?? 0,
          yellowCards: entry.yellowCards ?? 0,
          redCards: entry.redCards ?? 0,
        };
      });
    }
    const storedForYear = annualRankings?.[selectedYear];
    const computedForYear = storedForYear ?? computeAnnualRanking(history, selectedYear);
    return getSortedAnnualRanking(computedForYear, effectivePlayers);
  }, [serverAnnual, annualRankings, selectedYear, history, effectivePlayers, playersMap]);

  // H2H state (RF-76)
  const [h2hPlayerA, setH2hPlayerA] = useState<PlayerId>(players[0]?.id ?? '');
  const [h2hPlayerB, setH2hPlayerB] = useState<PlayerId>(players[1]?.id ?? '');

  const handleSwapH2H = () => {
    setH2hPlayerA(h2hPlayerB);
    setH2hPlayerB(h2hPlayerA);
  };

  const effectiveH2H = useMemo(() => {
    if (serverH2H && serverH2H.length > 0) {
      const map: Record<string, any> = {};
      serverH2H.forEach((r) => {
        const key = `${r.playerAId}__vs__${r.playerBId}`;
        map[key] = {
          playerA: r.playerAId,
          playerB: r.playerBId,
          matchesPlayed: r.matchesPlayed,
          winsA: r.winsA,
          winsB: r.winsB,
          draws: r.draws,
          goalsA: r.goalsA,
          goalsB: r.goalsB,
        };
      });
      return map;
    }
    return headToHead;
  }, [serverH2H, headToHead]);

  const h2hRecord = useMemo(() => {
    if (!h2hPlayerA || !h2hPlayerB || h2hPlayerA === h2hPlayerB) {
      return null;
    }
    return getHeadToHeadBetween(effectiveH2H, h2hPlayerA, h2hPlayerB);
  }, [effectiveH2H, h2hPlayerA, h2hPlayerB]);

  // Awards Leaderboard (RF-77)
  const activeMatches = useMemo(() => {
    if (!activeTournament) return [];
    return [
      ...(activeTournament.leagueMatches ?? []),
      ...(activeTournament.groupMatches ?? []),
      ...(activeTournament.series ?? []),
    ];
  }, [activeTournament]);

  const awards = useMemo(() => {
    return computePlayerAwards(effectivePlayers, activeMatches, history, effectiveStats);
  }, [effectivePlayers, activeMatches, history, effectiveStats]);

  const handleResetHistory = () => {
    const confirmed = window.confirm(
      '¿Seguro que querés resetear todo el historial de la tabla? Se borrarán todos los puntos, estadísticas acumuladas, registros H2H y resúmenes de torneos finalizados. Los jugadores registrados se mantendrán intactos.'
    );
    if (confirmed) {
      dispatch({ type: 'STANDINGS_RESET' });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 1. Selector de Pestañas (RF-79) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-display font-bold uppercase tracking-wider transition ${
              activeTab === 'general'
                ? 'border border-primary/60 bg-primary/20 text-primary shadow-[0_0_12px_rgba(74,222,128,0.25)]'
                : 'border border-transparent bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
            }`}
          >
            <Trophy className="h-4 w-4" />
            Tabla General
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('annual')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-display font-bold uppercase tracking-wider transition ${
              activeTab === 'annual'
                ? 'border border-accent/60 bg-accent/20 text-accent shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                : 'border border-transparent bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
            }`}
          >
            <Calendar className="h-4 w-4" />
            Ranking Anual
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('h2h')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-display font-bold uppercase tracking-wider transition ${
              activeTab === 'h2h'
                ? 'border border-amber-500/60 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.25)]'
                : 'border border-transparent bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
            }`}
          >
            <Swords className="h-4 w-4" />
            Duelos Directos (H2H)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('awards')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-display font-bold uppercase tracking-wider transition ${
              activeTab === 'awards'
                ? 'border border-emerald-500/60 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : 'border border-transparent bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
            }`}
          >
            <Medal className="h-4 w-4" />
            Vitrina de Premios
          </button>
        </div>

        {/* Botón de reseteo rápido en la pestaña general */}
        {activeTab === 'general' && (
          <DangerButton
            disabled={rows.length === 0 && totalTournaments === 0}
            onClick={handleResetHistory}
            title="Resetear tabla histórica"
            className="py-1.5 px-3 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Resetear Historial</span>
          </DangerButton>
        )}
      </div>

      {/* 2. PESTAÑA A: TABLA HISTÓRICA GENERAL (RF-34, RF-79) */}
      {activeTab === 'general' && (
        <Panel
          title="Tabla Histórica General"
          subtitle={
            totalTournaments === 0
              ? 'Sin torneos jugados'
              : totalTournaments === 1
              ? '1 torneo disputado'
              : `${totalTournaments} torneos disputados`
          }
        >
          {rows.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border p-12 text-center text-muted-foreground">
              <Users className="mx-auto mb-3 h-10 w-10 opacity-40 text-accent" />
              <p className="font-display text-lg font-bold uppercase tracking-wider text-foreground">
                Todavía no se jugó ningún torneo
              </p>
              <p className="mt-2 text-sm">
                Cargá los participantes, sorteá la temática y jugá el primer torneo para empezar a sumar puntos en el historial.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="py-3 pl-3 text-center w-14">Rank</th>
                    <th className="py-3 px-3">JUGADORES</th>
                    <th className="py-3 px-3 text-center">PTS</th>
                    <th className="py-3 px-2 text-center">PJ</th>
                    <th className="py-3 px-2 text-center">PG</th>
                    <th className="py-3 px-2 text-center">PP</th>
                    <th className="py-3 px-2 text-center">GF</th>
                    <th className="py-3 px-2 text-center">GC</th>
                    <th className="py-3 px-2 text-center">DG</th>
                    <th className="py-3 px-2 text-center">TJ</th>
                    <th className="py-3 px-2 text-center text-gold" title="Podios (1°, 2° o 3° puesto)">Podios</th>
                    <th className="py-3 px-2 text-center text-amber-400 font-bold" title="Tarjetas Amarillas">TA</th>
                    <th className="py-3 pr-3 text-center text-destructive font-bold" title="Tarjetas Rojas">TR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono text-sm">
                  {rows.map((r, index) => {
                    const isLeader = index === 0;

                    return (
                      <tr
                        key={r.playerId}
                        className={`transition ${
                          isLeader
                            ? 'bg-primary/10 shadow-[inset_0_0_15px_rgba(74,222,128,0.08)]'
                            : 'hover:bg-background/40'
                        }`}
                      >
                        <td className="py-3.5 pl-3 text-center font-display font-black text-accent text-base">
                          {r.rank}
                        </td>
                        <td className="py-3.5 px-3 font-sans font-semibold text-foreground text-base">
                          <div className="flex items-center gap-2">
                            <span>{r.displayName}</span>
                            {isLeader && (
                              <span title="Puntero del torneo">
                                <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-center font-display font-black text-primary text-lg">
                          {r.pts}
                        </td>
                        <td className="py-3.5 px-2 text-center text-foreground">{r.pj}</td>
                        <td className="py-3.5 px-2 text-center text-foreground font-semibold">{r.pg}</td>
                        <td className="py-3.5 px-2 text-center text-muted-foreground">{r.pp}</td>
                        <td className="py-3.5 px-2 text-center text-foreground">{r.gf}</td>
                        <td className="py-3.5 px-2 text-center text-muted-foreground">{r.gc}</td>
                        <td
                          className={`py-3.5 px-2 text-center font-bold ${
                            r.dg > 0
                              ? 'text-primary'
                              : r.dg < 0
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {r.dg > 0 ? `+${r.dg}` : r.dg}
                        </td>
                        <td className="py-3.5 px-2 text-center font-bold text-accent">{r.tj}</td>
                        <td className="py-3.5 px-2 text-center font-semibold text-gold">{r.podiums ?? 0}</td>
                        <td className="py-3.5 px-2 text-center font-bold text-amber-400">{r.yellowCards ?? 0}</td>
                        <td className="py-3.5 pr-3 text-center font-bold text-destructive">{r.redCards ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <p className="mt-6 text-xs uppercase tracking-widest text-muted-foreground/80 italic text-right">
                El segundo es el primero de los perdedores.
              </p>
            </div>
          )}
        </Panel>
      )}

      {/* 3. PESTAÑA B: RANKING ANUAL PONDERADO (RF-78, RF-79) */}
      {activeTab === 'annual' && (
        <Panel
          title={`Ranking Anual Ponderado (${selectedYear})`}
          subtitle="Puntuación escalada según la cantidad de participantes de cada torneo (N)"
        >
          {/* Selector de Año */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-accent" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Año Calendario:
              </span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="rounded-sm border border-border bg-card px-3 py-1 font-display text-sm font-bold text-foreground outline-none transition focus:border-accent"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-xs text-muted-foreground">
              {annualEntries.length} participante{annualEntries.length !== 1 ? 's' : ''} rankeado{annualEntries.length !== 1 ? 's' : ''}
            </span>
          </div>

          {annualEntries.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border p-12 text-center text-muted-foreground">
              <Calendar className="mx-auto mb-3 h-10 w-10 opacity-40 text-accent" />
              <p className="font-display text-base font-bold uppercase tracking-wider text-foreground">
                Sin torneos en el año {selectedYear}
              </p>
              <p className="mt-2 text-xs">
                Completá torneos durante este año para ver cómo escala el ranking anual con el multiplicador N/4.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[650px]">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="py-3 pl-3 text-center w-14">Pos</th>
                    <th className="py-3 px-3">Participante</th>
                    <th className="py-3 px-3 text-center">PTS Ponderados</th>
                    <th className="py-3 px-2 text-center">TJ</th>
                    <th className="py-3 px-2 text-center">Títulos 🏆</th>
                    <th className="py-3 px-2 text-center">Subcampeón 🥈</th>
                    <th className="py-3 px-2 text-center text-gold">Podios 🥉</th>
                    <th className="py-3 px-2 text-center text-amber-400 font-bold" title="Tarjetas Amarillas">TA</th>
                    <th className="py-3 pr-3 text-center text-destructive font-bold" title="Tarjetas Rojas">TR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono text-sm">
                  {annualEntries.map((r) => {
                    const isChampion = r.rank === 1;
                    const isRunnerUp = r.rank === 2;

                    return (
                      <tr
                        key={r.playerId}
                        className={`transition ${
                          isChampion
                            ? 'bg-primary/10 shadow-[inset_0_0_15px_rgba(74,222,128,0.08)]'
                            : isRunnerUp
                            ? 'bg-accent/5'
                            : 'hover:bg-background/40'
                        }`}
                      >
                        <td className="py-3.5 pl-3 text-center font-display font-black text-base">
                          <span
                            className={
                              isChampion
                                ? 'text-primary glow-green'
                                : isRunnerUp
                                ? 'text-accent'
                                : 'text-muted-foreground'
                            }
                          >
                            {r.rank}°
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-sans font-semibold text-foreground text-base">
                          <div className="flex items-center gap-2">
                            <span>{r.displayName}</span>
                            {isChampion && (
                              <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-center font-display font-black text-primary text-lg">
                          {Number.isInteger(r.pts) ? r.pts : r.pts.toFixed(1)}
                        </td>
                        <td className="py-3.5 px-2 text-center text-foreground font-semibold">
                          {r.tournamentsPlayed}
                        </td>
                        <td className="py-3.5 px-2 text-center text-gold font-bold">
                          {r.championships > 0 ? `${r.championships} 🥇` : '0'}
                        </td>
                        <td className="py-3.5 px-2 text-center text-accent font-semibold">
                          {r.runnerUps > 0 ? `${r.runnerUps} 🥈` : '0'}
                        </td>
                        <td className="py-3.5 px-2 text-center text-gold font-semibold">
                          {r.podiums ?? ((r.championships || 0) + (r.runnerUps || 0) + (r.thirdPlaces || 0))}
                        </td>
                        <td className="py-3.5 px-2 text-center text-amber-400 font-bold">
                          {r.yellowCards ?? 0}
                        </td>
                        <td className="py-3.5 pr-3 text-center text-destructive font-bold">
                          {r.redCards ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-6 rounded border border-border/60 bg-secondary/20 p-3 text-xs text-muted-foreground leading-relaxed">
                <span className="font-bold text-foreground">Regla de ponderación (RF-78):</span> En torneos de mayor concurrencia (N), el mérito es mayor. La escala aplica el multiplicador <strong className="text-accent font-mono">N/4</strong>: Campeón (10 × N/4), Subcampeón (7 × N/4), 3er Puesto (5 × N/4), 4to Puesto (3 × N/4) y participación general (+1 pt).
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* 4. PESTAÑA C: DUELOS DIRECTOS (H2H) (RF-76, RF-79) */}
      {activeTab === 'h2h' && (
        <Panel
          title="Duelos Directos Cara a Cara (Head to Head)"
          subtitle="Historial acumulado de enfrentamientos directos entre jugadores registrados"
        >
          {players.length < 2 ? (
            <div className="rounded-sm border border-dashed border-border p-12 text-center text-muted-foreground">
              <Swords className="mx-auto mb-3 h-10 w-10 opacity-40 text-accent" />
              <p className="font-display text-base font-bold uppercase tracking-wider text-foreground">
                Se necesitan al menos 2 jugadores registrados
              </p>
              <p className="mt-2 text-xs">
                Registrá más jugadores en el panel de inicio para habilitar el selector de duelos cara a cara.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selectores de Jugadores */}
              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-5">
                {/* Jugador A */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Jugador 1
                  </label>
                  <select
                    value={h2hPlayerA}
                    onChange={(e) => setH2hPlayerA(e.target.value)}
                    className="w-full rounded-sm border border-border bg-card px-3 py-2 font-sans font-semibold text-foreground outline-none transition focus:border-accent"
                  >
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatPlayerName(p)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Botón de Intercambio (Swap) */}
                <div className="flex justify-center sm:col-span-1">
                  <SecondaryButton
                    onClick={handleSwapH2H}
                    title="Invertir jugadores"
                    className="h-10 w-10 p-0"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </SecondaryButton>
                </div>

                {/* Jugador B */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Jugador 2
                  </label>
                  <select
                    value={h2hPlayerB}
                    onChange={(e) => setH2hPlayerB(e.target.value)}
                    className="w-full rounded-sm border border-border bg-card px-3 py-2 font-sans font-semibold text-foreground outline-none transition focus:border-accent"
                  >
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatPlayerName(p)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Showdown Visual */}
              {h2hPlayerA === h2hPlayerB ? (
                <div className="rounded-sm border border-border/60 bg-secondary/20 p-8 text-center text-muted-foreground text-sm">
                  Seleccioná dos jugadores diferentes para ver su historial cara a cara.
                </div>
              ) : !h2hRecord || h2hRecord.played === 0 ? (
                <div className="rounded-sm border border-dashed border-border p-10 text-center text-muted-foreground">
                  <Swords className="mx-auto mb-2 h-8 w-8 opacity-30 text-accent" />
                  <p className="font-display text-base font-bold uppercase tracking-wider text-foreground">
                    Sin enfrentamientos registrados
                  </p>
                  <p className="mt-1 text-xs">
                    {playersMap.get(h2hPlayerA)?.firstName ?? 'Jugador 1'} y{' '}
                    {playersMap.get(h2hPlayerB)?.firstName ?? 'Jugador 2'} todavía no se cruzaron en torneos finalizados.
                  </p>
                </div>
              ) : (
                (() => {
                  const pAName = playersMap.get(h2hPlayerA)
                    ? formatPlayerName(playersMap.get(h2hPlayerA)!)
                    : 'Jugador 1';
                  const pBName = playersMap.get(h2hPlayerB)
                    ? formatPlayerName(playersMap.get(h2hPlayerB)!)
                    : 'Jugador 2';

                  const isCanonicalA = h2hRecord.playerA === h2hPlayerA;
                  const winsA = isCanonicalA ? h2hRecord.winsA : h2hRecord.winsB;
                  const winsB = isCanonicalA ? h2hRecord.winsB : h2hRecord.winsA;
                  const goalsA = isCanonicalA ? h2hRecord.goalsA : h2hRecord.goalsB;
                  const goalsB = isCanonicalA ? h2hRecord.goalsB : h2hRecord.goalsA;
                  const draws = h2hRecord.draws;
                  const played = h2hRecord.played;

                  const pctA = played > 0 ? (winsA / played) * 100 : 0;
                  const pctDraw = played > 0 ? (draws / played) * 100 : 0;
                  const pctB = played > 0 ? (winsB / played) * 100 : 0;

                  return (
                    <div className="space-y-6 rounded-md border border-border bg-card/60 p-6 shadow-lg">
                      {/* Cabecera del Choque */}
                      <div className="grid grid-cols-3 items-center text-center">
                        <div>
                          <p className="font-display text-lg font-bold text-primary truncate">
                            {pAName}
                          </p>
                          <p className="font-display text-3xl font-black text-foreground mt-1">
                            {winsA}
                          </p>
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            Victorias
                          </span>
                        </div>

                        <div className="border-x border-border/60 px-4">
                          <p className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Partidos
                          </p>
                          <p className="font-display text-2xl font-black text-accent mt-1">
                            {played}
                          </p>
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            {draws} empate{draws !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div>
                          <p className="font-display text-lg font-bold text-accent truncate">
                            {pBName}
                          </p>
                          <p className="font-display text-3xl font-black text-foreground mt-1">
                            {winsB}
                          </p>
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            Victorias
                          </span>
                        </div>
                      </div>

                      {/* Barra Visual Proporcional */}
                      <div className="h-3 w-full overflow-hidden rounded-full bg-secondary/80 flex">
                        {pctA > 0 && (
                          <div
                            style={{ width: `${pctA}%` }}
                            className="bg-primary transition-all duration-500 shadow-[0_0_8px_rgba(74,222,128,0.5)]"
                            title={`${pAName}: ${winsA} victoria(s) (${pctA.toFixed(0)}%)`}
                          />
                        )}
                        {pctDraw > 0 && (
                          <div
                            style={{ width: `${pctDraw}%` }}
                            className="bg-amber-400/80 transition-all duration-500"
                            title={`Empates: ${draws} (${pctDraw.toFixed(0)}%)`}
                          />
                        )}
                        {pctB > 0 && (
                          <div
                            style={{ width: `${pctB}%` }}
                            className="bg-accent transition-all duration-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                            title={`${pBName}: ${winsB} victoria(s) (${pctB.toFixed(0)}%)`}
                          />
                        )}
                      </div>

                      {/* Estadísticas detalladas cara a cara */}
                      <div className="grid grid-cols-1 gap-3 pt-2 font-mono sm:grid-cols-3">
                        <div className="rounded border border-border/40 bg-secondary/20 p-3 text-center">
                          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wider">
                            Goles a favor
                          </p>
                          <p className="mt-1 text-base font-bold text-foreground">
                            <span className="text-primary">{goalsA}</span> —{' '}
                            <span className="text-accent">{goalsB}</span>
                          </p>
                        </div>

                        <div className="rounded border border-border/40 bg-secondary/20 p-3 text-center">
                          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wider">
                            Diferencia de gol
                          </p>
                          <p className="mt-1 text-base font-bold">
                            <span
                              className={
                                goalsA - goalsB > 0
                                  ? 'text-primary'
                                  : goalsA - goalsB < 0
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                              }
                            >
                              {goalsA - goalsB > 0
                                ? `+${goalsA - goalsB}`
                                : goalsA - goalsB}
                            </span>
                          </p>
                        </div>

                        <div className="rounded border border-border/40 bg-secondary/20 p-3 text-center">
                          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wider">
                            Promedio de gol
                          </p>
                          <p className="mt-1 text-base font-bold text-foreground">
                            {(goalsA / played).toFixed(1)} vs{' '}
                            {(goalsB / played).toFixed(1)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </Panel>
      )}

      {/* 5. PESTAÑA D: VITRINA DE PREMIOS Y RÉCORDS (RF-77, RF-79) */}
      {activeTab === 'awards' && (
        <Panel
          title="Vitrina de Premios y Récords"
          subtitle="Distinciones individuales destacadas de la juntada histórica"
        >
          {awards.goldenBoot === null && awards.woodenSpoon === null && awards.cleanSheet === null ? (
            <div className="rounded-sm border border-dashed border-border p-12 text-center text-muted-foreground">
              <Medal className="mx-auto mb-3 h-10 w-10 opacity-40 text-accent" />
              <p className="font-display text-base font-bold uppercase tracking-wider text-foreground">
                Sin récords registrados todavía
              </p>
              <p className="mt-2 text-xs">
                Jugá torneos y confirmá partidos para que el sistema empiece a coronar a la Bota de Oro, la Madera y la Valla Invicta.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {/* 1. Bota de Oro (Golden Boot) */}
                <div className="flex flex-col justify-between rounded-md border-2 border-amber-500/60 bg-amber-950/20 p-5 shadow-[0_0_20px_rgba(251,191,36,0.15)]">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-amber-500/20 text-amber-400">
                        <Flame className="h-5 w-5" />
                      </span>
                      <span className="rounded-sm border border-amber-500/50 bg-amber-500/20 px-2 py-0.5 font-display text-[10px] font-black uppercase tracking-wider text-amber-300">
                        Goleador
                      </span>
                    </div>

                    <h4 className="mt-4 font-display text-base font-bold uppercase tracking-wider text-foreground">
                      Bota de Oro
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Máximo anotador histórico
                    </p>

                    <div className="my-4 border-y border-border/40 py-3">
                      <p className="text-lg font-bold text-foreground">
                        {awards.details?.goldenBoot?.displayName ?? '—'}
                      </p>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-display text-3xl font-black text-amber-400">
                          {awards.goldenBoot?.goals ?? 0}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          goles convertidos
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground italic">
                    {awards.details?.goldenBoot?.secondaryCount
                      ? `En ${awards.details.goldenBoot.secondaryCount} partidos disputados.`
                      : 'Líder en la red.'}
                  </p>
                </div>

                {/* 2. Premio de Madera (Wooden Spoon) */}
                <div className="flex flex-col justify-between rounded-md border-2 border-destructive/50 bg-destructive/10 p-5 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-destructive/20 text-destructive">
                        <TrendingDown className="h-5 w-5" />
                      </span>
                      <span className="rounded-sm border border-destructive/50 bg-destructive/20 px-2 py-0.5 font-display text-[10px] font-black uppercase tracking-wider text-destructive">
                        Peor Balance
                      </span>
                    </div>

                    <h4 className="mt-4 font-display text-base font-bold uppercase tracking-wider text-foreground">
                      Premio de Madera
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Mayor cantidad de derrotas
                    </p>

                    <div className="my-4 border-y border-border/40 py-3">
                      <p className="text-lg font-bold text-foreground">
                        {awards.details?.woodenSpoon?.displayName ?? '—'}
                      </p>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-display text-3xl font-black text-destructive">
                          {awards.woodenSpoon?.losses ?? 0}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          derrotas sufridas
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground italic">
                    {awards.details?.woodenSpoon?.secondaryCount !== undefined
                      ? `Diferencia de gol: ${awards.details.woodenSpoon.secondaryCount > 0 ? `+${awards.details.woodenSpoon.secondaryCount}` : awards.details.woodenSpoon.secondaryCount}.`
                      : 'Para el que no da pie con bola.'}
                  </p>
                </div>

                {/* 3. Valla Invicta (Clean Sheet) */}
                <div className="flex flex-col justify-between rounded-md border-2 border-emerald-500/60 bg-emerald-950/20 p-5 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-emerald-500/20 text-emerald-400">
                        <ShieldCheck className="h-5 w-5" />
                      </span>
                      <span className="rounded-sm border border-emerald-500/50 bg-emerald-500/20 px-2 py-0.5 font-display text-[10px] font-black uppercase tracking-wider text-emerald-300">
                        Candado
                      </span>
                    </div>

                    <h4 className="mt-4 font-display text-base font-bold uppercase tracking-wider text-foreground">
                      Valla Invicta
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Partidos con arco en cero
                    </p>

                    <div className="my-4 border-y border-border/40 py-3">
                      <p className="text-lg font-bold text-foreground">
                        {awards.details?.cleanSheet?.displayName ?? '—'}
                      </p>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-display text-3xl font-black text-emerald-400">
                          {awards.cleanSheet?.cleanSheets ?? 0}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          vallas invictas
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground italic">
                    {awards.details?.cleanSheet?.secondaryCount !== undefined
                      ? `${awards.details.cleanSheet.secondaryCount} goles recibidos en contra.`
                      : 'Muro infranqueable.'}
                  </p>
                </div>
              </div>

              {/* Banner de Récord */}
              <div className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/30 p-4 text-xs text-muted-foreground">
                <Sparkles className="h-5 w-5 text-accent shrink-0" />
                <p>
                  Las distinciones se actualizan automáticamente tras cada partido confirmado y torneo finalizado.
                </p>
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

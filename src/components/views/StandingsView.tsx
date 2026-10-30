import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  Calendar,
  CheckCircle,
  Flame,
  Loader2,
  Medal,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  TrendingDown,
  Trophy,
  Users,
} from 'lucide-react';
import {
  computeAnnualRanking,
  computePlayerAwards,
  getSortedAnnualRanking,
  type SortedAnnualRankingEntry,
} from '../../domain/awardsAndRankings';
import { formatPlayerName } from '../../domain/players';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { useAuth } from '../../context/AuthContext';
import { DangerButton, SecondaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';

type StandingsTab = 'annual' | 'profiles' | 'h2h' | 'awards';

export interface StandingsViewProps {
  onGoToLobby?: () => void;
}

export function StandingsView({ onGoToLobby: _onGoToLobby }: StandingsViewProps = {}) {
  const { players, history, annualRankings, activeTournament } =
    useAppState();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || (user as any)?.role === 'ADMIN';

  // 1. Selector de Pestañas (Default: 'annual')
  const [activeTab, setActiveTab] = useState<StandingsTab>('annual');

  // Server data state from /api/history/*
  const [serverPlayers, setServerPlayers] = useState<any[]>([]);
  const [serverAnnual, setServerAnnual] = useState<any[] | null>(null);
  const [serverTournaments, setServerTournaments] = useState<any[] | null>(null);

  // Available years for Annual Ranking (includes current year + past years + 'all' / Histórico)
  const currentCalendarYear = new Date().getFullYear().toString();
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    yearsSet.add(currentCalendarYear);
    if (annualRankings) {
      Object.keys(annualRankings).forEach((y) => yearsSet.add(y));
    }
    history.forEach((t) => {
      if (t.finishedAt) {
        yearsSet.add(new Date(t.finishedAt).getFullYear().toString());
      }
    });
    const sorted = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    return [...sorted, 'all'];
  }, [annualRankings, history, currentCalendarYear]);

  const [selectedYear, setSelectedYear] = useState<string>(currentCalendarYear);

  // Profile tab state
  const [selectedProfilePlayerId, setSelectedProfilePlayerId] = useState<string>('');
  const [playerProfileData, setPlayerProfileData] = useState<any | null>(null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);

  // H2H state
  const [h2hPlayerA, setH2hPlayerA] = useState<string>('');
  const [h2hPlayerB, setH2hPlayerB] = useState<string>('');
  const [detailedH2H, setDetailedH2H] = useState<any | null>(null);
  const [loadingH2H, setLoadingH2H] = useState<boolean>(false);

  // Reset state
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Fetch all basic history data from PostgreSQL
  const fetchHistoryData = async () => {
    try {
      const [playersRes, annualRes, tourneyRes] = await Promise.all([
        fetch('/api/history/players', { credentials: 'include' }).catch(() => null),
        fetch(`/api/history/annual?year=${selectedYear}`, { credentials: 'include' }).catch(() => null),
        fetch('/api/history/tournaments', { credentials: 'include' }).catch(() => null),
      ]);

      if (playersRes?.ok) {
        const data = await playersRes.json();
        if (Array.isArray(data.players) && data.players.length > 0) {
          setServerPlayers(data.players);
        }
      }
      if (annualRes?.ok) {
        const annualData = await annualRes.json();
        setServerAnnual(annualData.entries ?? annualData.ranking ?? annualData);
      }
      if (tourneyRes?.ok) {
        const tourneyData = await tourneyRes.json();
        setServerTournaments(tourneyData.tournaments ?? tourneyData);
      }
    } catch {
      // Offline fallback: preserve client state
    }
  };

  useEffect(() => {
    fetchHistoryData();
  }, [selectedYear]);

  // Combined players list: Prefer PostgreSQL registered players
  const effectivePlayers = useMemo(() => {
    if (serverPlayers && serverPlayers.length > 0) {
      return serverPlayers;
    }
    return players;
  }, [serverPlayers, players]);

  const playersMap = useMemo(
    () => new Map(effectivePlayers.map((p) => [p.id, p])),
    [effectivePlayers]
  );

  // Auto-initialize H2H and Profile selectors when players load
  useEffect(() => {
    if (effectivePlayers.length >= 2) {
      if (!h2hPlayerA || !effectivePlayers.some((p) => p.id === h2hPlayerA)) {
        setH2hPlayerA(effectivePlayers[0].id);
      }
      if (
        !h2hPlayerB ||
        !effectivePlayers.some((p) => p.id === h2hPlayerB) ||
        h2hPlayerB === effectivePlayers[0].id
      ) {
        setH2hPlayerB(effectivePlayers[1].id);
      }
    } else if (effectivePlayers.length === 1) {
      if (!h2hPlayerA) setH2hPlayerA(effectivePlayers[0].id);
    }

    if (!selectedProfilePlayerId && effectivePlayers.length > 0) {
      setSelectedProfilePlayerId(effectivePlayers[0].id);
    }
  }, [effectivePlayers, h2hPlayerA, h2hPlayerB, selectedProfilePlayerId]);

  // Fetch detailed H2H when players change
  useEffect(() => {
    if (!h2hPlayerA || !h2hPlayerB || h2hPlayerA === h2hPlayerB) {
      setDetailedH2H(null);
      return;
    }

    let isMounted = true;
    setLoadingH2H(true);
    fetch(`/api/history/h2h?playerA=${h2hPlayerA}&playerB=${h2hPlayerB}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data) {
          setDetailedH2H(data.record || data.records || data.h2h || data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingH2H(false);
      });

    return () => {
      isMounted = false;
    };
  }, [h2hPlayerA, h2hPlayerB]);

  // Fetch Player Profile when selectedProfilePlayerId changes
  useEffect(() => {
    if (!selectedProfilePlayerId) {
      setPlayerProfileData(null);
      return;
    }

    let isMounted = true;
    setLoadingProfile(true);
    fetch(`/api/history/profiles/${selectedProfilePlayerId}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data) {
          setPlayerProfileData(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingProfile(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedProfilePlayerId]);

  // Annual ranking entries for selected year (or 'all' for historical total)
  const annualEntries: SortedAnnualRankingEntry[] = useMemo(() => {
    if (serverAnnual && serverAnnual.length > 0) {
      return serverAnnual.map((entry, index) => {
        const foundPlayer = playersMap.get(entry.playerId);
        const displayName =
          entry.player
            ? `${entry.player.firstName} ${entry.player.lastName}`.trim()
            : foundPlayer
            ? formatPlayerName(foundPlayer)
            : 'Desconocido';

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

    if (selectedYear === 'all') {
      return [];
    }

    const storedForYear = annualRankings?.[selectedYear];
    const computedForYear = storedForYear ?? computeAnnualRanking(history, selectedYear);
    return getSortedAnnualRanking(computedForYear, effectivePlayers);
  }, [serverAnnual, annualRankings, selectedYear, history, effectivePlayers, playersMap]);

  // H2H swap
  const handleSwapH2H = () => {
    setH2hPlayerA(h2hPlayerB);
    setH2hPlayerB(h2hPlayerA);
  };

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
    return computePlayerAwards(effectivePlayers, activeMatches, history, {});
  }, [effectivePlayers, activeMatches, history]);

  // Admin Reset History Handler
  const handleResetHistory = async () => {
    const confirmed = window.confirm(
      '¿Seguro que querés resetear todo el historial de la tabla? Se vaciarán en PostgreSQL las estadísticas acumuladas, registros H2H, rankings anuales y torneos finalizados. Los jugadores registrados permanecerán intactos.'
    );
    if (!confirmed) return;

    try {
      setIsResetting(true);
      await fetch('/api/history/reset', {
        method: 'DELETE',
        credentials: 'include',
      });
      dispatch({ type: 'STANDINGS_RESET' });
      await fetchHistoryData();
      if (selectedProfilePlayerId) {
        setPlayerProfileData(null);
      }
      setDetailedH2H(null);
    } catch (err) {
      console.error('Error al resetear historial:', err);
    } finally {
      setIsResetting(false);
    }
  };

  const totalTournaments =
    serverTournaments !== null ? serverTournaments.length : history.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 1. Selector de Pestañas Limpias (Annual, Perfiles, H2H, Premios) + Botón Reset Admin */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-3">
        <div className="flex flex-wrap items-center gap-2">
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
            Tabla Anual
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profiles')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-display font-bold uppercase tracking-wider transition ${
              activeTab === 'profiles'
                ? 'border border-primary/60 bg-primary/20 text-primary shadow-[0_0_12px_rgba(74,222,128,0.25)]'
                : 'border border-transparent bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
            }`}
          >
            <Users className="h-4 w-4" />
            Perfiles
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

        {/* Botón de Reset exclusivo para Administrador */}
        {isAdmin && (
          <div>
            <DangerButton
              disabled={isResetting || (annualEntries.length === 0 && totalTournaments === 0)}
              onClick={handleResetHistory}
              title="Resetear tabla histórica en PostgreSQL (Solo Admin)"
              className="py-1.5 px-3 text-xs"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span>Resetear Historial</span>
            </DangerButton>
          </div>
        )}
      </div>

      {/* 2. PESTAÑA 1: TABLA ANUAL PONDERADA (RF-78, RF-79) */}
      {activeTab === 'annual' && (
        <Panel
          title={
            selectedYear === 'all'
              ? 'Ranking Histórico Acumulado (Todos los Años)'
              : `Ranking Anual Ponderado (${selectedYear})`
          }
          subtitle="Puntuación escalada según la cantidad de participantes de cada torneo (N)"
        >
          {/* Selector de Año con opción Histórico */}
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
                    {year === 'all' ? 'Histórico / Todos los años' : year}
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
                {selectedYear === 'all' ? 'Sin torneos registrados en el historial' : `Sin torneos en el año ${selectedYear}`}
              </p>
              <p className="mt-2 text-xs">
                Completá torneos para ver cómo escala el ranking anual con el multiplicador N/4.
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
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProfilePlayerId(r.playerId);
                              setActiveTab('profiles');
                            }}
                            className="flex items-center gap-2 text-left hover:text-accent transition group"
                            title="Ver perfil completo de este jugador"
                          >
                            <span className="group-hover:underline">{r.displayName}</span>
                            {isChampion && (
                              <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />
                            )}
                          </button>
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

      {/* 3. PESTAÑA 2: PERFILES DE JUGADORES (T47) */}
      {activeTab === 'profiles' && (
        <Panel
          title="Ficha y Perfil del Jugador"
          subtitle="Trayectoria completa, efectividad en mano a mano y rendimiento por equipos"
        >
          {effectivePlayers.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border p-12 text-center text-muted-foreground">
              <Users className="mx-auto mb-3 h-10 w-10 opacity-40 text-accent" />
              <p className="font-display text-base font-bold uppercase tracking-wider text-foreground">
                No hay jugadores registrados
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selector de Jugador */}
              <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-accent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Seleccionar Jugador:
                  </span>
                  <select
                    value={selectedProfilePlayerId}
                    onChange={(e) => setSelectedProfilePlayerId(e.target.value)}
                    className="rounded-sm border border-border bg-card px-3 py-1.5 font-sans font-bold text-foreground outline-none transition focus:border-accent"
                  >
                    {effectivePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName ? `${p.firstName} ${p.lastName}` : formatPlayerName(p)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loadingProfile ? (
                <div className="flex items-center justify-center p-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                  <span className="ml-2 text-sm">Cargando perfil...</span>
                </div>
              ) : !playerProfileData ? (
                <div className="rounded-sm border border-dashed border-border p-10 text-center text-muted-foreground text-sm">
                  Seleccioná un jugador para consultar su ficha técnica.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Cabecera del Jugador y Estado Disciplinario */}
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-secondary/30 p-4">
                    <div>
                      <h3 className="font-display text-2xl font-black text-foreground">
                        {playerProfileData.player.firstName} {playerProfileData.player.lastName}
                      </h3>
                      <p className="text-xs text-muted-foreground">Ficha Oficial del Jugador</p>
                    </div>

                    {/* Estado Disciplinario Actual */}
                    <div className="text-right">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Estado Disciplinario Actual
                      </div>
                      {playerProfileData.discipline.suspendedDates > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded border border-destructive/60 bg-destructive/20 px-3 py-1 text-xs font-bold text-destructive animate-pulse">
                          <ShieldAlert className="h-4 w-4 shrink-0" />
                          {playerProfileData.discipline.statusText}
                        </span>
                      ) : playerProfileData.discipline.pendingYellowCards > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300">
                          {playerProfileData.discipline.statusText}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded border border-primary/50 bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                          <CheckCircle className="h-4 w-4 shrink-0" />
                          Limpio / Sin tarjetas pendientes
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bloque 1: Resumen de Carrera (Career Summary) */}
                  <div>
                    <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Trophy className="h-4 w-4 text-gold" /> Resumen de Carrera
                    </h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono">
                      <div className="rounded border border-border/50 bg-card/60 p-3 text-center">
                        <span className="block text-xs font-sans text-muted-foreground uppercase">Torneos</span>
                        <span className="text-2xl font-black text-foreground">{playerProfileData.career.tournamentsPlayed}</span>
                      </div>
                      <div className="rounded border border-gold/40 bg-gold/10 p-3 text-center">
                        <span className="block text-xs font-sans text-gold uppercase font-bold">Títulos 🏆</span>
                        <span className="text-2xl font-black text-gold">{playerProfileData.career.titles}</span>
                      </div>
                      <div className="rounded border border-accent/40 bg-accent/10 p-3 text-center">
                        <span className="block text-xs font-sans text-accent uppercase font-bold">Podios (Top 3)</span>
                        <span className="text-2xl font-black text-accent">{playerProfileData.career.podiums}</span>
                      </div>
                      <div className="rounded border border-primary/40 bg-primary/10 p-3 text-center">
                        <span className="block text-xs font-sans text-primary uppercase font-bold">% Efectividad</span>
                        <span className="text-2xl font-black text-primary">{playerProfileData.career.effectivenessPct}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Bloque 2: Especialista en Mano a Mano (Knockouts & Penales) */}
                  <div className="rounded-md border border-amber-500/40 bg-amber-950/15 p-4 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <Swords className="h-4 w-4 text-amber-400" /> Especialista en Mano a Mano y Definiciones
                    </h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="rounded border border-border/50 bg-background/50 p-3 space-y-1">
                        <p className="text-xs font-sans font-semibold text-muted-foreground uppercase">
                          Series Eliminatorias Disputadas
                        </p>
                        <div className="flex items-baseline justify-between pt-1">
                          <span className="font-mono text-2xl font-black text-foreground">
                            {playerProfileData.manoAMano.seriesWon} / {playerProfileData.manoAMano.seriesPlayed}
                          </span>
                          <span className="font-mono text-sm font-bold text-primary">
                            {playerProfileData.manoAMano.seriesEffectivenessPct}% eficacia
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground pt-1">
                          Pasó de ronda o salió campeón en {playerProfileData.manoAMano.seriesWon} de {playerProfileData.manoAMano.seriesPlayed} llaves.
                        </p>
                      </div>

                      <div className="rounded border border-border/50 bg-background/50 p-3 space-y-1">
                        <p className="text-xs font-sans font-semibold text-muted-foreground uppercase">
                          Tandas de Penales
                        </p>
                        <div className="flex items-baseline justify-between pt-1">
                          <span className="font-mono text-2xl font-black text-foreground">
                            {playerProfileData.manoAMano.penaltiesWon} / {playerProfileData.manoAMano.penaltiesPlayed}
                          </span>
                          <span className="font-mono text-sm font-bold text-accent">
                            {playerProfileData.manoAMano.penaltiesEffectivenessPct}% eficacia
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground pt-1">
                          Ganó {playerProfileData.manoAMano.penaltiesWon} de {playerProfileData.manoAMano.penaltiesPlayed} definiciones desde los 12 pasos.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bloque 3: Estadísticas Totales de Partidos y Disciplina */}
                  <div>
                    <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Target className="h-4 w-4 text-accent" /> Partidos Disputados y Disciplina Histórica
                    </h4>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 font-mono text-center">
                      <div className="rounded border border-border/40 bg-card p-2.5">
                        <span className="block text-[11px] font-sans text-muted-foreground uppercase">PJ</span>
                        <span className="text-lg font-bold text-foreground">{playerProfileData.stats.pj}</span>
                      </div>
                      <div className="rounded border border-border/40 bg-card p-2.5">
                        <span className="block text-[11px] font-sans text-muted-foreground uppercase">PG</span>
                        <span className="text-lg font-bold text-primary">{playerProfileData.stats.pg}</span>
                      </div>
                      <div className="rounded border border-border/40 bg-card p-2.5">
                        <span className="block text-[11px] font-sans text-muted-foreground uppercase">PE</span>
                        <span className="text-lg font-bold text-muted-foreground">{playerProfileData.stats.pe}</span>
                      </div>
                      <div className="rounded border border-border/40 bg-card p-2.5">
                        <span className="block text-[11px] font-sans text-muted-foreground uppercase">PP</span>
                        <span className="text-lg font-bold text-destructive">{playerProfileData.stats.pp}</span>
                      </div>
                      <div className="rounded border border-border/40 bg-card p-2.5">
                        <span className="block text-[11px] font-sans text-muted-foreground uppercase">GF / GC</span>
                        <span className="text-sm font-bold text-foreground">
                          {playerProfileData.stats.gf} - {playerProfileData.stats.gc}
                        </span>
                      </div>
                      <div className="rounded border border-border/40 bg-card p-2.5">
                        <span className="block text-[11px] font-sans text-muted-foreground uppercase">Tarjetas</span>
                        <span className="text-sm font-bold text-foreground">
                          <span className="text-amber-400">🟨 {playerProfileData.stats.yellowCards}</span> /{' '}
                          <span className="text-destructive">🟥 {playerProfileData.stats.redCards}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bloque 4: Equipos Usados y Rendimiento */}
                  <div>
                    <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Award className="h-4 w-4 text-primary" /> Equipos con los que Jugó
                    </h4>
                    {playerProfileData.teamsUsed.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Sin torneos finalizados todavía.</p>
                    ) : (
                      <div className="divide-y divide-border/40 rounded border border-border/60 bg-card/50 overflow-hidden">
                        {playerProfileData.teamsUsed.map((t: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 text-sm hover:bg-background/40 transition"
                          >
                            <div>
                              <p className="font-semibold text-foreground">{t.teamName}</p>
                              <p className="text-xs text-muted-foreground">
                                {t.tournamentName} • {new Date(t.tournamentDate).toLocaleDateString()}
                              </p>
                            </div>
                            <span
                              className={`rounded px-2.5 py-0.5 text-xs font-bold font-display uppercase tracking-wider ${
                                t.isChampion
                                  ? 'border border-gold/50 bg-gold/20 text-gold glow-green'
                                  : 'border border-border/60 bg-secondary/40 text-foreground'
                              }`}
                            >
                              {t.placement}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* 4. PESTAÑA 3: DUELOS DIRECTOS (H2H) (RF-76, RF-79, T47) */}
      {activeTab === 'h2h' && (
        <Panel
          title="Duelos Directos Cara a Cara (Head to Head)"
          subtitle="Historial acumulado de partidos, series eliminatorias y tandas de penales"
        >
          {effectivePlayers.length < 2 ? (
            <div className="rounded-sm border border-dashed border-border p-12 text-center text-muted-foreground">
              <Swords className="mx-auto mb-3 h-10 w-10 opacity-40 text-accent" />
              <p className="font-display text-base font-bold uppercase tracking-wider text-foreground">
                Se necesitan al menos 2 jugadores registrados
              </p>
              <p className="mt-2 text-xs">
                Registrá más jugadores en el lobby o base de datos para habilitar el comparador mano a mano.
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
                    {effectivePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName ? `${p.firstName} ${p.lastName}` : formatPlayerName(p)}
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
                    {effectivePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName ? `${p.firstName} ${p.lastName}` : formatPlayerName(p)}
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
              ) : loadingH2H ? (
                <div className="flex items-center justify-center p-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                  <span className="ml-2 text-sm">Cargando duelo directo...</span>
                </div>
              ) : !detailedH2H || (detailedH2H.matchesPlayed === 0 && detailedH2H.seriesPlayed === 0) ? (
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
                  const pA = playersMap.get(h2hPlayerA);
                  const pB = playersMap.get(h2hPlayerB);
                  const pAName = pA ? `${pA.firstName} ${pA.lastName}`.trim() : 'Jugador 1';
                  const pBName = pB ? `${pB.firstName} ${pB.lastName}`.trim() : 'Jugador 2';

                  const winsA = detailedH2H.winsA ?? 0;
                  const winsB = detailedH2H.winsB ?? 0;
                  const draws = detailedH2H.draws ?? 0;
                  const played = detailedH2H.matchesPlayed ?? (winsA + winsB + draws);
                  const goalsA = detailedH2H.goalsA ?? 0;
                  const goalsB = detailedH2H.goalsB ?? 0;

                  const pctA = played > 0 ? (winsA / played) * 100 : 0;
                  const pctDraw = played > 0 ? (draws / played) * 100 : 0;
                  const pctB = played > 0 ? (winsB / played) * 100 : 0;

                  const seriesPlayed = detailedH2H.seriesPlayed ?? 0;
                  const seriesWonA = detailedH2H.seriesWonA ?? 0;
                  const seriesWonB = detailedH2H.seriesWonB ?? 0;

                  const penPlayed = detailedH2H.penaltiesPlayed ?? 0;
                  const penWonA = detailedH2H.penaltiesWonA ?? 0;
                  const penWonB = detailedH2H.penaltiesWonB ?? 0;

                  const encounters: any[] = detailedH2H.encountersHistory ?? [];

                  return (
                    <div className="space-y-6">
                      {/* Bloque 1: Historial de Partidos Totales */}
                      <div className="rounded-md border border-border bg-card/60 p-6 shadow-lg space-y-6">
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
                              Partidos Totales
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

                        {/* Estadísticas detalladas de goles */}
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
                              {played > 0 ? (goalsA / played).toFixed(1) : '0.0'} vs{' '}
                              {played > 0 ? (goalsB / played).toFixed(1) : '0.0'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Bloque 2: Paternidad en Mano a Mano (Cruces Eliminatorios Directos y Penales) */}
                      <div className="rounded-md border-2 border-amber-500/50 bg-amber-950/20 p-5 shadow-lg space-y-4">
                        <div className="flex items-center gap-2">
                          <Swords className="h-5 w-5 text-amber-400" />
                          <h4 className="font-display text-base font-bold uppercase tracking-wider text-amber-300">
                            Paternidad en Cruces Mano a Mano y Penales
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="rounded border border-border/60 bg-background/60 p-4 space-y-1">
                            <p className="text-xs uppercase font-sans font-bold text-muted-foreground">
                              Cruces Eliminatorios Directos
                            </p>
                            <p className="text-lg font-bold text-foreground pt-1">
                              <span className="text-primary">{pAName}</span> pasó{' '}
                              <strong className="text-primary font-mono text-xl">{seriesWonA}</strong> veces —{' '}
                              <span className="text-accent">{pBName}</span> pasó{' '}
                              <strong className="text-accent font-mono text-xl">{seriesWonB}</strong> veces
                            </p>
                            <p className="text-xs text-muted-foreground pt-1">
                              En {seriesPlayed} llave{seriesPlayed !== 1 ? 's' : ''} disputada{seriesPlayed !== 1 ? 's' : ''} entre sí (Llaves, Doble Eliminación o Playoffs).
                            </p>
                          </div>

                          <div className="rounded border border-border/60 bg-background/60 p-4 space-y-1">
                            <p className="text-xs uppercase font-sans font-bold text-muted-foreground">
                              Definiciones por Penales entre Sí
                            </p>
                            <p className="text-lg font-bold text-foreground pt-1">
                              <span className="text-primary">{pAName}</span>{' '}
                              <strong className="text-primary font-mono text-xl">{penWonA}</strong> a{' '}
                              <strong className="text-accent font-mono text-xl">{penWonB}</strong>{' '}
                              <span className="text-accent">{pBName}</span>
                            </p>
                            <p className="text-xs text-muted-foreground pt-1">
                              En {penPlayed} tanda{penPlayed !== 1 ? 's' : ''} desde los 12 pasos.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Bloque 3: Tabla / Lista Cronológica de Enfrentamientos */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-accent" /> Historial de Partidos y Cruces
                        </h4>

                        {encounters.length === 0 ? (
                          <div className="rounded border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                            Sin cruces detallados cargados.
                          </div>
                        ) : (
                          <div className="divide-y divide-border/40 rounded border border-border/60 bg-card/60 overflow-hidden">
                            {encounters.map((enc: any, i: number) => {
                              const wonA = enc.winnerPlayerId === h2hPlayerA;
                              const wonB = enc.winnerPlayerId === h2hPlayerB;

                              return (
                                <div
                                  key={i}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 hover:bg-background/40 transition text-sm"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="rounded bg-secondary/80 px-2 py-0.5 text-[10px] font-bold font-display uppercase tracking-wider text-accent border border-border/60">
                                        {enc.stage}
                                      </span>
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {enc.tournamentName} • {new Date(enc.tournamentDate).toLocaleDateString()}
                                      </span>
                                    </div>
                                    <p className="mt-1 font-semibold text-foreground">
                                      <span className={wonA ? 'text-primary font-bold' : ''}>
                                        {pAName} ({enc.teamA})
                                      </span>{' '}
                                      <span className="text-muted-foreground font-normal">vs</span>{' '}
                                      <span className={wonB ? 'text-accent font-bold' : ''}>
                                        {pBName} ({enc.teamB})
                                      </span>
                                    </p>
                                    {enc.penaltiesText && (
                                      <p className="text-xs text-gold font-medium mt-0.5">
                                        {enc.penaltiesText}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 self-end sm:self-center">
                                    <span className="font-mono font-bold text-base text-foreground">
                                      {enc.scoreText}
                                    </span>
                                    <span
                                      className={`rounded px-2 py-0.5 text-xs font-bold font-display uppercase tracking-wider ${
                                        wonA
                                          ? 'border border-primary/50 bg-primary/20 text-primary'
                                          : wonB
                                          ? 'border border-accent/50 bg-accent/20 text-accent'
                                          : 'border border-border bg-secondary/40 text-muted-foreground'
                                      }`}
                                    >
                                      {enc.outcomeBadge}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </Panel>
      )}

      {/* 5. PESTAÑA 4: VITRINA DE PREMIOS Y RÉCORDS (RF-77, RF-79) */}
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

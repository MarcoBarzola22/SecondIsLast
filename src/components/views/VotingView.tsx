import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Trophy,
  Dices,
  Shuffle,
  Users,
  Layers,
  ListOrdered,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useCountdown } from '../../hooks/useCountdown';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { PrimaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';

export interface VoteEndedPayload {
  phase: 'FORMAT' | 'THEME';
  winner: string;
  matchFormat?: 'SINGLE_MATCH' | 'TWO_LEGGED' | string;
  wasDraw: boolean;
  tiedOptions?: string[];
  voteCounts: Record<string, number>;
}

export interface VotingViewProps {
  tournamentId?: string;
  initialExpiresAt?: string | null;
  initialOptions?: string[];
  initialTotalVoters?: number;
  onProceedNext?: () => void;
}

interface FormatMeta {
  title: string;
  badge: string;
  description: string;
  icon: typeof Trophy;
}

const FORMAT_METADATA: Record<string, FormatMeta> = {
  bracket: {
    title: 'Llaves Eliminatorias',
    badge: 'Playoffs Directos',
    description: 'Cruces mano a mano a partido único o ida y vuelta hasta la gran final.',
    icon: Trophy,
  },
  league: {
    title: 'Liga Todos contra Todos',
    badge: 'Formato Campeonato',
    description: 'Cada participante se enfrenta a todos los demás. La regularidad define al campeón.',
    icon: ListOrdered,
  },
  league_playoffs: {
    title: 'Liga + Reducido',
    badge: 'Fase Regular + Reducido',
    description: 'Fase clasificatoria por puntos y playoffs eliminatorios entre los mejores clasificados.',
    icon: Shuffle,
  },
  double_elimination: {
    title: 'Doble Eliminación',
    badge: 'Cuadro Ganadores/Perdedores',
    description: 'Nadie queda eliminado con una sola derrota. Brackets paralelos de alta tensión.',
    icon: Dices,
  },
  group_stage: {
    title: 'Fase de Grupos + Llaves',
    badge: 'Grupos y Reducido',
    description: 'Dos o más grupos con avance a semifinales/final. (Disponible solo para 6 y 9 jugadores).',
    icon: Layers,
  },
  random: {
    title: '🎲 Sortear Formato al Azar',
    badge: 'Ruleta Rápida',
    description: 'La máquina elige al azar un formato matemáticamente válido para la cantidad de pibes presentes.',
    icon: Dices,
  },
};

export function VotingView({
  tournamentId,
  initialExpiresAt = null,
  initialOptions = ['bracket', 'league', 'league_playoffs', 'double_elimination'],
  initialTotalVoters = 4,
  onProceedNext: _onProceedNext,
}: VotingViewProps) {
  const { isAuthenticated } = useAuth();
  const { socket, isConnected } = useSocket();
  const { isOffline } = useNetworkStatus();

  const [phase, setPhase] = useState<'FORMAT' | 'THEME'>('FORMAT');
  const [options, setOptions] = useState<string[]>(initialOptions);
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt);
  const [votesCast, setVotesCast] = useState<number>(0);
  const [totalVoters, setTotalVoters] = useState<number>(initialTotalVoters);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [selectedMatchFormat, setSelectedMatchFormat] = useState<'SINGLE_MATCH' | 'TWO_LEGGED'>('SINGLE_MATCH');
  const [isVoteConfirmed, setIsVoteConfirmed] = useState<boolean>(false);
  const [voteResult, setVoteResult] = useState<VoteEndedPayload | null>(null);
  const [isRouletteActive, setIsRouletteActive] = useState<boolean>(false);
  const [rouletteOption, setRouletteOption] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const countdown = useCountdown(expiresAt, 60);

  // Live Tiebreak / Random Roulette Animation (3.5 seconds with deceleration) (T41, T42)
  useEffect(() => {
    if (!voteResult) {
      setIsRouletteActive(false);
      return;
    }

    const totalVotes = Object.values(voteResult.voteCounts || {}).reduce((a, b) => a + b, 0);
    const isTieOrRandomOrZero =
      voteResult.wasDraw ||
      voteResult.winner.toLowerCase() === 'random' ||
      totalVotes === 0;

    if (isTieOrRandomOrZero) {
      setIsRouletteActive(true);
      const pool =
        voteResult.tiedOptions && voteResult.tiedOptions.length > 0
          ? voteResult.tiedOptions
          : options.length > 0
          ? options.filter((o) => o.toLowerCase() !== 'random')
          : phase === 'FORMAT'
          ? ['bracket', 'league', 'double_elimination']
          : ['world_cup_2026', 'champions_league', 'copa_libertadores'];

      const finalPool = pool.length > 0 ? pool : [voteResult.winner];
      setRouletteOption(finalPool[0] || voteResult.winner);

      let idx = 0;
      let active = true;
      const startTime = Date.now();
      let timeoutId: ReturnType<typeof setTimeout>;

      const tick = () => {
        if (!active) return;
        const elapsed = Date.now() - startTime;
        if (elapsed >= 3500) {
          setIsRouletteActive(false);
          return;
        }
        idx = (idx + 1) % finalPool.length;
        setRouletteOption(finalPool[idx]!);

        // Decelerate in the final 1100ms
        const delay = elapsed > 2400 ? 140 + Math.min(180, Math.floor((elapsed - 2400) / 150) * 40) : 140;
        timeoutId = setTimeout(tick, delay);
      };

      timeoutId = setTimeout(tick, 140);

      return () => {
        active = false;
        clearTimeout(timeoutId);
      };
    } else {
      setIsRouletteActive(false);
    }
  }, [voteResult, options, phase]);

  // Sync state via WebSockets (RF-99, RF-100, RF-101)
  useEffect(() => {
    if (!socket) return;

    const handleVoteStarted = (payload: {
      phase: 'FORMAT' | 'THEME';
      options: string[];
      expiresAt: string;
      totalVoters: number;
    }) => {
      setPhase(payload.phase);
      setOptions(payload.options || []);
      setExpiresAt(payload.expiresAt);
      setTotalVoters(payload.totalVoters || 4);
      setVotesCast(0);
      setSelectedChoice(null);
      setIsVoteConfirmed(false);
      setVoteResult(null);
      setError(null);
    };

    const handleVoteUpdated = (payload: {
      phase: 'FORMAT' | 'THEME';
      votesCast: number;
      totalVoters: number;
    }) => {
      setVotesCast(payload.votesCast);
      if (payload.totalVoters) {
        setTotalVoters(payload.totalVoters);
      }
    };

    const handleVoteEnded = (payload: VoteEndedPayload) => {
      setVoteResult(payload);
    };

    socket.on('vote:started', handleVoteStarted);
    socket.on('vote:updated', handleVoteUpdated);
    socket.on('vote:ended', handleVoteEnded);

    return () => {
      socket.off('vote:started', handleVoteStarted);
      socket.off('vote:updated', handleVoteUpdated);
      socket.off('vote:ended', handleVoteEnded);
    };
  }, [socket]);

  // Sync session, timer, and user's previous vote on mount or return (T29)
  useEffect(() => {
    let isMounted = true;

    async function syncActiveVotingSession() {
      let currentId = tournamentId;

      try {
        const res = await fetch('/api/tournaments/active', {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.tournament) {
            currentId = data.tournament.id;
            const vs = data.tournament.votingSession || data.votingSession;
            if (vs && isMounted) {
              if (vs.phase) setPhase(vs.phase);
              if (vs.options) setOptions(vs.options);
              if (vs.expiresAt) setExpiresAt(vs.expiresAt);
              if (vs.totalVoters) setTotalVoters(vs.totalVoters);
            }
            if (data.tournament.myVote || data.myVote) {
              setSelectedChoice(data.tournament.myVote || data.myVote);
              setIsVoteConfirmed(true);
            }
            if (data.tournament.myMatchFormat || data.myMatchFormat) {
              setSelectedMatchFormat(data.tournament.myMatchFormat || data.myMatchFormat);
            }
          }
        }
      } catch (err) {
        console.warn('[VotingView] Error fetching active tournament on mount:', err);
      }

      if (currentId && socket) {
        socket.emit('vote:sync', currentId, (res: any) => {
          if (!isMounted) return;
          if (res?.ok && res.session) {
            setPhase(res.session.phase);
            setOptions(res.session.options);
            setExpiresAt(res.session.expiresAt);
            setTotalVoters(res.session.totalVoters);
            setVotesCast(res.session.votesCast || 0);
          }
        });
      }
    }

    syncActiveVotingSession();

    return () => {
      isMounted = false;
    };
  }, [tournamentId, socket]);

  // Auto-close voting session when countdown reaches 0 even if votes are missing (T29, T38)
  useEffect(() => {
    if (!expiresAt) return;
    const expiryMs = Date.parse(expiresAt);
    if (isNaN(expiryMs) || expiryMs > Date.now()) return;

    if (countdown.isExpired && !voteResult && (tournamentId || expiresAt)) {
      const closeVotingFallback = async () => {
        try {
          const res = await fetch('/api/tournaments/close-voting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ tournamentId }),
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            if (data.result) {
              setVoteResult(data.result);
            }
          }
        } catch (err) {
          console.warn('[VotingView] Auto-close voting failed:', err);
        }
      };
      closeVotingFallback();
    }
  }, [countdown.isExpired, voteResult, tournamentId, expiresAt]);

  // Explicit submit vote to server (Item 2)
  const handleConfirmVote = useCallback(
    async (choice: string) => {
      if (!isAuthenticated || isSubmitting || voteResult || isVoteConfirmed) return;

      try {
        setIsSubmitting(true);
        setError(null);

        const res = await fetch('/api/tournaments/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            phase,
            choice,
            matchFormat: phase === 'FORMAT' ? selectedMatchFormat : undefined,
            tournamentId,
          }),
          credentials: 'include',
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error al emitir el voto.');
        }

        setIsVoteConfirmed(true);

        if (data.result) {
          setVoteResult(data.result);
        }
        if (data.votesCast !== undefined) {
          setVotesCast(data.votesCast);
        }
      } catch (err: any) {
        setError(err.message || 'Error al registrar el voto.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [isAuthenticated, isSubmitting, voteResult, isVoteConfirmed, phase, selectedMatchFormat, tournamentId]
  );

  const formatWinnerName = voteResult
    ? FORMAT_METADATA[voteResult.winner.toLowerCase()]?.title || voteResult.winner
    : '';

  return (
    <div className="mx-auto max-w-4xl px-4 py-4 space-y-6">
      {/* HUD Header & Countdown Panel (RF-99, RF-100) */}
      <Panel
        title={phase === 'FORMAT' ? 'Votación de Formato (Paso 1 de 3)' : 'Votación de Temática (Paso 2 de 3)'}
        subtitle={isConnected ? 'Sincronizado' : 'Sin conexión'}
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border/60 pb-4">
            <div className="text-center sm:text-left">
              <span className="text-[11px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5 justify-center sm:justify-start">
                <Sparkles className="h-3.5 w-3.5" />
                Votación en Vivo (60 Segundos)
              </span>
              <h2 className="font-display text-2xl font-black text-foreground">
                {phase === 'FORMAT' ? 'Elegí el Formato del Torneo' : 'Elegí la Temática de Equipos'}
              </h2>
            </div>

            {/* Countdown Badge */}
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 rounded-md border px-4 py-2 font-mono font-bold text-lg ${
                  countdown.secondsLeft <= 10
                    ? 'border-destructive bg-destructive/20 text-destructive animate-pulse'
                    : countdown.secondsLeft <= 30
                    ? 'border-accent bg-accent/20 text-accent'
                    : 'border-primary/60 bg-primary/10 text-primary glow-green'
                }`}
              >
                <Clock className="h-5 w-5" />
                <span>{countdown.formattedTime}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded bg-destructive/15 border border-destructive/40 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Progress Indicator: Votes cast vs Total voters (RF-100) */}
          <div className="space-y-2 bg-secondary/30 border border-border/70 rounded-md p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-display font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                Progreso de la Votación
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {votesCast} / {totalVoters} Votos ({Math.round((votesCast / (totalVoters || 1)) * 100)}%)
              </span>
            </div>

            <div className="h-2 w-full bg-background rounded-full overflow-hidden border border-border/60">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((votesCast / (totalVoters || 1)) * 100))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>La votación se cierra al llegar a cero o al votar el 100% de los presentes.</span>
              {selectedChoice && (
                <span className="text-primary font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Voto emitido
                </span>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* Result Card when Voting Concludes (RF-100, RF-101) */}
      {voteResult && (
        <Panel
          title={voteResult.phase === 'FORMAT' ? 'Resultado: Formato Electo' : '¡Temática Electa para la Juntada!'}
          subtitle="Definición Oficial"
        >
          <div className="space-y-5 text-center py-2">
            {isRouletteActive ? (
              <div className="py-8 px-4 flex flex-col items-center justify-center space-y-4 rounded-2xl border-2 border-accent/80 bg-accent/10 glow-orange animate-pulse">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 border-2 border-accent text-accent">
                  <Dices className="h-8 w-8 animate-spin" />
                </div>
                <div className="space-y-1.5 text-center">
                  <span className="text-xs font-bold uppercase tracking-widest text-accent font-mono">
                    🎲 {voteResult.wasDraw ? '¡Desempate en Vivo por Ruleta!' : '¡Sorteo Automático al Azar!'}
                  </span>
                  <h3 className="font-display text-2xl sm:text-3xl font-black text-foreground uppercase tracking-wider">
                    {FORMAT_METADATA[rouletteOption.toLowerCase()]?.title || rouletteOption}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  {voteResult.phase === 'FORMAT' ? 'Sorteando entre formatos disponibles...' : 'Sorteando entre temáticas disponibles...'}
                </p>
              </div>
            ) : (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 border border-primary glow-green">
                  <Trophy className="h-8 w-8 text-primary" />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                    {voteResult.phase === 'FORMAT' ? 'Formato Electo para la Juntada' : '¡Temática Electa para la Juntada!'}
                  </span>
                  <h3 className="font-display text-2xl sm:text-3xl font-black text-foreground text-glow uppercase">
                    {voteResult.phase === 'FORMAT' ? formatWinnerName : (FORMAT_METADATA[voteResult.winner.toLowerCase()]?.title || voteResult.winner)}
                  </h3>
                  {voteResult.phase === 'FORMAT' && voteResult.matchFormat && (
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-secondary/80 border border-border text-xs font-semibold text-foreground mt-2">
                      {voteResult.matchFormat === 'TWO_LEGGED' ? (
                        <>
                          <span className="text-accent text-sm">🔄</span>
                          <span className="text-accent font-bold">Modalidad: Ida y Vuelta (Series de 2)</span>
                        </>
                      ) : (
                        <>
                          <span className="text-primary text-sm">⚽</span>
                          <span className="text-primary font-bold">Modalidad: Partido Único (90 min)</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Tie-break Alert (RF-101) */}
                {voteResult.wasDraw && (
                  <div className="max-w-md mx-auto flex items-center gap-2.5 rounded-md bg-accent/15 border border-accent/40 p-3 text-left text-xs text-accent">
                    <Dices className="h-5 w-5 shrink-0 text-accent animate-spin" />
                    <div>
                      <p className="font-bold">¡Desempate al Azar (RF-101)!</p>
                      <p className="text-[11px] text-foreground/80">
                        Hubo empate entre las opciones más votadas (
                        {voteResult.tiedOptions
                          ?.map((opt) => FORMAT_METADATA[opt.toLowerCase()]?.title || opt)
                          .join(' y ')}
                        ). El sistema desempató automáticamente al azar con distribución uniforme.
                      </p>
                    </div>
                  </div>
                )}

                {/* Vote Breakdown (Filtered votes > 0, clean message for 0 total votes) */}
                <div className="max-w-md mx-auto space-y-1.5 pt-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold text-left">
                    Desglose de Votos:
                  </p>
                  {(() => {
                    const validVoteEntries = Object.entries(voteResult.voteCounts || {}).filter(
                      ([_, count]) => count > 0
                    );
                    const totalVotes = Object.values(voteResult.voteCounts || {}).reduce((a, b) => a + b, 0);

                    if (totalVotes === 0 || validVoteEntries.length === 0) {
                      return (
                        <div className="p-3 rounded-lg border border-border/70 bg-secondary/40 text-center text-xs font-medium text-muted-foreground">
                          Sin votos emitidos — Definido por sorteo automático al azar
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-1 text-xs">
                        {validVoteEntries.map(([optKey, votes]) => (
                          <div
                            key={optKey}
                            className={`flex items-center justify-between p-2 rounded border ${
                              optKey.toLowerCase() === voteResult.winner.toLowerCase()
                                ? 'border-primary/80 bg-primary/10 font-bold text-primary'
                                : 'border-border/60 bg-secondary/30 text-muted-foreground'
                            }`}
                          >
                            <span>{FORMAT_METADATA[optKey.toLowerCase()]?.title || optKey}</span>
                            <span className="font-mono">{votes} voto{votes === 1 ? '' : 's'}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Advance Notice (RF-99, RF-100, T42) */}
                <div className="pt-4 flex flex-col items-center justify-center gap-2">
                  <div className="flex items-center gap-2.5 text-xs text-primary font-mono bg-primary/10 border border-primary/30 px-5 py-2.5 rounded-full animate-pulse">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                    </span>
                    <span className="font-semibold tracking-wide">Avanzando automáticamente a la siguiente etapa...</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </Panel>
      )}

      {/* Options Selection Grid (RF-99: Filtered by N confirmed players) */}
      {!voteResult && (
        <Panel
          title="Opciones Disponibles"
          subtitle={phase === 'FORMAT' ? `${options.length} formatos válidos` : `${options.length} temáticas disponibles`}
        >
          {isOffline && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-300 text-center mb-3">
              Votación pausada: sin conexión con el servidor. Se reactivará al reconectar.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {(options.includes('random') ? options : [...options, 'random']).map((optionKey) => {
              const meta = FORMAT_METADATA[optionKey] || {
                title: optionKey,
                badge: 'Formato',
                description: 'Opción de torneo válida.',
                icon: Trophy,
              };

              const isSelected = selectedChoice?.toLowerCase() === optionKey.toLowerCase();
              const Icon = meta.icon;

              return (
                <button
                  key={optionKey}
                  type="button"
                  disabled={isVoteConfirmed || isSubmitting || countdown.isExpired || isOffline}
                  onClick={() => {
                    if (isVoteConfirmed || countdown.isExpired || isSubmitting || isOffline) return;
                    setSelectedChoice(optionKey);
                  }}
                  className={`flex flex-col text-left p-4 rounded-md border transition cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/15 glow-green ring-1 ring-primary'
                      : 'border-border/80 bg-secondary/40 hover:border-accent hover:bg-secondary/70'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded ${
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-primary'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-display text-sm font-bold text-foreground">
                          {meta.title}
                        </h4>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                          {meta.badge}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="flex items-center gap-1 rounded bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5">
                        <CheckCircle2 className="h-3 w-3" />
                        {isVoteConfirmed ? 'Tu Voto Confirmado' : 'Seleccionado'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    {meta.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Modality selector: Single Match vs Two-Legged (RF-105) */}
          {phase === 'FORMAT' && (
            <div className="flex flex-col gap-2 rounded-md border border-border/80 bg-secondary/30 p-3.5 mt-4">
              <span className="font-display text-xs font-bold uppercase tracking-wider text-foreground">
                Modalidad de Cruces / Partidos:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={isVoteConfirmed || isSubmitting || countdown.isExpired || isOffline}
                  onClick={() => {
                    if (isVoteConfirmed || countdown.isExpired || isSubmitting || isOffline) return;
                    setSelectedMatchFormat('SINGLE_MATCH');
                  }}
                  className={`flex items-center justify-between p-2.5 rounded border text-xs font-semibold transition ${
                    selectedMatchFormat === 'SINGLE_MATCH'
                      ? 'border-primary bg-primary/20 text-primary font-bold glow-green'
                      : 'border-border bg-secondary/50 text-muted-foreground hover:border-border/80'
                  } disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚽</span>
                    <span>Partido Único (90 min)</span>
                  </div>
                  {selectedMatchFormat === 'SINGLE_MATCH' && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </button>
                <button
                  type="button"
                  disabled={isVoteConfirmed || isSubmitting || countdown.isExpired || isOffline}
                  onClick={() => {
                    if (isVoteConfirmed || countdown.isExpired || isSubmitting || isOffline) return;
                    setSelectedMatchFormat('TWO_LEGGED');
                  }}
                  className={`flex items-center justify-between p-2.5 rounded border text-xs font-semibold transition ${
                    selectedMatchFormat === 'TWO_LEGGED'
                      ? 'border-accent bg-accent/20 text-accent font-bold glow-orange'
                      : 'border-border bg-secondary/50 text-muted-foreground hover:border-border/80'
                  } disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔄</span>
                    <span>Ida y Vuelta (Series de 2)</span>
                  </div>
                  {selectedMatchFormat === 'TWO_LEGGED' && <CheckCircle2 className="h-4 w-4 text-accent" />}
                </button>
              </div>
            </div>
          )}

          {/* Explicit Confirm Vote Button (Item 2) */}
          <div className="pt-4 flex flex-col items-center gap-2 border-t border-border/60 mt-4">
            {isVoteConfirmed ? (
              <div className="w-full flex items-center justify-center gap-2.5 rounded-md bg-primary/15 border border-primary/50 py-3 px-6 text-sm font-bold text-primary">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span>Voto confirmado: esperando al resto de los pibes...</span>
              </div>
            ) : (
              <PrimaryButton
                type="button"
                disabled={!selectedChoice || isSubmitting || countdown.isExpired || isOffline}
                onClick={() => selectedChoice && handleConfirmVote(selectedChoice)}
                className="w-full sm:w-auto px-10 py-3 text-base font-bold uppercase tracking-wider glow-green"
              >
                {isSubmitting ? (
                  <span>Enviando voto...</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Confirmar Voto
                  </span>
                )}
              </PrimaryButton>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

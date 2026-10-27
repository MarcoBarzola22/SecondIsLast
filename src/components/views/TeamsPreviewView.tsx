import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Shuffle,
  Users,
  AlertCircle,
  Sparkles,
  Trophy,
  Plus,
  X,
  ArrowRight,
  Dices,
  Clock,
  CheckCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';
import { DEFAULT_THEME_TEAMS } from '../../domain/teams';
import { useCountdown } from '../../hooks/useCountdown';

export interface DrawAnimatedPayload {
  step: number;
  totalSteps: number;
  currentItem: string;
  targetParticipantId?: string;
  participantName?: string;
  targetPlayerName?: string;
  isFinal: boolean;
  assignments?: Record<string, string>;
  method?: 'DIRECT_DRAW' | 'DRAFT_ORDER';
  draftOrder?: Array<{ order: number; participantId: string; participantName: string }>;
}

export interface TeamsPreviewViewProps {
  tournamentId?: string;
  initialTheme?: string;
  participantCount?: number;
  participants?: Array<{ id: string; name: string }>;
  onProceedToFixture?: (method?: 'DIRECT_DRAW' | 'DRAFT_ORDER') => void;
}

export function TeamsPreviewView({
  tournamentId,
  initialTheme = 'Apertura 2006',
  participantCount = 4,
  participants = [],
  onProceedToFixture,
}: TeamsPreviewViewProps) {
  const { isAdmin } = useAuth();
  const { socket, isConnected } = useSocket();

  const [theme, setTheme] = useState<string>(initialTheme);
  const [teams, setTeams] = useState<string[]>(() => DEFAULT_THEME_TEAMS[initialTheme] || []);
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [assignmentMethod, setAssignmentMethod] = useState<'DIRECT_DRAW' | 'DRAFT_ORDER'>('DIRECT_DRAW');
  const [error, setError] = useState<string | null>(null);

  // Admin Preload Modal state (RF-103)
  const [isPreloadModalOpen, setIsPreloadModalOpen] = useState<boolean>(false);
  const [editingTheme, setEditingTheme] = useState<string>(initialTheme);
  const [editingTeamsText, setEditingTeamsText] = useState<string>('');
  const [preloadError, setPreloadError] = useState<string | null>(null);
  const [isSavingPreload, setIsSavingPreload] = useState<boolean>(false);

  // Synchronized Draw Animation state (RF-104)
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [drawStep, setDrawStep] = useState<DrawAnimatedPayload | null>(null);
  const [finalAssignments, setFinalAssignments] = useState<Record<string, string>>({});
  const [draftOrderResults, setDraftOrderResults] = useState<
    Array<{ order: number; participantId: string; participantName: string }>
  >([]);
  const [isDrawComplete, setIsDrawComplete] = useState<boolean>(false);

  // Synchronized Voting for Assignment Method (T33, T34)
  const [votingExpiresAt, setVotingExpiresAt] = useState<string | null>(null);
  const [hasVotingEnded, setHasVotingEnded] = useState<boolean>(false);
  const [votedChoice, setVotedChoice] = useState<'DIRECT_DRAW' | 'DRAFT_ORDER' | null>(null);
  const [votesCast, setVotesCast] = useState<number>(0);
  const [totalVoters, setTotalVoters] = useState<number>(participantCount);
  const [isSubmittingVote, setIsSubmittingVote] = useState<boolean>(false);
  const [winnerAnnouncement, setWinnerAnnouncement] = useState<string | null>(null);
  const [isRouletteActive, setIsRouletteActive] = useState<boolean>(false);
  const [rouletteCandidate, setRouletteCandidate] = useState<'DIRECT_DRAW' | 'DRAFT_ORDER'>('DIRECT_DRAW');
  const [voteResult, setVoteResult] = useState<{
    winner: string;
    wasDraw?: boolean;
    tiedOptions?: string[];
    voteCounts?: Record<string, number>;
  } | null>(null);

  const votingCountdown = useCountdown(votingExpiresAt, 60);

  // Start or synchronize assignment method voting session (T33, T34)
  useEffect(() => {
    let isMounted = true;
    async function initVoting() {
      if (!tournamentId) return;
      try {
        const res = await fetch('/api/tournaments/start-voting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ tournamentId, phase: 'ASSIGNMENT_METHOD' }),
          credentials: 'include',
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          const expires = data.expiresAt || data.session?.expiresAt;
          if (typeof expires === 'string' && !isNaN(Date.parse(expires))) {
            setVotingExpiresAt(expires);
            setTotalVoters(data.totalVoters || data.session?.totalVoters || participantCount);
            const isClosed = data.closed || data.session?.closed || data.session?.isClosed;
            if (isClosed) {
              setHasVotingEnded(true);
              const winner = (data.winner || data.session?.winner || '').toUpperCase() === 'DRAFT_ORDER' ? 'DRAFT_ORDER' : 'DIRECT_DRAW';
              setAssignmentMethod(winner);
            } else {
              setHasVotingEnded(false);
            }
          }
        }
      } catch (err) {
        console.warn('[TeamsPreviewView] Error starting assignment voting:', err);
      }
    }
    initVoting();
    return () => {
      isMounted = false;
    };
  }, [tournamentId, participantCount]);

  // Fetch available teams for the current theme
  const fetchTeams = useCallback(async (targetTheme?: string) => {
    try {
      setError(null);
      const query = new URLSearchParams();
      if (targetTheme) query.set('theme', targetTheme);
      if (tournamentId) query.set('tournamentId', tournamentId);

      const res = await fetch(`/api/tournaments/teams?${query.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al obtener equipos de la temática.');
      }
      if (data.theme) setTheme(data.theme);
      if (Array.isArray(data.teams)) setTeams(data.teams);
      setIsCustom(Boolean(data.isCustom));
    } catch (err: any) {
      setError(err.message || 'Error al cargar equipos.');
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchTeams(initialTheme);
  }, [fetchTeams, initialTheme]);

  // Trigger Team Draw (usable manually or via auto-advance)
  const handleStartDraw = useCallback(async (overrideMethod?: string) => {
    try {
      setIsDrawing(true);
      setError(null);

      const res = await fetch('/api/tournaments/draw-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          tournamentId,
          assignmentMethod: overrideMethod || assignmentMethod,
        }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar el sorteo.');
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar el sorteo.');
      setIsDrawing(false);
    }
  }, [tournamentId, assignmentMethod]);

  const announceWinnerAndAutoAdvance = useCallback((
    winnerRaw: string,
    wasDraw?: boolean,
    tiedOptions?: string[],
    voteCounts?: Record<string, number>
  ) => {
    const winner = winnerRaw?.toUpperCase() === 'DRAFT_ORDER' ? 'DRAFT_ORDER' : 'DIRECT_DRAW';
    setAssignmentMethod(winner);
    setHasVotingEnded(true);
    setVoteResult({
      winner,
      wasDraw,
      tiedOptions,
      voteCounts,
    });

    const winnerTitle =
      winner === 'DIRECT_DRAW'
        ? 'Sorteo Directo de Equipos'
        : 'Sorteo de Orden de Elección (Draft)';

    const totalVotes = Object.values(voteCounts || {}).reduce((a, b) => a + b, 0);
    const isTieOrZero = wasDraw || totalVotes === 0;

    if (isTieOrZero) {
      setIsRouletteActive(true);
      const candidates: Array<'DIRECT_DRAW' | 'DRAFT_ORDER'> = ['DIRECT_DRAW', 'DRAFT_ORDER'];
      let idx = 0;
      let active = true;
      const startTime = Date.now();
      let timeoutId: ReturnType<typeof setTimeout>;

      const tick = () => {
        if (!active) return;
        const elapsed = Date.now() - startTime;
        if (elapsed >= 3500) {
          clearTimeout(timeoutId);
          setIsRouletteActive(false);
          setWinnerAnnouncement(winnerTitle);

          setTimeout(() => {
            setWinnerAnnouncement(null);
          }, 5000);
          return;
        }
        idx = (idx + 1) % candidates.length;
        setRouletteCandidate(candidates[idx]!);

        // Decelerate in the final 1100ms
        const delay = elapsed > 2400 ? 140 + Math.min(180, Math.floor((elapsed - 2400) / 150) * 40) : 140;
        timeoutId = setTimeout(tick, delay);
      };

      timeoutId = setTimeout(tick, 140);
    } else {
      setIsRouletteActive(false);
      setWinnerAnnouncement(winnerTitle);

      setTimeout(() => {
        setWinnerAnnouncement(null);
      }, 5500);
    }
  }, []);

  // Synchronized WebSocket event listeners (RF-104, T33)
  useEffect(() => {
    if (!socket) return;

    const handleDrawAnimated = (payload: DrawAnimatedPayload) => {
      setIsDrawing(true);
      setDrawStep(payload);

      if (payload.method) {
        setAssignmentMethod(payload.method);
      }

      if (payload.isFinal) {
        setIsDrawing(false);
        setIsDrawComplete(true);
        if (payload.assignments) {
          setFinalAssignments(payload.assignments);
        }
        if (payload.draftOrder) {
          setDraftOrderResults(payload.draftOrder);
        }

        // Deja visible durante 6 segundos el resultado final del orden de draft y luego navega automáticamente (RF-104, T42)
        setTimeout(() => {
          const finalMethod = (payload.method || assignmentMethod).toUpperCase();
          if (finalMethod === 'DRAFT_ORDER') {
            if (onProceedToFixture) {
              onProceedToFixture('DRAFT_ORDER');
            }
          }
        }, 6000);
      }
    };

    const handleVoteStarted = (payload: any) => {
      if (payload.phase === 'ASSIGNMENT_METHOD') {
        if (typeof payload.expiresAt === 'string' && !isNaN(Date.parse(payload.expiresAt))) {
          setVotingExpiresAt(payload.expiresAt);
        }
        setTotalVoters(payload.totalVoters || participantCount);
        setVotesCast(0);
        setHasVotingEnded(false);
        setVoteResult(null);
      }
    };

    const handleVoteUpdated = (payload: any) => {
      if (payload.phase === 'ASSIGNMENT_METHOD') {
        setVotesCast(payload.votesCast);
        if (payload.totalVoters) setTotalVoters(payload.totalVoters);
      }
    };

    const handleVoteEnded = (payload: any) => {
      if (payload.phase === 'ASSIGNMENT_METHOD') {
        announceWinnerAndAutoAdvance(
          payload.winner,
          payload.wasDraw,
          payload.tiedOptions,
          payload.voteCounts
        );
      }
    };

    socket.on('draw:animated', handleDrawAnimated);
    socket.on('vote:started', handleVoteStarted);
    socket.on('vote:updated', handleVoteUpdated);
    socket.on('vote:ended', handleVoteEnded);

    // Reconnection & sync check (RF-104)
    if (tournamentId) {
      socket.emit('draw:sync', tournamentId, (res: any) => {
        if (res?.ok) {
          if (res.inProgress && res.currentStep) {
            setIsDrawing(true);
          }
          if (res.isComplete) {
            if (res.assignments) setFinalAssignments(res.assignments);
            if (res.draftOrder) setDraftOrderResults(res.draftOrder);
            if (res.method) setAssignmentMethod(res.method);
            setIsDrawComplete(true);
            setIsDrawing(false);
          }
        }
      });
    }

    return () => {
      socket.off('draw:animated', handleDrawAnimated);
      socket.off('vote:started', handleVoteStarted);
      socket.off('vote:updated', handleVoteUpdated);
      socket.off('vote:ended', handleVoteEnded);
    };
  }, [socket, tournamentId, participantCount, assignmentMethod, onProceedToFixture]);

  // Auto-close fallback when timer expires (T33, T34, T35, T36, T38)
  // ONLY triggers if votingExpiresAt is a valid date string and timer actually reached 0
  useEffect(() => {
    if (!votingExpiresAt) return;
    const expiryMs = Date.parse(votingExpiresAt);
    if (isNaN(expiryMs) || expiryMs > Date.now()) return;

    if (votingCountdown.isExpired && !hasVotingEnded && tournamentId) {
      fetch('/api/tournaments/close-voting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId }),
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.winner) {
            announceWinnerAndAutoAdvance(
              data.winner,
              data.wasDraw,
              data.tiedOptions,
              data.voteCounts
            );
          }
        })
        .catch((err) => console.warn('[TeamsPreviewView] Error closing voting on timeout:', err));
    }
  }, [votingExpiresAt, votingCountdown.isExpired, hasVotingEnded, tournamentId, announceWinnerAndAutoAdvance]);

  // Confirm vote for assignment method directly from card buttons (T33, T34, T35)
  const handleConfirmVote = async (choice: 'DIRECT_DRAW' | 'DRAFT_ORDER') => {
    if (isSubmittingVote || votedChoice) return;
    try {
      setIsSubmittingVote(true);
      const res = await fetch('/api/tournaments/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          tournamentId,
          phase: 'ASSIGNMENT_METHOD',
          choice,
        }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al emitir voto.');
      }
      setVotedChoice(choice);
      if (data.result?.winner) {
        announceWinnerAndAutoAdvance(
          data.result.winner,
          data.result.wasDraw,
          data.result.tiedOptions,
          data.result.voteCounts
        );
      }
    } catch (err: any) {
      setError(err.message || 'Error al enviar voto.');
    } finally {
      setIsSubmittingVote(false);
    }
  };

  // Handle Admin Preload Save (RF-103)
  const handleSavePreload = async () => {
    if (!isAdmin) return;
    try {
      setIsSavingPreload(true);
      setPreloadError(null);

      const parsedTeams = editingTeamsText
        .split('\n')
        .map((t) => t.trim().replace(/\s+/g, ' '))
        .filter((t) => t.length > 0);

      const res = await fetch('/api/tournaments/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          theme: editingTheme,
          teams: parsedTeams,
        }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al precargar equipos.');
      }

      setTheme(data.theme);
      setTeams(data.teams);
      setIsCustom(true);
      setIsPreloadModalOpen(false);
    } catch (err: any) {
      setPreloadError(err.message || 'Error al guardar los equipos precargados.');
    } finally {
      setIsSavingPreload(false);
    }
  };

  // Open Preload Modal prefilled with current teams
  const handleOpenPreloadModal = () => {
    setEditingTheme(theme);
    setEditingTeamsText(teams.join('\n'));
    setPreloadError(null);
    setIsPreloadModalOpen(true);
  };



  const hasEnoughTeams = teams.length >= participantCount;

  return (
    <div className="mx-auto max-w-4xl px-4 py-4 space-y-6">
      {/* Header & Overview Panel */}
      <Panel
        title="Previsualización de Equipos"
        subtitle={isConnected ? 'Sincronizado' : 'Sin conexión'}
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border/60 pb-4">
            <div className="text-center sm:text-left">
              <span className="text-[11px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5 justify-center sm:justify-start">
                <Sparkles className="h-3.5 w-3.5" />
                Temática Electa (RF-103)
              </span>
              <h2 className="font-display text-2xl font-black text-foreground">{theme}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isCustom ? 'Roster personalizado por el Administrador' : 'Roster oficial predefinido'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && !isDrawComplete && (
                <SecondaryButton
                  type="button"
                  onClick={handleOpenPreloadModal}
                  className="text-xs px-3 py-2"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  <span>Editar / Precargar Equipos</span>
                </SecondaryButton>
              )}
            </div>
          </div>

          {/* Assignment Method Synchronized Voting & Selection (T35) */}
          {!isDrawComplete && (
            !hasVotingEnded ? (
              <div className="flex flex-col gap-6 rounded-2xl border-4 border-primary/60 bg-gradient-to-b from-primary/15 via-background/90 to-primary/10 p-6 sm:p-8 shadow-2xl glow-blue text-center">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs font-bold uppercase tracking-widest animate-pulse">
                    <Clock className="h-4 w-4" /> Votación Obligatoria en Vivo (60s)
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wide text-foreground">
                    ¿Cómo asignamos los equipos?
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
                    Hacé clic directamente en una de las dos opciones para votar antes de que termine el tiempo.
                  </p>

                  {/* Reloj en pantalla grande (T35) */}
                  <div className="my-2 py-3 px-8 rounded-2xl bg-background/90 border-2 border-primary/50 shadow-inner flex flex-col items-center">
                    <div className="font-mono text-5xl sm:text-6xl font-black text-primary text-glow tracking-wider">
                      {votingCountdown.formattedTime}
                    </div>
                    <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-1">
                      {votesCast}/{totalVoters} participantes ya votaron
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full max-w-md h-2.5 bg-background/80 rounded-full overflow-hidden border border-border/50">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                      style={{ width: `${votingCountdown.progressPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Las dos tarjetas son botones directos para votar (T35) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <button
                    type="button"
                    disabled={isSubmittingVote || Boolean(votedChoice)}
                    onClick={() => handleConfirmVote('DIRECT_DRAW')}
                    className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-3 text-center transition-all duration-200 ${
                      votedChoice === 'DIRECT_DRAW'
                        ? 'border-primary bg-primary/30 text-foreground font-black shadow-2xl glow-green scale-[1.03] ring-2 ring-primary'
                        : 'border-border/80 bg-secondary/40 text-muted-foreground hover:border-primary/60 hover:bg-secondary/70 hover:scale-[1.02]'
                    } disabled:cursor-not-allowed`}
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-primary border border-primary/40 text-3xl">
                      🎲
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-display font-black text-base sm:text-lg text-primary flex items-center justify-center gap-2">
                        Sorteo Directo de Equipos
                        {votedChoice === 'DIRECT_DRAW' && <CheckCircle2 className="h-5 w-5 text-primary" />}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Cada jugador recibe un equipo al azar al instante mediante la ruleta animada.
                      </p>
                    </div>
                    {votedChoice === 'DIRECT_DRAW' ? (
                      <span className="text-xs font-bold text-primary bg-primary/20 px-3 py-1 rounded-full border border-primary">
                        ✓ Tu Voto Registrado
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground bg-background/60 px-3 py-1 rounded-full border border-border">
                        {isSubmittingVote ? 'Enviando...' : 'Clic para Votar'}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isSubmittingVote || Boolean(votedChoice)}
                    onClick={() => handleConfirmVote('DRAFT_ORDER')}
                    className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-3 text-center transition-all duration-200 ${
                      votedChoice === 'DRAFT_ORDER'
                        ? 'border-accent bg-accent/30 text-foreground font-black shadow-2xl glow-orange scale-[1.03] ring-2 ring-accent'
                        : 'border-border/80 bg-secondary/40 text-muted-foreground hover:border-accent/60 hover:bg-secondary/70 hover:scale-[1.02]'
                    } disabled:cursor-not-allowed`}
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent border border-accent/40 text-3xl">
                      📋
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-display font-black text-base sm:text-lg text-accent flex items-center justify-center gap-2">
                        Sorteo de Orden de Draft
                        {votedChoice === 'DRAFT_ORDER' && <CheckCircle2 className="h-5 w-5 text-accent" />}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Se sortea el orden de turnos (1º, 2º, 3º...) con 20 segundos por turno para elegir en vivo.
                      </p>
                    </div>
                    {votedChoice === 'DRAFT_ORDER' ? (
                      <span className="text-xs font-bold text-accent bg-accent/20 px-3 py-1 rounded-full border border-accent">
                        ✓ Tu Voto Registrado
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground bg-background/60 px-3 py-1 rounded-full border border-border">
                        {isSubmittingVote ? 'Enviando...' : 'Clic para Votar'}
                      </span>
                    )}
                  </button>
                </div>

                {votedChoice ? (
                  <p className="text-xs font-bold text-primary flex items-center justify-center gap-2 animate-pulse pt-2">
                    <CheckCircle className="h-4 w-4" />
                    ¡Voto confirmado! Al expirar el tiempo (00:00) se anunciará el ganador y se iniciará la asignación.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground pt-2">
                    Si hay empate al expirar los 60 segundos, el sistema desempatará automáticamente al azar.
                  </p>
                )}
              </div>
            ) : isRouletteActive ? (
              <div className="py-8 px-4 flex flex-col items-center justify-center space-y-4 rounded-2xl border-2 border-accent/80 bg-accent/10 glow-orange animate-pulse">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 border-2 border-accent text-accent">
                  <Dices className="h-8 w-8 animate-spin" />
                </div>
                <div className="space-y-1.5 text-center">
                  <span className="text-xs font-bold uppercase tracking-widest text-accent font-mono">
                    🎲 {voteResult?.wasDraw ? '¡Desempate en Vivo por Ruleta!' : '¡Sorteo Automático al Azar!'}
                  </span>
                  <h3 className="font-display text-2xl sm:text-3xl font-black text-foreground uppercase tracking-wider">
                    {rouletteCandidate === 'DIRECT_DRAW'
                      ? 'Sorteo Directo de Equipos'
                      : 'Sorteo de Orden de Elección (Draft)'}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  Sorteando método de asignación...
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 rounded-xl border-2 border-primary/70 bg-gradient-to-b from-primary/15 to-secondary/30 p-5 shadow-xl glow-green">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-primary/20 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-primary/20 text-primary">
                      <Trophy className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="font-display text-xs font-bold uppercase tracking-wider text-primary">
                        Votación Concluida — Método Ganador
                      </span>
                      <h3 className="font-display text-base font-black text-foreground">
                        {assignmentMethod === 'DIRECT_DRAW'
                          ? 'Sorteo Directo de Equipos'
                          : 'Sorteo de Orden de Elección (Draft por Turnos)'}
                      </h3>
                    </div>
                  </div>
                  {voteResult && (() => {
                    const directVotes = voteResult.voteCounts?.DIRECT_DRAW || 0;
                    const draftVotes = voteResult.voteCounts?.DRAFT_ORDER || 0;
                    const totalVotes = directVotes + draftVotes;

                    if (totalVotes === 0) {
                      return (
                        <span className="text-xs font-mono text-muted-foreground bg-background/80 px-2.5 py-1 rounded border border-border">
                          Sin votos emitidos — Definido por sorteo automático al azar
                        </span>
                      );
                    }

                    const parts: string[] = [];
                    if (directVotes > 0) parts.push(`${directVotes} directo${directVotes === 1 ? '' : 's'}`);
                    if (draftVotes > 0) parts.push(`${draftVotes} draft`);

                    return (
                      <span className="text-xs font-mono text-muted-foreground bg-background/80 px-2.5 py-1 rounded border border-border">
                        Resultado: {parts.join(' vs ')}
                      </span>
                    );
                  })()}
                </div>

                {voteResult?.wasDraw && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-accent/20 border border-accent/40 text-accent text-xs">
                    <span className="font-bold">🎲 ¡Hubo Empate!</span>
                    <span>El sistema desempató automáticamente al azar en favor de este método.</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
                  <div className="flex items-center gap-2 text-xs text-primary font-mono bg-primary/10 border border-primary/30 px-3.5 py-1.5 rounded-full animate-pulse">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                    <span>Avanzando automáticamente a la siguiente etapa...</span>
                  </div>

                  <PrimaryButton
                    type="button"
                    disabled={isDrawing || (assignmentMethod === 'DIRECT_DRAW' && !hasEnoughTeams)}
                    onClick={() => handleStartDraw()}
                    className="text-xs px-6 py-2.5 glow-green font-bold shrink-0 w-full sm:w-auto"
                  >
                    <Shuffle className="h-4 w-4 mr-2" />
                    <span>
                      {isDrawing
                        ? 'Sorteando...'
                        : assignmentMethod === 'DRAFT_ORDER'
                        ? 'Sortear Orden de Elección (Draft) →'
                        : 'Ejecutar Sorteo Directo de Equipos →'}
                    </span>
                  </PrimaryButton>
                </div>
              </div>
            )
          )}

          {error && (
            <div className="flex items-center gap-2 rounded bg-destructive/15 border border-destructive/40 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quorum / Capacity Status Indicator */}
          <div className="flex items-center justify-between text-xs bg-secondary/30 border border-border/60 rounded-md p-3">
            <span className="flex items-center gap-2 font-display font-bold uppercase tracking-wider text-foreground">
              <Users className="h-4 w-4 text-primary" />
              Participantes Confirmados: {participantCount}
            </span>
            <span
              className={`font-mono text-xs font-bold ${
                hasEnoughTeams ? 'text-primary' : 'text-destructive'
              }`}
            >
              {teams.length} Equipos disponibles{' '}
              {!hasEnoughTeams && `(faltan ${participantCount - teams.length})`}
            </span>
          </div>

          {!hasEnoughTeams && assignmentMethod === 'DIRECT_DRAW' && (
            <div className="flex items-center gap-2 rounded bg-destructive/15 border border-destructive/40 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Se necesitan al menos {participantCount} equipos para los participantes presentes. El
                administrador debe precargar más opciones antes de sortear.
              </span>
            </div>
          )}
        </div>
      </Panel>

      {/* Synchronized Draw Roulette Overlay / Animation Card (RF-104) */}
      {(isDrawing || (drawStep && !isDrawComplete)) && (
        <Panel title="Sorteo Sincronizado en Vivo" subtitle="Reproducción al unísono">
          <div className="py-6 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 border border-accent glow-blue animate-pulse">
              <Dices className="h-8 w-8 text-accent animate-spin" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Paso {drawStep?.step || 1} de {drawStep?.totalSteps || participantCount}
              </span>
              <h3 className="font-display text-lg text-foreground font-bold">
                {drawStep?.method === 'DRAFT_ORDER' || assignmentMethod === 'DRAFT_ORDER'
                  ? 'Sorteando turno para:'
                  : 'Asignando equipo a:'}{' '}
                <span className="text-primary font-black uppercase text-glow">
                  {drawStep?.targetPlayerName ||
                    drawStep?.participantName ||
                    participants.find((p) => p.id === drawStep?.targetParticipantId)?.name ||
                    'Participante'}
                </span>
              </h3>
            </div>

            <div className="max-w-xs mx-auto py-3 px-4 rounded-md border border-primary/60 bg-primary/10 glow-green">
              <span className="font-display text-2xl font-black text-foreground uppercase tracking-wide">
                {drawStep?.currentItem || 'Sorteando...'}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              La animación se está reproduciendo en simultáneo en todos los dispositivos conectados.
            </p>
          </div>
        </Panel>
      )}

      {/* Result 1: Draft Order Sorteado (T31) */}
      {isDrawComplete && (draftOrderResults.length > 0 || assignmentMethod === 'DRAFT_ORDER') && (
        <Panel title="Orden de Elección de Equipos (Draft)" subtitle="Definición de Turnos Oficial">
          <div className="space-y-4 py-2">
            <div className="text-center space-y-1 pb-2 border-b border-border/60">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 border border-accent glow-orange mb-2">
                <Trophy className="h-6 w-6 text-accent" />
              </div>
              <h3 className="font-display text-xl font-black text-foreground uppercase text-glow">
                ¡Orden de Draft Sorteado!
              </h3>
              <p className="text-xs text-muted-foreground">
                Los turnos quedaron definidos. Ahora cada jugador elegirá su equipo en este orden exacto.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {draftOrderResults.map((entry) => (
                <div
                  key={entry.participantId}
                  className="flex items-center justify-between p-3 rounded-md border border-accent/50 bg-secondary/40"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-accent font-mono font-bold text-xs">
                      #{entry.order}
                    </span>
                    <span className="font-display font-bold text-sm text-foreground">
                      {entry.participantName}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-accent uppercase">
                    {entry.order}º Turno
                  </span>
                </div>
              ))}
            </div>

            {onProceedToFixture && (
              <div className="pt-4 flex justify-center">
                <PrimaryButton
                  type="button"
                  onClick={() => onProceedToFixture('DRAFT_ORDER')}
                  className="w-full sm:w-auto px-8 glow-orange font-bold uppercase tracking-wide"
                >
                  <span>Ir a Elección de Equipos (Draft)</span>
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </PrimaryButton>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Result 2: Direct Team Assignments Display (when direct draw is complete) */}
      {isDrawComplete && draftOrderResults.length === 0 && assignmentMethod === 'DIRECT_DRAW' && (
        <Panel title="Resultado del Sorteo de Equipos" subtitle="Asignación Oficial de la Juntada">
          <div className="space-y-4 py-2">
            <div className="text-center space-y-1 pb-2 border-b border-border/60">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 border border-primary glow-green mb-2">
                <Trophy className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-xl font-black text-foreground uppercase text-glow">
                ¡Equipos Sorteados!
              </h3>
              <p className="text-xs text-muted-foreground">
                Cada participante ya tiene su equipo asignado para disputar el torneo.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {participants.length > 0
                ? participants.map((p) => {
                    const assigned = finalAssignments[p.id];
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 rounded-md border border-primary/50 bg-secondary/40"
                      >
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-display font-bold text-sm text-foreground">
                            {p.name}
                          </span>
                        </div>
                        <span className="font-mono text-xs font-bold text-primary uppercase">
                          {assigned || 'Asignado'}
                        </span>
                      </div>
                    );
                  })
                : Object.entries(finalAssignments).map(([partId, teamName], idx) => {
                    const matched = participants.find((p) => p.id === partId);
                    return (
                      <div
                        key={partId}
                        className="flex items-center justify-between p-3 rounded-md border border-primary/50 bg-secondary/40"
                      >
                        <span className="font-display font-bold text-sm text-foreground">
                          {matched ? matched.name : `Participante ${idx + 1}`}
                        </span>
                        <span className="font-mono text-xs font-bold text-primary uppercase">
                          {teamName}
                        </span>
                      </div>
                    );
                  })}
            </div>

            {onProceedToFixture && (
              <div className="pt-4 flex justify-center">
                <PrimaryButton
                  type="button"
                  onClick={() => onProceedToFixture('DIRECT_DRAW')}
                  className="w-full sm:w-auto px-8 glow-green font-bold uppercase tracking-wide"
                >
                  <span>Continuar al Fixture y Partidos</span>
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </PrimaryButton>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Available Teams Grid (RF-103 Preview) */}
      {!isDrawComplete && (
        <Panel
          title="Equipos Disponibles"
          subtitle={`${teams.length} opciones cargadas`}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {teams.map((teamName, index) => (
              <div
                key={`${teamName}-${index}`}
                className="flex items-center gap-2.5 p-3 rounded-md border border-border/70 bg-secondary/30 hover:border-accent hover:bg-secondary/60 transition"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded bg-secondary text-primary shrink-0">
                  <Shield className="h-4 w-4" />
                </div>
                <span className="font-display text-xs font-bold text-foreground truncate">
                  {teamName}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Admin Preload Modal (RF-103) */}
      {isPreloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="font-display text-lg font-black text-foreground flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Precargar Equipos por Temática (Admin)
              </h3>
              <button
                type="button"
                onClick={() => setIsPreloadModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {preloadError && (
              <div className="flex items-center gap-2 rounded bg-destructive/15 border border-destructive/40 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{preloadError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 font-mono">
                  Nombre de la Temática
                </label>
                <input
                  type="text"
                  value={editingTheme}
                  onChange={(e) => setEditingTheme(e.target.value)}
                  className="w-full rounded border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  placeholder="Ej. Apertura 2006, Clásicos PES 6..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 font-mono">
                  Listado de Equipos (un equipo por línea)
                </label>
                <textarea
                  rows={8}
                  value={editingTeamsText}
                  onChange={(e) => setEditingTeamsText(e.target.value)}
                  className="w-full rounded border border-border bg-secondary/50 p-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                  placeholder="Boca Juniors&#10;River Plate&#10;Estudiantes LP&#10;Vélez Sarsfield..."
                />
                <span className="text-[11px] text-muted-foreground">
                  Mínimo 4 equipos sin duplicados. Podés pegar una lista completa.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
              <SecondaryButton
                type="button"
                onClick={() => setIsPreloadModalOpen(false)}
                className="text-xs px-4 py-2"
              >
                Cancelar
              </SecondaryButton>
              <PrimaryButton
                type="button"
                disabled={isSavingPreload}
                onClick={handleSavePreload}
                className="text-xs px-4 py-2 glow-green"
              >
                <span>{isSavingPreload ? 'Guardando...' : 'Guardar Equipos'}</span>
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Cartel Ruleta de Desempate / Sorteo en Vivo (2.5 segundos) (T41) */}
      {isRouletteActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div className="mx-4 max-w-lg w-full rounded-2xl border-4 border-accent bg-background/95 p-8 text-center shadow-[0_0_50px_rgba(249,115,22,0.35)] space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent/20 border-2 border-accent text-accent">
              <Dices className="h-10 w-10 animate-spin" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-accent font-mono">
              🎲 ¡Desempate en Vivo por Ruleta!
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground">
              {rouletteCandidate === 'DIRECT_DRAW'
                ? 'Sorteo Directo de Equipos'
                : 'Sorteo de Orden de Elección (Draft)'}
            </h2>
            <p className="text-xs text-muted-foreground font-mono">
              Sorteando método de asignación...
            </p>
          </div>
        </div>
      )}

      {/* Cartel Grande: Anuncio del Método Ganador (3 segundos) (T35, T41) */}
      {winnerAnnouncement && !isRouletteActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div className="mx-4 max-w-lg w-full rounded-2xl border-4 border-primary bg-background/95 p-8 text-center shadow-[0_0_50px_rgba(74,222,128,0.35)] space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 border-2 border-primary text-primary">
              <Trophy className="h-10 w-10 animate-bounce" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              ¡Votación Concluida!
            </span>
            <h2 className="text-3xl font-black text-foreground">
              Método Ganador: <span className="text-primary text-glow">{winnerAnnouncement}</span>
            </h2>
            {voteResult?.wasDraw && (
              <p className="text-xs text-accent font-semibold">
                🎲 Hubo empate y el sistema desempató automáticamente al azar.
              </p>
            )}
            <p className="text-sm text-muted-foreground animate-pulse">
              Iniciando asignación automáticamente...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

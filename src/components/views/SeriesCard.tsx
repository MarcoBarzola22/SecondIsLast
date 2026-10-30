import { useState } from 'react';
import {
  Trophy,
  CheckCircle,
  RotateCcw,
  AlertTriangle,
  Hourglass,
  Send,
  Loader2,
  Lock,
} from 'lucide-react';
import {
  canEditSeries,
  getSeriesResult,
  isSeriesReady,
} from '../../domain/series';
import { calculateSuspensionInfo } from '../../domain/fairPlay';
import type { CardCounts, PlayerId, Series, Side } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { useAuth } from '../../context/AuthContext';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';

interface SeriesCardProps {
  series: Series;
  label: string;
}

export function SeriesCard({ series, label }: SeriesCardProps) {
  const { activeTournament, players } = useAppState();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const currentUserId = user?.playerId;

  const [isSubmittingProposal, setIsSubmittingProposal] = useState<boolean>(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  if (!activeTournament) return null;

  const { byes, teams, series: allSeries } = activeTournament;
  const matchFormat = activeTournament.matchFormat ?? 'two_legged';
  const isSingleMatch = matchFormat === 'single_match';

  const walkoverPlayerIds = activeTournament.walkoverPlayerIds ?? [];
  const isWalkoverA = series.playerA ? walkoverPlayerIds.includes(series.playerA) : false;
  const isWalkoverB = series.playerB ? walkoverPlayerIds.includes(series.playerB) : false;
  const isWalkoverSeries = isWalkoverA || isWalkoverB;

  const playersMap = new Map(players.map((p) => [p.id, p]));

  const ready = isSeriesReady(series);
  const result = getSeriesResult(series, matchFormat);
  const editable = canEditSeries(allSeries, series.id, matchFormat);

  const playerA = series.playerA ? playersMap.get(series.playerA) : null;
  const playerB = series.playerB ? playersMap.get(series.playerB) : null;

  const nameA = playerA ? `${playerA.lastName}, ${playerA.firstName}` : 'Por definir';
  const nameB = playerB ? `${playerB.lastName}, ${playerB.firstName}` : 'Por definir';

  const teamA = series.playerA ? teams[series.playerA] ?? 'Sin equipo' : '—';
  const teamB = series.playerB ? teams[series.playerB] ?? 'Sin equipo' : '—';

  const isByeA = series.playerA ? byes.includes(series.playerA) && series.round === 'semifinal' : false;
  const isByeB = series.playerB ? byes.includes(series.playerB) && series.round === 'semifinal' : false;

  const isWinnerA = series.confirmed && result.winner === series.playerA;
  const isWinnerB = series.confirmed && result.winner === series.playerB;

  // Find associated matches in activeTournament.matches if present
  const seriesMatches = activeTournament.matches?.filter(
    (m: any) => m.seriesId === series.id || m.id === series.id
  ) ?? [];
  const targetMatchLeg1 = seriesMatches.find((m: any) => m.leg === 1) || seriesMatches[0];
  const targetMatchLeg2 = seriesMatches.find((m: any) => m.leg === 2);

  // Status and version for Single Match
  const singleMatchStatus =
    targetMatchLeg1?.status || series.status || (series.confirmed ? 'CLOSED' : 'PENDING_SUBMISSION');
  const singleMatchVersion = targetMatchLeg1?.version ?? series.version ?? 1;

  // Status and version for Two-Legged
  const leg1Status =
    targetMatchLeg1?.status ||
    (series.leg1.a !== null && series.leg1.b !== null && !series.confirmed
      ? 'PENDING_CONFIRMATION'
      : series.confirmed
        ? 'CLOSED'
        : 'PENDING_SUBMISSION');
  const leg1Version = targetMatchLeg1?.version ?? 1;

  const leg2Status =
    targetMatchLeg2?.status ||
    (series.leg2.a !== null && series.leg2.b !== null && !series.confirmed
      ? 'PENDING_CONFIRMATION'
      : series.confirmed
        ? 'CLOSED'
        : 'PENDING_SUBMISSION');
  const leg2Version = targetMatchLeg2?.version ?? 1;

  // Local/Away roles
  // In single match: playerA is Local, playerB is Away
  const isLocalSingle = currentUserId ? currentUserId === series.playerA : true;
  const isAwaySingle = currentUserId ? currentUserId === series.playerB : false;

  // In two-legged:
  // Leg 1: playerA is Local, playerB is Away
  const isLocalLeg1 = currentUserId ? currentUserId === series.playerA : true;
  const isAwayLeg1 = currentUserId ? currentUserId === series.playerB : false;

  // Leg 2: playerB is Local, playerA is Away
  const isLocalLeg2 = currentUserId ? currentUserId === series.playerB : true;
  const isAwayLeg2 = currentUserId ? currentUserId === series.playerA : false;

  // Sequential locking between Leg 1 and Leg 2 (RF-114)
  const isLeg2SequentiallyLocked = !isSingleMatch && (leg1Status !== 'CLOSED');

  // Editing permissions (RF-106, RF-114)
  const canEditLeg1 =
    !series.confirmed &&
    !isWalkoverSeries &&
    (currentUserId
      ? isLocalLeg1 && (isSingleMatch ? singleMatchStatus === 'PENDING_SUBMISSION' : leg1Status === 'PENDING_SUBMISSION')
      : true);

  const canEditLeg2 =
    !series.confirmed &&
    !isWalkoverSeries &&
    !isLeg2SequentiallyLocked &&
    (currentUserId ? isLocalLeg2 && leg2Status === 'PENDING_SUBMISSION' : true);

  // Penalties: enabled if Local of the tiebreaking match (RF-106)
  const canSelectPenalties =
    !series.confirmed &&
    !isWalkoverSeries &&
    !isLeg2SequentiallyLocked &&
    (currentUserId
      ? isSingleMatch
        ? isLocalSingle && singleMatchStatus === 'PENDING_SUBMISSION'
        : isLocalLeg2 && leg2Status === 'PENDING_SUBMISSION'
      : true);

  const handleScoreChange = (
    leg: 'leg1' | 'leg2',
    side: Side,
    valueStr: string
  ) => {
    const canEdit = leg === 'leg1' ? canEditLeg1 : canEditLeg2;
    if (!canEdit) return;

    const existingCards = side === 'a' ? series[leg].cardsA : series[leg].cardsB;
    const trimmed = valueStr.trim();
    if (trimmed === '') {
      dispatch({
        type: 'LEG_SCORE_SET',
        seriesId: series.id,
        leg,
        side,
        value: null,
        cards: existingCards,
      });
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99) {
      dispatch({
        type: 'LEG_SCORE_SET',
        seriesId: series.id,
        leg,
        side,
        value: parsed,
        cards: existingCards,
      });
    }
  };

  const handleCardChange = (
    leg: 'leg1' | 'leg2',
    side: Side,
    cardType: 'yellow' | 'red',
    valueStr: string
  ) => {
    const canEdit = leg === 'leg1' ? canEditLeg1 : canEditLeg2;
    if (!canEdit) return;

    const currentCards =
      (side === 'a' ? series[leg].cardsA : series[leg].cardsB) ?? {
        yellow: 0,
        red: 0,
      };
    const trimmed = valueStr.trim();
    if (trimmed === '') {
      const updatedCards: CardCounts = {
        ...currentCards,
        [cardType]: 0,
      };
      dispatch({
        type: 'LEG_SCORE_SET',
        seriesId: series.id,
        leg,
        side,
        value: series[leg][side],
        cards: updatedCards,
      });
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99) {
      const updatedCards: CardCounts = {
        ...currentCards,
        [cardType]: parsed,
      };
      dispatch({
        type: 'LEG_SCORE_SET',
        seriesId: series.id,
        leg,
        side,
        value: series[leg][side],
        cards: updatedCards,
      });
    }
  };

  const handlePenaltyChange = (winnerId: PlayerId | null) => {
    if (!canSelectPenalties) return;
    dispatch({
      type: 'PENALTY_WINNER_SET',
      seriesId: series.id,
      playerId: winnerId,
    });
  };

  const handleConfirm = () => {
    if (!result.canConfirm || isWalkoverSeries) return;
    dispatch({ type: 'SERIES_CONFIRMED', seriesId: series.id });
  };

  const handleReopen = () => {
    if (!editable || isWalkoverSeries) return;
    dispatch({ type: 'SERIES_EDIT_REQUESTED', seriesId: series.id });
  };

  const handleSubmitSingleMatch = async () => {
    if (series.leg1.a === null || series.leg1.b === null || series.confirmed || isWalkoverSeries) return;
    if (result.isTied && !series.penaltyWinner) {
      setProposalError('En caso de empate, tenés que indicar quién ganó por penales antes de enviar.');
      return;
    }
    setIsSubmittingProposal(true);
    setProposalError(null);
    try {
      const matchId = series.matchIdLeg1 || targetMatchLeg1?.id || series.id;
      const res = await fetch(`/api/matches/${matchId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          homeScore: series.leg1.a,
          awayScore: series.leg1.b,
          homeYellowCards: series.leg1.cardsA?.yellow ?? 0,
          awayYellowCards: series.leg1.cardsB?.yellow ?? 0,
          homeRedCards: series.leg1.cardsA?.red ?? 0,
          awayRedCards: series.leg1.cardsB?.red ?? 0,
          penaltiesWinnerId: series.penaltyWinner ?? null,
          expectedVersion: singleMatchVersion,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al enviar propuesta al rival.');
      }

      window.dispatchEvent(new CustomEvent('tournament-rehydrate'));
    } catch (err: any) {
      setProposalError(err.message || 'Error de conexión.');
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleSubmitLeg = async (leg: 'leg1' | 'leg2') => {
    const isLeg1 = leg === 'leg1';
    const scoreHome = isLeg1 ? series.leg1.a : series.leg2.b;
    const scoreAway = isLeg1 ? series.leg1.b : series.leg2.a;
    const cardsHome = isLeg1 ? series.leg1.cardsA : series.leg2.cardsB;
    const cardsAway = isLeg1 ? series.leg1.cardsB : series.leg2.cardsA;
    const targetMatch = isLeg1 ? targetMatchLeg1 : targetMatchLeg2;
    const expectedVer = isLeg1 ? leg1Version : leg2Version;

    if (scoreHome === null || scoreAway === null) return;
    if (!isLeg1 && result.isTied && !series.penaltyWinner) {
      setProposalError('En caso de empate global, tenés que indicar quién ganó por penales antes de enviar.');
      return;
    }

    setIsSubmittingProposal(true);
    setProposalError(null);
    try {
      const matchId = isLeg1
        ? (series.matchIdLeg1 || targetMatch?.id || `${series.id}_leg1`)
        : (series.matchIdLeg2 || targetMatch?.id || `${series.id}_leg2`);
      const res = await fetch(`/api/matches/${matchId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          homeScore: scoreHome,
          awayScore: scoreAway,
          homeYellowCards: cardsHome?.yellow ?? 0,
          awayYellowCards: cardsAway?.yellow ?? 0,
          homeRedCards: cardsHome?.red ?? 0,
          awayRedCards: cardsAway?.red ?? 0,
          penaltiesWinnerId: !isLeg1 ? (series.penaltyWinner ?? null) : null,
          expectedVersion: expectedVer,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error al enviar partido de ${isLeg1 ? 'ida' : 'vuelta'}.`);
      }

      window.dispatchEvent(new CustomEvent('tournament-rehydrate'));
    } catch (err: any) {
      setProposalError(err.message || 'Error de conexión.');
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const openSingleMatchReview = () => {
    window.dispatchEvent(
      new CustomEvent('open-handshake-modal', {
        detail: {
          id: targetMatchLeg1?.id || series.id,
          seriesId: series.id,
          homePlayerId: series.playerA!,
          awayPlayerId: series.playerB!,
          homePlayerName: nameA,
          homeTeamName: teamA,
          awayPlayerName: nameB,
          awayTeamName: teamB,
          homeScore: series.leg1.a ?? 0,
          awayScore: series.leg1.b ?? 0,
          homeYellowCards: series.leg1.cardsA?.yellow ?? 0,
          awayYellowCards: series.leg1.cardsB?.yellow ?? 0,
          homeRedCards: series.leg1.cardsA?.red ?? 0,
          awayRedCards: series.leg1.cardsB?.red ?? 0,
          penaltiesWinnerId: series.penaltyWinner ?? null,
          penaltiesWinnerName:
            series.penaltyWinner === series.playerA
              ? nameA
              : series.penaltyWinner === series.playerB
                ? nameB
                : null,
          version: singleMatchVersion,
          status: singleMatchStatus,
        },
      })
    );
  };

  const openLeg1Review = () => {
    window.dispatchEvent(
      new CustomEvent('open-handshake-modal', {
        detail: {
          id: targetMatchLeg1?.id || `${series.id}_leg1`,
          seriesId: series.id,
          leg: 1,
          homePlayerId: series.playerA!,
          awayPlayerId: series.playerB!,
          homePlayerName: nameA,
          homeTeamName: teamA,
          awayPlayerName: nameB,
          awayTeamName: teamB,
          homeScore: series.leg1.a ?? 0,
          awayScore: series.leg1.b ?? 0,
          homeYellowCards: series.leg1.cardsA?.yellow ?? 0,
          awayYellowCards: series.leg1.cardsB?.yellow ?? 0,
          homeRedCards: series.leg1.cardsA?.red ?? 0,
          awayRedCards: series.leg1.cardsB?.red ?? 0,
          version: leg1Version,
          status: leg1Status,
        },
      })
    );
  };

  const openLeg2Review = () => {
    window.dispatchEvent(
      new CustomEvent('open-handshake-modal', {
        detail: {
          id: targetMatchLeg2?.id || `${series.id}_leg2`,
          seriesId: series.id,
          leg: 2,
          homePlayerId: series.playerB!,
          awayPlayerId: series.playerA!,
          homePlayerName: nameB,
          homeTeamName: teamB,
          awayPlayerName: nameA,
          awayTeamName: teamA,
          homeScore: series.leg2.b ?? 0,
          awayScore: series.leg2.a ?? 0,
          homeYellowCards: series.leg2.cardsB?.yellow ?? 0,
          awayYellowCards: series.leg2.cardsA?.yellow ?? 0,
          homeRedCards: series.leg2.cardsB?.red ?? 0,
          awayRedCards: series.leg2.cardsA?.red ?? 0,
          penaltiesWinnerId: series.penaltyWinner ?? null,
          penaltiesWinnerName:
            series.penaltyWinner === series.playerA
              ? nameA
              : series.penaltyWinner === series.playerB
                ? nameB
                : null,
          version: leg2Version,
          status: leg2Status,
        },
      })
    );
  };

  const renderSideHeader = (
    name: string,
    team: string,
    isBye: boolean,
    isWinner: boolean,
    isWalkover: boolean,
    playerId?: PlayerId | null
  ) => {
    const isConfirmed = series.confirmed;
    const susp = playerId ? activeTournament.suspensions?.[playerId] : null;
    const playerObj = playerId ? playersMap.get(playerId) : null;
    const yCards = susp?.yellowAccumulated ?? (playerObj?.pendingYellowCards ?? 0);
    const rCards = susp?.redPending ?? (playerObj?.pendingRedCards ?? 0);
    const suspInfo = calculateSuspensionInfo(yCards, rCards);

    return (
      <div
        className={`flex flex-col gap-1 px-4 py-2.5 transition ${
          isWalkover
            ? 'bg-destructive/10'
            : isWinner
              ? 'bg-primary/15'
              : 'bg-background/40'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p
                className={`truncate font-semibold ${
                  isWalkover
                    ? 'text-destructive line-through'
                    : isWinner
                      ? 'text-primary'
                      : 'text-foreground'
                }`}
              >
                {name}
              </p>
              {!isConfirmed && !isWalkover && (suspInfo.yellowCycle > 0 || suspInfo.yellowAccumulated >= 4) && (
                <span
                  className="rounded border border-amber-500/40 bg-amber-500/20 px-1.5 py-0.2 font-display text-[10px] font-bold text-amber-300"
                  title="Amarillas acumuladas hacia la próxima sanción"
                >
                  🟨 {suspInfo.yellowCycle > 0 ? `${suspInfo.yellowCycle}/4` : '4/4'}
                </span>
              )}
              {isWalkover && (
                <span className="rounded border border-destructive/40 bg-destructive/20 px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-destructive flex items-center gap-0.5">
                  <AlertTriangle className="h-2.5 w-2.5" /> W.O.
                </span>
              )}
              {isBye && (
                <span className="rounded border border-accent/40 bg-accent/20 px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-accent">
                  Pase directo
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">{team}</p>
          </div>

          {isWinner && <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />}
        </div>

        {/* Banner de Sanción Disciplinaria (RF-Sanciones) */}
        {!isConfirmed && !isWalkover && suspInfo.isSuspended && (
          <div className="mt-1 flex items-center gap-1.5 rounded border border-amber-400/60 bg-destructive/20 px-2 py-1 text-xs font-bold text-amber-300 shadow-sm animate-pulse">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>
              🚨 SANCIONADO: {suspInfo.suspendedCount === 1 ? 'Su MEJOR JUGADOR' : `Sus ${suspInfo.suspendedCount} MEJORES JUGADORES`}{' '}
              no {suspInfo.suspendedCount === 1 ? 'puede' : 'pueden'} jugar este partido ({suspInfo.motivo})
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`overflow-hidden rounded-md border transition ${
        isWalkoverSeries
          ? 'border-destructive/40 bg-card/80 opacity-90'
          : series.confirmed
            ? 'border-border/80 bg-card/90'
            : ready
              ? 'border-accent/70 bg-card shadow-[0_0_15px_rgba(56,189,248,0.15)]'
              : 'border-border/40 bg-card/40 opacity-70'
      }`}
    >
      {/* Header de la serie */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-1.5">
        <span className="font-display text-xs font-bold uppercase tracking-widest text-accent">
          {label}
        </span>
        {isWalkoverSeries ? (
          <span className="flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> W.O. (Abandono)
          </span>
        ) : series.confirmed ? (
          <span className="flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-primary">
            <CheckCircle className="h-3.5 w-3.5" /> Confirmada
          </span>
        ) : null}
      </div>

      {/* Participante A */}
      {renderSideHeader(nameA, teamA, isByeA, isWinnerA, isWalkoverA, series.playerA)}

      {/* Bloque central de resultados */}
      <div className="border-y border-border bg-background/60 p-3">
        {ready ? (
          <>
            {isSingleMatch ? (
              /* Modalidad Partido Único (RF-21, RF-49) */
              <div className="space-y-2">
                <div className="text-center font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Partido Único</span>
                </div>

                <div className="flex items-center justify-center">
                  <div className="flex items-center justify-center gap-2 rounded bg-background/80 p-1.5 border border-border/50">
                    <input
                      type="number"
                      min={0}
                      max={99}
                      disabled={!canEditLeg1}
                      value={series.leg1.a ?? ''}
                      onChange={(e) =>
                        handleScoreChange('leg1', 'a', e.target.value)
                      }
                      placeholder="0"
                      className="h-10 w-12 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                      title={`Goles de ${nameA}`}
                    />
                    <span className="text-muted-foreground font-bold text-lg">-</span>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      disabled={!canEditLeg1}
                      value={series.leg1.b ?? ''}
                      onChange={(e) =>
                        handleScoreChange('leg1', 'b', e.target.value)
                      }
                      placeholder="0"
                      className="h-10 w-12 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                      title={`Goles de ${nameB}`}
                    />
                  </div>
                </div>

                {/* Inputs de Tarjetas (Fair Play) */}
                <div className="flex items-center justify-between gap-1 rounded bg-background/50 px-2 py-1.5 border border-border/40 text-[11px]">
                  {/* Tarjetas Jugador A */}
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1" title={`Tarjetas amarillas de ${nameA}`}>
                      <span className="inline-block h-3 w-2 rounded-[1px] bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]" />
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={!canEditLeg1}
                        value={series.leg1.cardsA?.yellow ?? ''}
                        onChange={(e) => handleCardChange('leg1', 'a', 'yellow', e.target.value)}
                        placeholder="0"
                        className="h-6 w-8 rounded-sm border border-field-border bg-field text-center font-mono text-xs font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
                      />
                    </div>
                    <div className="flex items-center gap-1" title={`Tarjetas rojas de ${nameA}`}>
                      <span className="inline-block h-3 w-2 rounded-[1px] bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]" />
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={!canEditLeg1}
                        value={series.leg1.cardsA?.red ?? ''}
                        onChange={(e) => handleCardChange('leg1', 'a', 'red', e.target.value)}
                        placeholder="0"
                        className="h-6 w-8 rounded-sm border border-field-border bg-field text-center font-mono text-xs font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                      />
                    </div>
                  </div>

                  <span className="font-display text-[9px] font-bold uppercase tracking-wider text-muted-foreground select-none">
                    Tarjetas
                  </span>

                  {/* Tarjetas Jugador B */}
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1" title={`Tarjetas amarillas de ${nameB}`}>
                      <span className="inline-block h-3 w-2 rounded-[1px] bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]" />
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={!canEditLeg1}
                        value={series.leg1.cardsB?.yellow ?? ''}
                        onChange={(e) => handleCardChange('leg1', 'b', 'yellow', e.target.value)}
                        placeholder="0"
                        className="h-6 w-8 rounded-sm border border-field-border bg-field text-center font-mono text-xs font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
                      />
                    </div>
                    <div className="flex items-center gap-1" title={`Tarjetas rojas de ${nameB}`}>
                      <span className="inline-block h-3 w-2 rounded-[1px] bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]" />
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={!canEditLeg1}
                        value={series.leg1.cardsB?.red ?? ''}
                        onChange={(e) => handleCardChange('leg1', 'b', 'red', e.target.value)}
                        placeholder="0"
                        className="h-6 w-8 rounded-sm border border-field-border bg-field text-center font-mono text-xs font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Modalidad Ida y Vuelta (RF-21) */
              <div>
                {/* Headers de partidos */}
                <div className="grid grid-cols-2 gap-2 text-center font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Ida (L - V)</span>
                  <span>Vuelta (L - V)</span>
                </div>

                {/* Inputs de Ida y Vuelta */}
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  {/* Partido de Ida: A es local, B es visitante */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-center gap-1.5 rounded bg-background/80 p-1.5 border border-border/50">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={!canEditLeg1}
                        value={series.leg1.a ?? ''}
                        onChange={(e) =>
                          handleScoreChange('leg1', 'a', e.target.value)
                        }
                        placeholder="0"
                        className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                        title={`Goles de ${nameA} en la Ida (Local)`}
                      />
                      <span className="text-muted-foreground font-bold">-</span>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={!canEditLeg1}
                        value={series.leg1.b ?? ''}
                        onChange={(e) =>
                          handleScoreChange('leg1', 'b', e.target.value)
                        }
                        placeholder="0"
                        className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                        title={`Goles de ${nameB} en la Ida (Visitante)`}
                      />
                    </div>

                    {/* Tarjetas Ida (A local - B visitante) */}
                    <div className="flex items-center justify-between gap-1 rounded bg-background/50 px-1.5 py-1 border border-border/40 text-[10px]">
                      {/* A local */}
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-0.5" title={`Amarillas de ${nameA} (Ida)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-amber-400" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={!canEditLeg1}
                            value={series.leg1.cardsA?.yellow ?? ''}
                            onChange={(e) => handleCardChange('leg1', 'a', 'yellow', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
                          />
                        </div>
                        <div className="flex items-center gap-0.5" title={`Rojas de ${nameA} (Ida)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-red-500" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={!canEditLeg1}
                            value={series.leg1.cardsA?.red ?? ''}
                            onChange={(e) => handleCardChange('leg1', 'a', 'red', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                          />
                        </div>
                      </div>

                      {/* B visitante */}
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-0.5" title={`Amarillas de ${nameB} (Ida)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-amber-400" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={!canEditLeg1}
                            value={series.leg1.cardsB?.yellow ?? ''}
                            onChange={(e) => handleCardChange('leg1', 'b', 'yellow', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
                          />
                        </div>
                        <div className="flex items-center gap-0.5" title={`Rojas de ${nameB} (Ida)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-red-500" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={!canEditLeg1}
                            value={series.leg1.cardsB?.red ?? ''}
                            onChange={(e) => handleCardChange('leg1', 'b', 'red', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Partido de Vuelta: B es local, A es visitante */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-center gap-1.5 rounded bg-background/80 p-1.5 border border-border/50">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={!canEditLeg2}
                        value={series.leg2.b ?? ''}
                        onChange={(e) =>
                          handleScoreChange('leg2', 'b', e.target.value)
                        }
                        placeholder="0"
                        className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                        title={`Goles de ${nameB} en la Vuelta (Local)`}
                      />
                      <span className="text-muted-foreground font-bold">-</span>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={!canEditLeg2}
                        value={series.leg2.a ?? ''}
                        onChange={(e) =>
                          handleScoreChange('leg2', 'a', e.target.value)
                        }
                        placeholder="0"
                        className="h-10 w-11 rounded-sm border-2 border-field-border bg-field text-center font-display text-lg font-bold text-foreground outline-none transition focus:border-accent focus:glow-blue disabled:opacity-80"
                        title={`Goles de ${nameA} en la Vuelta (Visitante)`}
                      />
                    </div>

                    {/* Tarjetas Vuelta (B local - A visitante) */}
                    <div className="flex items-center justify-between gap-1 rounded bg-background/50 px-1.5 py-1 border border-border/40 text-[10px]">
                      {/* B local */}
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-0.5" title={`Amarillas de ${nameB} (Vuelta)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-amber-400" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={!canEditLeg2}
                            value={series.leg2.cardsB?.yellow ?? ''}
                            onChange={(e) => handleCardChange('leg2', 'b', 'yellow', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
                          />
                        </div>
                        <div className="flex items-center gap-0.5" title={`Rojas de ${nameB} (Vuelta)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-red-500" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={!canEditLeg2}
                            value={series.leg2.cardsB?.red ?? ''}
                            onChange={(e) => handleCardChange('leg2', 'b', 'red', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                          />
                        </div>
                      </div>

                      {/* A visitante */}
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-0.5" title={`Amarillas de ${nameA} (Vuelta)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-amber-400" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={!canEditLeg2}
                            value={series.leg2.cardsA?.yellow ?? ''}
                            onChange={(e) => handleCardChange('leg2', 'a', 'yellow', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-amber-400 disabled:opacity-80"
                          />
                        </div>
                        <div className="flex items-center gap-0.5" title={`Rojas de ${nameA} (Vuelta)`}>
                          <span className="inline-block h-2.5 w-1.5 rounded-[1px] bg-red-500" />
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={!canEditLeg2}
                            value={series.leg2.cardsA?.red ?? ''}
                            onChange={(e) => handleCardChange('leg2', 'a', 'red', e.target.value)}
                            placeholder="0"
                            className="h-5 w-6 rounded-sm border border-field-border bg-field text-center font-mono text-[11px] font-bold text-foreground outline-none transition focus:border-red-400 disabled:opacity-80"
                          />
                        </div>
                      </div>
                    </div>
                    {isLeg2SequentiallyLocked && (
                      <div className="flex items-center justify-center gap-1.5 rounded border border-amber-500/30 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-200">
                        <Lock className="h-3 w-3 text-amber-400 shrink-0" />
                        <span>Bloqueado: debe cerrarse la Ida primero</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Global en vivo (RF-24) */}
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-xs">
                  <span className="uppercase tracking-widest text-muted-foreground">
                    Global acumulado:
                  </span>
                  <span className="font-display text-xl font-black text-foreground">
                    {result.isComplete ||
                    result.globalA > 0 ||
                    result.globalB > 0
                      ? `${result.globalA} - ${result.globalB}`
                      : '—'}
                  </span>
                </div>
              </div>
            )}

            {/* Selector de penales en caso de empate (RF-25) */}
            {result.isTied && (
              <div className="mt-3 rounded-sm border border-accent bg-accent/10 p-2 text-left">
                <label className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-accent">
                  {isSingleMatch
                    ? 'Empate · Ganador por penales:'
                    : 'Empate global · Ganador por penales:'}
                </label>
                <select
                  disabled={!canSelectPenalties}
                  value={series.penaltyWinner ?? ''}
                  onChange={(e) =>
                    handlePenaltyChange(
                      (e.target.value || null) as PlayerId | null
                    )
                  }
                  className="w-full rounded-sm border border-field-border bg-field px-2.5 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-accent disabled:opacity-75"
                >
                  <option value="">Seleccionar quién ganó por penales...</option>
                  {series.playerA && (
                    <option value={series.playerA}>
                      {nameA} ({teamA})
                    </option>
                  )}
                  {series.playerB && (
                    <option value={series.playerB}>
                      {nameB} ({teamB})
                    </option>
                  )}
                </select>
              </div>
            )}
          </>
        ) : (
          <p className="py-4 text-center font-display text-xs uppercase tracking-widest text-muted-foreground">
            Esperando definición de rondas previas
          </p>
        )}
      </div>

      {/* Participante B */}
      {renderSideHeader(nameB, teamB, isByeB, isWinnerB, isWalkoverB, series.playerB)}

      {/* Botón de acción: Handshake / Confirmar / Corregir */}
      {ready && (
        <div className="flex flex-col gap-2 border-t border-border bg-secondary/30 px-3 py-2">
          {proposalError && (
            <div className="bg-destructive/15 border border-destructive/30 rounded px-2.5 py-1 text-[11px] text-destructive font-medium">
              {proposalError}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 min-h-[32px]">
            {/* Status indicator */}
            <div className="text-[11px] text-muted-foreground truncate">
              {isWalkoverSeries ? (
                <span className="text-destructive/85 italic">Bloqueada por abandono (W.O.)</span>
              ) : isSingleMatch ? (
                singleMatchStatus === 'PENDING_CONFIRMATION' ? (
                  isAwaySingle ? (
                    <span className="text-primary font-medium">¡Te enviaron el resultado! Revisalo</span>
                  ) : isLocalSingle ? (
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <Hourglass className="h-3 w-3 animate-spin" /> Esperando confirmación rival
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">En revisión de rivales</span>
                  )
                ) : !series.confirmed && currentUserId && !isLocalSingle ? (
                  <span className="text-muted-foreground italic">Esperando carga del Local</span>
                ) : null
              ) : (
                // Two-legged
                leg1Status === 'PENDING_CONFIRMATION' ? (
                  isAwayLeg1 ? (
                    <span className="text-primary font-medium">¡Te enviaron la Ida! Revisala</span>
                  ) : isLocalLeg1 ? (
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <Hourglass className="h-3 w-3 animate-spin" /> Esperando confirmación Ida
                    </span>
                  ) : null
                ) : leg2Status === 'PENDING_CONFIRMATION' ? (
                  isAwayLeg2 ? (
                    <span className="text-primary font-medium">¡Te enviaron la Vuelta! Revisala</span>
                  ) : isLocalLeg2 ? (
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <Hourglass className="h-3 w-3 animate-spin" /> Esperando confirmación Vuelta
                    </span>
                  ) : null
                ) : !series.confirmed && currentUserId ? (
                  (leg1Status === 'PENDING_SUBMISSION' && !isLocalLeg1) ||
                  (leg1Status === 'CLOSED' && leg2Status === 'PENDING_SUBMISSION' && !isLocalLeg2) ? (
                    <span className="text-muted-foreground italic">Esperando carga del Local</span>
                  ) : null
                ) : null
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              {isWalkoverSeries ? null : isSingleMatch ? (
                singleMatchStatus === 'PENDING_CONFIRMATION' && isAwaySingle ? (
                  <PrimaryButton
                    onClick={openSingleMatchReview}
                    className="py-1 px-3 text-xs bg-primary text-primary-foreground shadow-[0_0_12px_rgba(34,197,94,0.3)]"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Revisar y Confirmar
                  </PrimaryButton>
                ) : !series.confirmed && singleMatchStatus === 'PENDING_SUBMISSION' ? (
                  currentUserId ? (
                    isLocalSingle ? (
                      <PrimaryButton
                        disabled={series.leg1.a === null || series.leg1.b === null || (result.isTied && !series.penaltyWinner) || isSubmittingProposal}
                        onClick={handleSubmitSingleMatch}
                        className="py-1 px-3 text-xs"
                      >
                        {isSubmittingProposal ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Send className="h-3 w-3 mr-1" />
                        )}
                        Enviar al rival
                      </PrimaryButton>
                    ) : null
                  ) : (
                    <PrimaryButton
                      disabled={!result.canConfirm}
                      onClick={handleConfirm}
                      className="py-1.5 px-4 text-xs"
                    >
                      Confirmar Llave
                    </PrimaryButton>
                  )
                ) : editable ? (
                  <SecondaryButton
                    onClick={handleReopen}
                    className="py-1 px-3 text-[11px]"
                    title="Corregir los goles de esta llave"
                  >
                    <RotateCcw className="h-3 w-3" /> Corregir
                  </SecondaryButton>
                ) : (
                  <span className="text-[11px] text-muted-foreground/70 italic">
                    Bloqueada por rondas siguientes
                  </span>
                )
              ) : (
                // Two-legged
                !series.confirmed ? (
                  leg1Status === 'PENDING_CONFIRMATION' && isAwayLeg1 ? (
                    <PrimaryButton
                      onClick={openLeg1Review}
                      className="py-1 px-3 text-xs bg-primary text-primary-foreground shadow-[0_0_12px_rgba(34,197,94,0.3)]"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Revisar y Confirmar Ida
                    </PrimaryButton>
                  ) : leg1Status === 'PENDING_SUBMISSION' && isLocalLeg1 && currentUserId ? (
                    <PrimaryButton
                      disabled={series.leg1.a === null || series.leg1.b === null || isSubmittingProposal}
                      onClick={() => handleSubmitLeg('leg1')}
                      className="py-1 px-3 text-xs"
                    >
                      {isSubmittingProposal ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Send className="h-3 w-3 mr-1" />
                      )}
                      Enviar Ida al rival
                    </PrimaryButton>
                  ) : leg2Status === 'PENDING_CONFIRMATION' && isAwayLeg2 ? (
                    <PrimaryButton
                      onClick={openLeg2Review}
                      className="py-1 px-3 text-xs bg-primary text-primary-foreground shadow-[0_0_12px_rgba(34,197,94,0.3)]"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Revisar y Confirmar Vuelta
                    </PrimaryButton>
                  ) : leg2Status === 'PENDING_SUBMISSION' && isLocalLeg2 && currentUserId ? (
                    <PrimaryButton
                      disabled={series.leg2.a === null || series.leg2.b === null || (result.isTied && !series.penaltyWinner) || isSubmittingProposal}
                      onClick={() => handleSubmitLeg('leg2')}
                      className="py-1 px-3 text-xs"
                    >
                      {isSubmittingProposal ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Send className="h-3 w-3 mr-1" />
                      )}
                      Enviar Vuelta al rival
                    </PrimaryButton>
                  ) : !currentUserId ? (
                    <PrimaryButton
                      disabled={!result.canConfirm}
                      onClick={handleConfirm}
                      className="py-1.5 px-4 text-xs"
                    >
                      Confirmar Llave
                    </PrimaryButton>
                  ) : result.canConfirm ? (
                    <PrimaryButton
                      onClick={handleConfirm}
                      className="py-1.5 px-4 text-xs"
                    >
                      Cerrar Llave
                    </PrimaryButton>
                  ) : null
                ) : editable ? (
                  <SecondaryButton
                    onClick={handleReopen}
                    className="py-1 px-3 text-[11px]"
                    title="Corregir los goles de esta llave"
                  >
                    <RotateCcw className="h-3 w-3" /> Corregir
                  </SecondaryButton>
                ) : (
                  <span className="text-[11px] text-muted-foreground/70 italic">
                    Bloqueada por rondas siguientes
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

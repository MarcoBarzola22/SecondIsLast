import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trophy,
  Swords,
  Loader2,
  X,
  ShieldCheck,
} from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export interface HandshakeMatchData {
  id: string; // matchId
  round?: number;
  leg?: number;
  seriesId?: string | null;
  homePlayerId: string;
  awayPlayerId: string;
  homePlayerName: string;
  homeTeamName?: string;
  awayPlayerName: string;
  awayTeamName?: string;
  homeScore: number;
  awayScore: number;
  homeYellowCards?: number;
  awayYellowCards?: number;
  homeRedCards?: number;
  awayRedCards?: number;
  penaltiesWinnerId?: string | null;
  penaltiesWinnerName?: string | null;
  version: number;
  status?: string;
}

interface HandshakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchData: HandshakeMatchData | null;
  onSuccess?: (updatedMatch?: any) => void;
  onRefresh?: (matchId: string) => Promise<HandshakeMatchData | null | void>;
}

export function HandshakeModal({
  isOpen,
  onClose,
  matchData: initialMatchData,
  onSuccess,
  onRefresh,
}: HandshakeModalProps) {
  const [matchData, setMatchData] = useState<HandshakeMatchData | null>(initialMatchData);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { isOffline } = useNetworkStatus();

  useEffect(() => {
    setMatchData(initialMatchData);
    setConflictMessage(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [initialMatchData]);

  if (!isOpen || !matchData) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setConflictMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/matches/${matchData.id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ expectedVersion: matchData.version }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        // RF-109: Spanish Rioplatense notification on version mismatch
        setConflictMessage(
          '¡Che, el Local modificó el resultado mientras confirmabas! Se actualizaron los datos, revisá de nuevo antes de aceptar.'
        );

        // Rehydrate updated match data
        if (onRefresh) {
          const refreshed = await onRefresh(matchData.id);
          if (refreshed) {
            setMatchData(refreshed);
          }
        } else {
          // Direct fallback fetch
          const refRes = await fetch(`/api/matches/${matchData.id}`, {
            credentials: 'include',
          });
          if (refRes.ok) {
            const refData = await refRes.json();
            if (refData.match) {
              setMatchData((prev) =>
                prev
                  ? {
                      ...prev,
                      homeScore: refData.match.homeScore ?? prev.homeScore,
                      awayScore: refData.match.awayScore ?? prev.awayScore,
                      homeYellowCards: refData.match.homeYellowCards ?? prev.homeYellowCards,
                      awayYellowCards: refData.match.awayYellowCards ?? prev.awayYellowCards,
                      homeRedCards: refData.match.homeRedCards ?? prev.homeRedCards,
                      awayRedCards: refData.match.awayRedCards ?? prev.awayRedCards,
                      penaltiesWinnerId: refData.match.penaltiesWinnerId ?? prev.penaltiesWinnerId,
                      version: refData.match.version ?? prev.version,
                    }
                  : null
              );
            }
          }
        }
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Error al confirmar el resultado del partido.');
      }

      setSuccessMessage('¡Partido confirmado con éxito! El resultado quedó cerrado.');
      if (onSuccess) {
        onSuccess(data);
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión al confirmar el partido.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    setConflictMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/matches/${matchData.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ expectedVersion: matchData.version }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setConflictMessage(
          '¡Che, el partido fue modificado previamente! Se actualizaron los datos.'
        );
        if (onRefresh) {
          const refreshed = await onRefresh(matchData.id);
          if (refreshed) {
            setMatchData(refreshed);
          }
        }
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Error al rechazar el resultado del partido.');
      }

      setSuccessMessage('Propuesta rechazada. El partido volvió a pendiente de carga para el Local.');
      if (onSuccess) {
        onSuccess(data);
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión al rechazar el partido.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-accent/40 bg-card shadow-[0_0_35px_rgba(56,189,248,0.2)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <div>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                Revisión de Resultado (Handshake)
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {matchData.seriesId ? `Serie ${matchData.seriesId}` : `Fecha ${matchData.round ?? 1}`}
                {matchData.leg ? ` · Partido ${matchData.leg}` : ''} · Versión v{matchData.version}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
            aria-label="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground text-center">
            El jugador Local cargó el siguiente resultado. Por favor, verificá goles y tarjetas antes de aceptar.
          </p>

          {/* Conflict Alert (RF-109 OCC Rioplatense) */}
          {conflictMessage && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/50 bg-amber-950/40 p-3 text-amber-200 shadow-inner">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed font-sans font-medium">
                {conflictMessage}
              </div>
            </div>
          )}

          {/* Generic Error */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/15 p-3 text-destructive shadow-inner">
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed font-sans font-medium">
                {errorMessage}
              </div>
            </div>
          )}

          {/* Success Notification */}
          {successMessage && (
            <div className="flex items-start gap-2.5 rounded-lg border border-primary/50 bg-primary/15 p-3 text-primary shadow-inner">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed font-sans font-medium">
                {successMessage}
              </div>
            </div>
          )}

          {/* Comparison Scoreboard Card */}
          <div className="rounded-lg border border-border/70 bg-background/70 p-4 shadow-sm">
            <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3">
              {/* Local */}
              <div className="text-center space-y-1">
                <span className="inline-block rounded bg-accent/15 border border-accent/40 px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-accent">
                  Local
                </span>
                <p className="font-semibold text-sm text-foreground truncate" title={matchData.homePlayerName}>
                  {matchData.homePlayerName}
                </p>
                <p className="text-[11px] text-muted-foreground truncate" title={matchData.homeTeamName}>
                  {matchData.homeTeamName || 'Sin equipo'}
                </p>
                <div className="mt-2 text-3xl font-black font-display text-foreground">
                  {matchData.homeScore}
                </div>
                {/* Tarjetas Local */}
                <div className="flex items-center justify-center gap-2 pt-1 text-[11px] font-mono font-bold">
                  <span className="flex items-center gap-1" title="Tarjetas amarillas">
                    <span className="inline-block h-3 w-2 rounded-[1px] bg-amber-400" />
                    {matchData.homeYellowCards ?? 0}
                  </span>
                  <span className="flex items-center gap-1" title="Tarjetas rojas">
                    <span className="inline-block h-3 w-2 rounded-[1px] bg-red-500" />
                    {matchData.homeRedCards ?? 0}
                  </span>
                </div>
              </div>

              {/* VS Divider */}
              <div className="flex flex-col items-center justify-center px-1">
                <Swords className="h-5 w-5 text-muted-foreground/60 mb-1" />
                <span className="font-display text-xs font-bold uppercase text-muted-foreground">
                  VS
                </span>
              </div>

              {/* Visitante */}
              <div className="text-center space-y-1">
                <span className="inline-block rounded bg-primary/15 border border-primary/40 px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-primary">
                  Visitante (Vos)
                </span>
                <p className="font-semibold text-sm text-foreground truncate" title={matchData.awayPlayerName}>
                  {matchData.awayPlayerName}
                </p>
                <p className="text-[11px] text-muted-foreground truncate" title={matchData.awayTeamName}>
                  {matchData.awayTeamName || 'Sin equipo'}
                </p>
                <div className="mt-2 text-3xl font-black font-display text-foreground">
                  {matchData.awayScore}
                </div>
                {/* Tarjetas Visitante */}
                <div className="flex items-center justify-center gap-2 pt-1 text-[11px] font-mono font-bold">
                  <span className="flex items-center gap-1" title="Tarjetas amarillas">
                    <span className="inline-block h-3 w-2 rounded-[1px] bg-amber-400" />
                    {matchData.awayYellowCards ?? 0}
                  </span>
                  <span className="flex items-center gap-1" title="Tarjetas rojas">
                    <span className="inline-block h-3 w-2 rounded-[1px] bg-red-500" />
                    {matchData.awayRedCards ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Penalties Winner if tiebreaker */}
            {matchData.penaltiesWinnerId && (
              <div className="mt-3.5 pt-3 border-t border-border/50 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary">
                <Trophy className="h-4 w-4 text-primary shrink-0 glow-green" />
                <span>
                  Ganador por Penales:{' '}
                  {matchData.penaltiesWinnerName ||
                    (matchData.penaltiesWinnerId === matchData.homePlayerId
                      ? matchData.homePlayerName
                      : matchData.awayPlayerName)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col items-stretch gap-2 border-t border-border bg-secondary/40 px-5 py-3">
          {isOffline && (
            <div className="w-full text-center text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded py-1.5 px-3">
              Sin conexión con el servidor. Las confirmaciones de partido están pausadas hasta recuperar señal.
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2">
            <SecondaryButton
              onClick={handleReject}
              disabled={submitting || isOffline}
              className="w-full sm:w-auto text-xs py-2 px-3.5 border-destructive/40 text-destructive hover:bg-destructive/15"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <XCircle className="h-3.5 w-3.5 mr-1" />
              )}
              Rechazar propuesta
            </SecondaryButton>

            <PrimaryButton
              onClick={handleConfirm}
              disabled={submitting || isOffline}
              className="w-full sm:w-auto text-xs py-2 px-4 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              )}
              Confirmar resultado
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';
import { DEFAULT_THEME_TEAMS } from '../../domain/teams';

export interface DrawAnimatedPayload {
  step: number;
  totalSteps: number;
  currentItem: string;
  targetParticipantId?: string;
  participantName?: string;
  isFinal: boolean;
  assignments?: Record<string, string>;
}

export interface TeamsPreviewViewProps {
  tournamentId?: string;
  initialTheme?: string;
  participantCount?: number;
  participants?: Array<{ id: string; name: string }>;
  onProceedToFixture?: () => void;
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
  const [isDrawComplete, setIsDrawComplete] = useState<boolean>(false);

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

  // Synchronized WebSocket event listeners (RF-104)
  useEffect(() => {
    if (!socket) return;

    const handleDrawAnimated = (payload: DrawAnimatedPayload) => {
      setIsDrawing(true);
      setDrawStep(payload);

      if (payload.isFinal) {
        setIsDrawing(false);
        setIsDrawComplete(true);
        if (payload.assignments) {
          setFinalAssignments(payload.assignments);
        }
      }
    };

    socket.on('draw:animated', handleDrawAnimated);

    // Reconnection & sync check (RF-104)
    if (tournamentId) {
      socket.emit('draw:sync', tournamentId, (res: any) => {
        if (res?.ok) {
          if (res.inProgress && res.currentStep) {
            setIsDrawing(true);
          }
          if (res.isComplete && res.assignments) {
            setFinalAssignments(res.assignments);
            setIsDrawComplete(true);
            setIsDrawing(false);
          }
        }
      });
    }

    return () => {
      socket.off('draw:animated', handleDrawAnimated);
    };
  }, [socket, tournamentId]);

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

  // Trigger Team Draw (Admin only, or confirmed user)
  const handleStartDraw = async () => {
    try {
      setIsDrawing(true);
      setError(null);

      const res = await fetch('/api/tournaments/draw-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ tournamentId }),
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

              {isAdmin && !isDrawComplete && (
                <PrimaryButton
                  type="button"
                  disabled={isDrawing || !hasEnoughTeams}
                  onClick={handleStartDraw}
                  className="text-xs px-4 py-2 glow-green"
                >
                  <Shuffle className="h-3.5 w-3.5 mr-1.5" />
                  <span>{isDrawing ? 'Sorteando...' : 'Sortear Equipos'}</span>
                </PrimaryButton>
              )}
            </div>
          </div>

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

          {!hasEnoughTeams && (
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
                Asignando equipo a:{' '}
                <span className="text-primary font-black uppercase text-glow">
                  {drawStep?.participantName || 'Participante'}
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

      {/* Final Assignments Display (when draw is complete) */}
      {isDrawComplete && (
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
                : Object.entries(finalAssignments).map(([partId, teamName], idx) => (
                    <div
                      key={partId}
                      className="flex items-center justify-between p-3 rounded-md border border-primary/50 bg-secondary/40"
                    >
                      <span className="font-display font-bold text-sm text-foreground">
                        Participante {idx + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-primary uppercase">
                        {teamName}
                      </span>
                    </div>
                  ))}
            </div>

            {onProceedToFixture && (
              <div className="pt-4 flex justify-center">
                <PrimaryButton
                  type="button"
                  onClick={onProceedToFixture}
                  className="w-full sm:w-auto px-8 glow-green"
                >
                  <span>Continuar al Fixture y Partidos</span>
                  <ArrowRight className="h-4 w-4" />
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
    </div>
  );
}

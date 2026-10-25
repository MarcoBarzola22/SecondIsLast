import { useState } from 'react';
import {
  Gamepad2,
  Users,
  Dices,
  Shuffle,
  Trophy,
  ListOrdered,
  Layers,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  WifiOff,
  BookOpen,
} from 'lucide-react';
import { getTournamentPointsDistribution } from '../../domain/awardsAndRankings';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { DangerButton } from '../ui/Buttons';
import { WhitelistModal } from '../views/WhitelistModal';

export type ViewType =
  | 'lobby'
  | 'votacion'
  | 'equipos'
  | 'registro'
  | 'tematica'
  | 'draft'
  | 'bracket'
  | 'league'
  | 'group_stage'
  | 'double_elimination'
  | 'tabla'
  | 'reglamento';

interface HeaderProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
}

export function Header({ currentView, onNavigate }: HeaderProps) {
  const { activeTournament } = useAppState();
  const dispatch = useAppDispatch();
  const { user, displayName, isAdmin, isLoading, loginWithGoogle, logout } = useAuth();
  const { isOffline, offlineReason } = useNetworkStatus();
  const [isWhitelistOpen, setIsWhitelistOpen] = useState(false);

  const isDoubleElimination =
    activeTournament?.tournamentType === 'double_elimination';
  const isLeague =
    activeTournament?.tournamentType === 'league' ||
    activeTournament?.tournamentType === 'league_playoffs';
  const isGroupStage = activeTournament?.tournamentType === 'group_stage';

  const competitionStepId: ViewType = isDoubleElimination
    ? 'double_elimination'
    : isGroupStage
    ? 'group_stage'
    : isLeague
    ? 'league'
    : 'bracket';

  const competitionStepLabel = isDoubleElimination
    ? 'Doble Eliminación'
    : isGroupStage
    ? 'Grupos'
    : activeTournament?.tournamentType === 'league_playoffs'
    ? 'Liga + Reducido'
    : isLeague
    ? 'Liga'
    : 'Llaves';

  const competitionStepIcon = isDoubleElimination
    ? Trophy
    : isGroupStage
    ? Layers
    : isLeague
    ? ListOrdered
    : Trophy;

  const steps: Array<{
    id: ViewType;
    label: string;
    icon: typeof Users;
  }> = [
    { id: 'registro', label: 'Registro', icon: Users },
    { id: 'tematica', label: 'Temática', icon: Dices },
    { id: 'draft', label: 'Draft', icon: Shuffle },
    {
      id: competitionStepId,
      label: competitionStepLabel,
      icon: competitionStepIcon,
    },
    { id: 'tabla', label: 'Tabla', icon: ListOrdered },
  ];

  const handleAbandon = () => {
    const confirmed = window.confirm(
      '¿Seguro que querés abandonar el torneo activo? Los datos de este torneo se descartarán, pero la tabla histórica y los jugadores se mantienen intactos.'
    );
    if (confirmed) {
      dispatch({ type: 'TOURNAMENT_ABANDONED' });
      onNavigate('registro');
    }
  };

  const isStepEnabled = (stepId: ViewType): boolean => {
    // Lobby, Votacion, Tabla, and Reglamento are ALWAYS accessible
    if (
      stepId === 'lobby' ||
      stepId === 'votacion' ||
      stepId === 'tabla' ||
      stepId === 'reglamento'
    )
      return true;
    // Registro is always accessible to view or register players
    if (stepId === 'registro') return true;

    if (!activeTournament) {
      return false;
    }

    if (stepId === 'tematica') {
      return (
        activeTournament.phase === 'theme' ||
        activeTournament.phase === 'draft' ||
        activeTournament.phase === 'bracket' ||
        activeTournament.phase === 'league' ||
        activeTournament.phase === 'group_stage' ||
        activeTournament.phase === 'group_playoffs' ||
        activeTournament.phase === 'league_playoffs' ||
        activeTournament.phase === 'double_elimination'
      );
    }

    if (stepId === 'draft') {
      return (
        activeTournament.phase === 'draft' ||
        activeTournament.phase === 'bracket' ||
        activeTournament.phase === 'league' ||
        activeTournament.phase === 'group_stage' ||
        activeTournament.phase === 'group_playoffs' ||
        activeTournament.phase === 'league_playoffs' ||
        activeTournament.phase === 'double_elimination'
      );
    }

    if (stepId === 'bracket') {
      return (
        activeTournament.phase === 'bracket' ||
        activeTournament.phase === 'group_playoffs' ||
        activeTournament.phase === 'league_playoffs'
      );
    }

    if (stepId === 'league') {
      return (
        activeTournament.phase === 'league' ||
        activeTournament.phase === 'league_playoffs'
      );
    }

    if (stepId === 'group_stage') {
      return (
        activeTournament.phase === 'group_stage' ||
        activeTournament.phase === 'group_playoffs'
      );
    }

    if (stepId === 'double_elimination') {
      return activeTournament.phase === 'double_elimination';
    }

    return false;
  };

  const pointsDist =
    activeTournament && activeTournament.participantIds.length > 0
      ? getTournamentPointsDistribution(activeTournament.participantIds.length)
      : null;

  return (
    <header className="sticky top-0 z-50 panel-metal mb-6 flex flex-col rounded-md px-5 py-3.5 backdrop-blur-sm shadow-xl gap-3">
      {/* Banner de Modo Offline (RF-120, RNF-3) */}
      {isOffline && (
        <div
          data-testid="offline-banner"
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 rounded border border-amber-500/50 bg-amber-500/15 px-4 py-2.5 text-xs text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
        >
          <div className="flex items-center gap-2.5">
            <WifiOff className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" />
            <div>
              <span className="font-display font-bold uppercase tracking-wider text-amber-300">
                Modo Offline (Sin conexión):
              </span>{' '}
              <span className="text-amber-100/90">
                Estás desconectado del servidor {offlineReason === 'network' ? '(sin internet)' : '(servidor no disponible)'}. Podés navegar libremente por tablas y llaves en modo lectura, pero la carga de resultados y votaciones están pausadas.
              </span>
            </div>
          </div>
          <span className="shrink-0 self-end sm:self-auto rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest text-amber-300">
            Solo Lectura
          </span>
        </div>
      )}

      <div className="flex w-full flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex items-center gap-3">
          <Gamepad2 className="h-9 w-9 text-primary text-glow" />
          <div>
            <h1 className="font-display text-2xl font-black tracking-widest text-foreground md:text-3xl">
              SECOND <span className="text-accent text-glow">IS</span> LAST
            </h1>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              PES 6 · Tournament Mode
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* Lobby Online Navigation Button (RF-93, RF-119) */}
          <button
            type="button"
            onClick={() => onNavigate('lobby')}
            className={`flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
              currentView === 'lobby'
                ? 'border-primary bg-primary text-primary-foreground glow-green'
                : 'border-primary/50 bg-primary/10 hover:bg-primary/25 text-primary'
            }`}
            title="Lobby de Asistencia y Quórum en Vivo"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Lobby</span>
          </button>

          {/* Reglamento Oficial de la Casa (RF-118, RF-119) */}
          <button
            type="button"
            onClick={() => onNavigate('reglamento')}
            className={`flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
              currentView === 'reglamento'
                ? 'border-primary bg-primary text-primary-foreground glow-green'
                : 'border-border/80 bg-secondary/70 hover:bg-secondary text-foreground hover:border-accent hover:text-accent'
            }`}
            title="Reglamento Oficial de la Casa (Código de Honor)"
          >
            <BookOpen className="h-3.5 w-3.5 text-accent" />
            <span>Reglamento</span>
          </button>

          {/* User Auth Profile & Role (RF-90) */}
          {user ? (
            <div className="flex items-center gap-2 bg-secondary/50 border border-border/80 rounded-sm px-2.5 py-1 text-xs">
              <UserIcon className="h-4 w-4 text-primary shrink-0" />
              <div className="flex flex-col text-left leading-tight">
                <span className="font-bold text-foreground truncate max-w-[130px]" title={displayName}>
                  {displayName}
                </span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[130px]" title={user.email}>
                  {user.email}
                </span>
              </div>
              <span
                className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  user.role === 'ADMIN'
                    ? 'bg-gold/20 text-gold border border-gold/40'
                    : 'bg-primary/10 text-primary border border-primary/30'
                }`}
              >
                {user.role === 'ADMIN' ? 'Admin' : 'Jugador'}
              </span>
              <button
                type="button"
                onClick={logout}
                className="ml-1 p-1 text-muted-foreground hover:text-destructive transition rounded hover:bg-secondary"
                title="Cerrar sesión"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : !isLoading ? (
            <button
              type="button"
              onClick={loginWithGoogle}
              className="flex items-center gap-1.5 rounded-sm border border-primary/50 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition glow-green"
              title="Iniciar sesión con Google"
            >
              <UserIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Iniciar sesión</span>
            </button>
          ) : null}

          {/* Admin Management Button (RF-91, Plan §6) */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsWhitelistOpen(true)}
              className="flex items-center gap-1.5 rounded-sm border border-gold/50 bg-gold/10 hover:bg-gold/25 text-gold px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition"
              title="Panel de Administración: Whitelist y Migración de Datos Locales"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}

          <nav className="flex flex-wrap justify-center gap-1">
            {steps.map((s, i) => {
              const active = s.id === currentView;
              const enabled = isStepEnabled(s.id);

              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!enabled}
                  onClick={() => onNavigate(s.id)}
                  className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-sm font-semibold uppercase tracking-wider transition ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground glow-green'
                      : enabled
                        ? 'border-border bg-secondary text-muted-foreground hover:border-accent hover:text-accent'
                        : 'cursor-not-allowed border-border/40 bg-secondary/30 text-muted-foreground/40'
                  }`}
                >
                  <span className="font-display text-xs">{i + 1}</span>
                  <s.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </nav>

          {activeTournament && (
            <DangerButton onClick={handleAbandon} title="Abandonar torneo actual">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Abandonar</span>
            </DangerButton>
          )}
        </div>
      </div>

      {/* Cartel de Puntos del Torneo Activo para el Ranking Anual (RF-84) */}
      {pointsDist && (
        <div className="w-full border-t border-border/60 pt-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs bg-secondary/20 rounded-sm px-3.5 py-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-gold shrink-0" />
            <span className="font-display font-bold uppercase tracking-wider text-foreground">
              Torneo de {pointsDist.participantCount} participantes
            </span>
            <span className="hidden sm:inline text-muted-foreground">· Ranking Anual:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono text-[11px]">
            <span className="inline-flex items-center gap-1 text-primary font-bold">
              <span>Campeón:</span>
              <span className="bg-primary/20 text-primary border border-primary/40 rounded px-1.5 py-0.5">
                {pointsDist.champion} pts
              </span>
            </span>

            <span className="text-border">|</span>

            <span className="inline-flex items-center gap-1 text-accent font-bold">
              <span>Subcampeón:</span>
              <span className="bg-accent/20 text-accent border border-accent/40 rounded px-1.5 py-0.5">
                {pointsDist.runnerUp} pts
              </span>
            </span>

            {pointsDist.third > 0 && (
              <>
                <span className="text-border">|</span>
                <span className="inline-flex items-center gap-1 text-gold font-bold">
                  <span>3°:</span>
                  <span className="bg-gold/20 text-gold border border-gold/40 rounded px-1.5 py-0.5">
                    {pointsDist.third} pts
                  </span>
                </span>
              </>
            )}

            {pointsDist.fourth > 0 && (
              <>
                <span className="text-border">|</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground font-bold">
                  <span>4°:</span>
                  <span className="bg-secondary text-muted-foreground border border-border/80 rounded px-1.5 py-0.5">
                    {pointsDist.fourth} pts
                  </span>
                </span>
              </>
            )}

            <span className="text-border hidden md:inline">|</span>
            <span className="text-muted-foreground/80 hidden md:inline">
              Participación: +1 pt
            </span>
          </div>
        </div>
      )}

      {/* Admin Whitelist Modal (RF-91, RF-119) */}
      <WhitelistModal isOpen={isWhitelistOpen} onClose={() => setIsWhitelistOpen(false)} />
    </header>
  );
}

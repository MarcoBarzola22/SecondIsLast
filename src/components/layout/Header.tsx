import { useState } from 'react';
import {
  Gamepad2,
  Trophy,
  ListOrdered,
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
import { saveOfflineTournament } from '../../cache/offlineStore';
import { DangerButton } from '../ui/Buttons';

export type ViewType =
  | 'lobby'
  | 'votacion'
  | 'equipos'
  | 'registro'
  | 'tematica'
  | 'draft'
  | 'bracket_slots'
  | 'bracket'
  | 'league'
  | 'group_stage'
  | 'double_elimination'
  | 'tabla'
  | 'reglamento'
  | 'admin';

interface HeaderProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  cloudTournament?: any;
  hasActiveTournamentAlert?: boolean;
}

export function Header({
  currentView,
  onNavigate,
  cloudTournament,
  hasActiveTournamentAlert,
}: HeaderProps) {
  const { activeTournament } = useAppState();
  const dispatch = useAppDispatch();
  const { user, displayName, isAdmin, isLoading, loginWithGoogle, devLogin, logout } = useAuth();
  const { isOffline, offlineReason } = useNetworkStatus();
  const [isDevMenuOpen, setIsDevMenuOpen] = useState(false);
  const [customDevEmail, setCustomDevEmail] = useState('');

  const isTournamentView = !['tabla', 'reglamento', 'admin'].includes(currentView);
  const hasAlert =
    (currentView === 'tabla' || currentView === 'reglamento' || currentView === 'admin') &&
    Boolean(hasActiveTournamentAlert ?? (cloudTournament || activeTournament));
  const alertBadge = cloudTournament?.status === 'LOBBY' ? '🔴 Lobby' : '🔴 Activo';

  const handleAbandon = async () => {
    const confirmed = window.confirm(
      '¿Seguro que querés abandonar o reiniciar el torneo activo? Los datos de este torneo se descartarán y todos los clientes volverán al Lobby.'
    );
    if (!confirmed) return;

    try {
      await fetch('/api/tournaments/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tournamentId: cloudTournament?.id || activeTournament?.id }),
      });
    } catch (err) {
      console.warn('[Header] Error abandonando torneo en servidor:', err);
    }

    saveOfflineTournament(null);
    dispatch({ type: 'TOURNAMENT_ABANDONED' });
    onNavigate('lobby');
  };

  const pointsDist =
    activeTournament && activeTournament.participantIds.length > 0
      ? getTournamentPointsDistribution(activeTournament.participantIds.length)
      : null;

  return (
    <header className="sticky top-0 z-50 panel-metal mb-4 flex flex-col rounded-md px-3 sm:px-4 py-2 sm:py-2.5 backdrop-blur-sm shadow-xl gap-2">
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

      <div className="flex w-full flex-col md:flex-row items-center justify-between gap-2.5">
        {/* 1. Izquierda: Logo y título */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Gamepad2 className="h-7 w-7 md:h-8 md:w-8 text-primary text-glow shrink-0" />
          <div>
            <h1 className="font-display text-lg sm:text-xl font-black tracking-widest text-foreground">
              SECOND <span className="text-accent text-glow">IS</span> LAST
            </h1>
            <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              PES 6 · Tournament Mode
            </p>
          </div>
        </div>

        {/* 2. Centro: Navegación principal */}
        <nav className="flex items-center justify-center gap-1 sm:gap-1.5 shrink-0">
          {/* Tab 1: Torneo */}
          <button
            type="button"
            onClick={() => onNavigate('lobby')}
            className={`flex items-center gap-1 sm:gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition shrink-0 ${
              isTournamentView
                ? 'border-primary bg-primary text-primary-foreground glow-green'
                : hasAlert
                ? 'animate-pulse border-primary bg-primary/20 text-primary shadow-[0_0_15px_rgba(34,197,94,0.4)] hover:bg-primary/30'
                : 'border-border bg-secondary text-muted-foreground hover:border-accent hover:text-accent'
            }`}
            title="Flujo activo del torneo (Lobby, Votaciones, Equipos, Draft y Fixture)"
          >
            <Trophy className="h-3.5 w-3.5 shrink-0" />
            <span>{hasAlert ? alertBadge : 'Torneo'}</span>
          </button>

          {/* Tab 2: Tabla y Perfiles */}
          <button
            type="button"
            onClick={() => onNavigate('tabla')}
            className={`flex items-center gap-1 sm:gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition shrink-0 ${
              currentView === 'tabla'
                ? 'border-primary bg-primary text-primary-foreground glow-green'
                : 'border-border bg-secondary text-muted-foreground hover:border-accent hover:text-accent'
            }`}
            title="Tabla de posiciones históricas, récords y perfiles de jugadores"
          >
            <ListOrdered className="h-3.5 w-3.5 shrink-0" />
            <span>Tabla y Perfiles</span>
          </button>

          {/* Tab 3: Reglamento */}
          <button
            type="button"
            onClick={() => onNavigate('reglamento')}
            className={`flex items-center gap-1 sm:gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition shrink-0 ${
              currentView === 'reglamento'
                ? 'border-primary bg-primary text-primary-foreground glow-green'
                : 'border-border bg-secondary text-muted-foreground hover:border-accent hover:text-accent'
            }`}
            title="Reglamento Oficial de la Casa (Código de Honor)"
          >
            <BookOpen className="h-3.5 w-3.5 text-accent shrink-0" />
            <span>Reglamento</span>
          </button>

          {/* Tab 4: Admin (exclusivo para isAdmin) */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className={`flex items-center gap-1 sm:gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition shrink-0 ${
                currentView === 'admin'
                  ? 'border-gold bg-gold/25 text-gold shadow-[0_0_12px_rgba(234,179,8,0.4)] font-bold'
                  : 'border-border bg-secondary text-gold/80 hover:border-gold hover:text-gold hover:bg-gold/10'
              }`}
              title="Panel de Administración (Whitelist, Temáticas y Migración)"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-gold" />
              <span>Admin</span>
            </button>
          )}
        </nav>

        {/* 3. Derecha: Controles de usuario */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Dev-Login Quick Switcher (DEV Only DX) */}
          {import.meta.env.DEV && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsDevMenuOpen(!isDevMenuOpen)}
                className="flex items-center gap-1 rounded-sm border border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/25 text-purple-300 px-2 py-1 text-xs font-semibold uppercase tracking-wider transition shrink-0"
                title="Selector rápido de inicio de sesión para desarrollo"
              >
                <span>🛠️</span>
                <span className="hidden md:inline">Dev Login</span>
              </button>

              {isDevMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 rounded-md border border-purple-500/40 bg-zinc-900/95 p-3 shadow-2xl z-50 flex flex-col gap-2.5 backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-border/60 pb-1.5 text-xs font-bold text-foreground">
                    <span>🛠️ Cambiar Usuario (Dev)</span>
                    <button
                      type="button"
                      onClick={() => setIsDevMenuOpen(false)}
                      className="text-muted-foreground hover:text-foreground text-xs p-0.5"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      Jugadores Sembrados:
                    </span>
                    {[
                      { email: 'admin@example.com', label: 'Marco Barzola (Admin)', role: 'ADMIN' },
                      { email: 'juan@test.com', label: 'Juan Torres', role: 'PLAYER' },
                      { email: 'santi@test.com', label: 'Santi Aguilar', role: 'PLAYER' },
                      { email: 'marto@test.com', label: 'Marto Audicio', role: 'PLAYER' },
                    ].map((devUser) => (
                      <button
                        key={devUser.email}
                        type="button"
                        onClick={async () => {
                          await devLogin(devUser.email);
                          setIsDevMenuOpen(false);
                        }}
                        className={`flex items-center justify-between rounded px-2 py-1.5 text-xs text-left transition ${
                          user?.email === devUser.email
                            ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50 font-bold'
                            : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        <span className="truncate">{devUser.label}</span>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0 ml-1">
                          {devUser.role === 'ADMIN' ? '👑' : '⚽'}
                        </span>
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (customDevEmail.trim()) {
                        await devLogin(customDevEmail.trim());
                        setCustomDevEmail('');
                        setIsDevMenuOpen(false);
                      }
                    }}
                    className="border-t border-border/60 pt-2 flex flex-col gap-1.5"
                  >
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      Otro correo whitelist:
                    </span>
                    <div className="flex gap-1">
                      <input
                        type="email"
                        placeholder="otro@test.com"
                        value={customDevEmail}
                        onChange={(e) => setCustomDevEmail(e.target.value)}
                        className="w-full bg-secondary text-xs rounded border border-border px-2 py-1 text-foreground placeholder:text-muted-foreground/60 focus:border-purple-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-2.5 py-1 rounded font-bold transition shrink-0"
                      >
                        Entrar
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* User Auth Profile & Role (RF-90) */}
          {user ? (
            <div className="flex items-center gap-1.5 bg-secondary/50 border border-border/80 rounded-sm px-2 py-1 text-xs shrink-0">
              <UserIcon className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="flex flex-col text-left leading-tight max-w-[85px] sm:max-w-[120px]">
                <span className="font-bold text-foreground truncate text-[11px] sm:text-xs" title={displayName}>
                  {displayName}
                </span>
                <span className="text-[9px] text-muted-foreground truncate hidden md:inline" title={user.email}>
                  {user.email}
                </span>
              </div>
              <span
                className={`ml-0.5 px-1 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 hidden md:inline ${
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
                className="ml-0.5 p-0.5 text-muted-foreground hover:text-destructive transition rounded hover:bg-secondary shrink-0"
                title="Cerrar sesión"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : !isLoading ? (
            <button
              type="button"
              onClick={loginWithGoogle}
              className="flex items-center gap-1 rounded-sm border border-primary/50 bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition glow-green shrink-0"
              title="Iniciar sesión con Google"
            >
              <UserIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">Iniciar sesión</span>
            </button>
          ) : null}

          {/* Abandon / Reiniciar Button */}
          {isAdmin && (cloudTournament || activeTournament) && (
            <DangerButton
              onClick={handleAbandon}
              className="px-2 py-1 text-xs shrink-0 flex items-center gap-1"
              title="Abandonar o reiniciar torneo activo en cualquier fase"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">Abandonar</span>
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
    </header>
  );
}

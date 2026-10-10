import {
  Gamepad2,
  Users,
  Dices,
  Shuffle,
  Trophy,
  ListOrdered,
  LogOut,
} from 'lucide-react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { DangerButton } from '../ui/Buttons';

export type ViewType =
  | 'registro'
  | 'tematica'
  | 'draft'
  | 'bracket'
  | 'league'
  | 'tabla';

interface HeaderProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
}

export function Header({ currentView, onNavigate }: HeaderProps) {
  const { activeTournament } = useAppState();
  const dispatch = useAppDispatch();

  const isLeague = activeTournament?.tournamentType === 'league';

  const steps: Array<{
    id: ViewType;
    label: string;
    icon: typeof Users;
  }> = [
    { id: 'registro', label: 'Registro', icon: Users },
    { id: 'tematica', label: 'Temática', icon: Dices },
    { id: 'draft', label: 'Draft', icon: Shuffle },
    {
      id: isLeague ? 'league' : 'bracket',
      label: isLeague ? 'Liga' : 'Llaves',
      icon: isLeague ? ListOrdered : Trophy,
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
    // Tabla is ALWAYS accessible (RF-38)
    if (stepId === 'tabla') return true;
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
        activeTournament.phase === 'league'
      );
    }

    if (stepId === 'draft') {
      return (
        activeTournament.phase === 'draft' ||
        activeTournament.phase === 'bracket' ||
        activeTournament.phase === 'league'
      );
    }

    if (stepId === 'bracket') {
      return activeTournament.phase === 'bracket';
    }

    if (stepId === 'league') {
      return activeTournament.phase === 'league';
    }

    return false;
  };

  return (
    <header className="sticky top-0 z-50 panel-metal mb-6 flex flex-col items-center justify-between gap-4 rounded-md px-5 py-4 backdrop-blur-sm shadow-xl md:flex-row">
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
    </header>
  );
}

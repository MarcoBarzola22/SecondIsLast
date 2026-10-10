import { useState } from 'react';
import { Header, type ViewType } from './components/layout/Header';
import { BracketView } from './components/views/BracketView';
import { DraftView } from './components/views/DraftView';
import { LeagueView } from './components/views/LeagueView';
import { PodiumPanel } from './components/views/PodiumPanel';
import { RegistrationView } from './components/views/RegistrationView';
import { StandingsView } from './components/views/StandingsView';
import { ThemeView } from './components/views/ThemeView';
import { useAppState } from './state/AppContext';

export default function App() {
  const { activeTournament } = useAppState();

  // Derive initial active view from persistent tournament phase (RF-40)
  const [view, setView] = useState<ViewType>(() => {
    if (activeTournament) {
      if (activeTournament.phase === 'theme') return 'tematica';
      if (activeTournament.phase === 'draft') return 'draft';
      if (activeTournament.phase === 'bracket') return 'bracket';
      if (activeTournament.phase === 'league') return 'league';
    }
    return 'registro';
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <Header currentView={view} onNavigate={setView} />

      <main className="mx-auto">
        {view === 'registro' && (
          <RegistrationView onProceedToTheme={() => setView('tematica')} />
        )}

        {view === 'tematica' && (
          <ThemeView onProceedToDraft={() => setView('draft')} />
        )}

        {view === 'draft' && (
          <DraftView
            onProceedToBracket={() => setView('bracket')}
            onProceedToLeague={() => setView('league')}
          />
        )}

        {view === 'bracket' && (
          <BracketView>
            <PodiumPanel onTournamentFinished={() => setView('tabla')} />
          </BracketView>
        )}

        {view === 'league' && (
          <LeagueView onTournamentFinished={() => setView('tabla')} />
        )}

        {view === 'tabla' && <StandingsView />}
      </main>
    </div>
  );
}

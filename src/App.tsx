import { useState, useEffect, useCallback } from 'react';
import { Header, type ViewType } from './components/layout/Header';
import { BracketView } from './components/views/BracketView';
import { DoubleEliminationView } from './components/views/DoubleEliminationView';
import { DraftView } from './components/views/DraftView';
import { GroupStageView } from './components/views/GroupStageView';
import { LeagueView } from './components/views/LeagueView';
import { PodiumPanel } from './components/views/PodiumPanel';
import { RegistrationView } from './components/views/RegistrationView';
import { StandingsView } from './components/views/StandingsView';
import { ThemeView } from './components/views/ThemeView';
import { LobbyView } from './components/views/LobbyView';
import { VotingView } from './components/views/VotingView';
import { TeamsPreviewView } from './components/views/TeamsPreviewView';
import { RulesView } from './components/views/RulesView';
import { HandshakeModal, type HandshakeMatchData } from './components/views/HandshakeModal';
import { useAppDispatch, useAppState } from './state/AppContext';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { saveOfflineTournament } from './cache/offlineStore';

export default function App() {
  const { activeTournament } = useAppState();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { isOnline } = useNetworkStatus();
  const [liveHandshakeMatch, setLiveHandshakeMatch] = useState<HandshakeMatchData | null>(null);

  // Cache active tournament on state changes (RF-120)
  useEffect(() => {
    if (activeTournament) {
      saveOfflineTournament(activeTournament);
    }
  }, [activeTournament]);

  // Automatic Rehydration from /api/tournaments/active upon reconnection (RF-120, RNF-3)
  const rehydrateActiveTournament = useCallback(async () => {
    try {
      const res = await fetch('/api/tournaments/active', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tournament) {
          saveOfflineTournament(data.tournament);
          if (socket) {
            socket.emit('tournament:join', data.tournament.id);
          }
        }
      }
    } catch (err) {
      console.warn('[App] Rehydration failed, continuing with offline cache:', err);
    }
  }, [socket]);

  useEffect(() => {
    if (isOnline) {
      rehydrateActiveTournament();
    }
  }, [isOnline, rehydrateActiveTournament]);

  // Live WebSocket Handshake Notification & Sequential Unlock (RF-105, RF-108, RF-114, RF-115, RF-119)
  useEffect(() => {
    if (!socket || !user?.playerId) return;

    const handleMatchSubmitted = async (payload: any) => {
      let awayPlayerId = payload.awayPlayerId || payload.awayParticipant?.playerId;
      let matchDetail = payload.match;

      if (!awayPlayerId && payload.matchId) {
        try {
          const res = await fetch(`/api/matches/${payload.matchId}`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            if (data.match) {
              matchDetail = data.match;
              awayPlayerId = data.match.awayParticipant?.playerId;
            }
          }
        } catch {
          // ignore network error
        }
      }

      if (awayPlayerId === user.playerId && matchDetail) {
        setLiveHandshakeMatch({
          id: matchDetail.id,
          round: matchDetail.round,
          leg: matchDetail.leg,
          seriesId: matchDetail.seriesId,
          homePlayerId: matchDetail.homeParticipant?.playerId || '',
          awayPlayerId: matchDetail.awayParticipant?.playerId || user.playerId,
          homePlayerName: matchDetail.homeParticipant?.player
            ? `${matchDetail.homeParticipant.player.lastName}, ${matchDetail.homeParticipant.player.firstName}`
            : 'Local',
          homeTeamName: matchDetail.homeTeamName || '',
          awayPlayerName: matchDetail.awayParticipant?.player
            ? `${matchDetail.awayParticipant.player.lastName}, ${matchDetail.awayParticipant.player.firstName}`
            : user.player
              ? `${user.player.lastName}, ${user.player.firstName}`
              : user.name,
          awayTeamName: matchDetail.awayTeamName || '',
          homeScore: matchDetail.homeScore ?? payload.homeScore ?? 0,
          awayScore: matchDetail.awayScore ?? payload.awayScore ?? 0,
          homeYellowCards: matchDetail.homeYellowCards ?? 0,
          awayYellowCards: matchDetail.awayYellowCards ?? 0,
          homeRedCards: matchDetail.homeRedCards ?? 0,
          awayRedCards: matchDetail.awayRedCards ?? 0,
          penaltiesWinnerId: matchDetail.penaltiesWinnerId ?? payload.penaltiesWinnerId ?? null,
          penaltiesWinnerName: matchDetail.penaltiesWinner?.player
            ? `${matchDetail.penaltiesWinner.player.lastName}, ${matchDetail.penaltiesWinner.player.firstName}`
            : null,
          version: matchDetail.version ?? payload.version ?? 1,
          status: 'PENDING_CONFIRMATION',
        });
      }
    };

    const handleMatchClosed = (payload: any) => {
      setLiveHandshakeMatch((prev) => (prev && prev.id === payload.matchId ? null : prev));

      // Dispatch to state so sequential lock immediately unlocks across all view components (RF-114, RF-115)
      dispatch({
        type: 'MATCH_CLOSED_EVENT_RECEIVED',
        matchId: payload.matchId,
        seriesId: payload.seriesId,
        match: payload.match,
        bracket: payload.bracket,
        unblockedParticipants: payload.unblockedParticipants,
      });
    };

    const handleMatchRejected = (payload: any) => {
      setLiveHandshakeMatch((prev) => (prev && prev.id === payload.matchId ? null : prev));
    };

    const handleWalkoverApplied = (payload: any) => {
      setLiveHandshakeMatch(null);

      dispatch({
        type: 'PLAYER_WALKOVER_DECLARED',
        playerId: payload.playerId,
        participantId: payload.participantId,
        matches: payload.matches,
      });
    };

    const handleTournamentFinished = (payload: any) => {
      setLiveHandshakeMatch(null);
      dispatch({
        type: 'TOURNAMENT_FINISHED',
        summaryId: payload.tournamentId || crypto.randomUUID(),
        now: new Date().toISOString(),
      });
    };

    socket.on('match:submitted', handleMatchSubmitted);
    socket.on('match:closed', handleMatchClosed);
    socket.on('match:rejected', handleMatchRejected);
    socket.on('walkover:applied', handleWalkoverApplied);
    socket.on('tournament:finished', handleTournamentFinished);

    return () => {
      socket.off('match:submitted', handleMatchSubmitted);
      socket.off('match:closed', handleMatchClosed);
      socket.off('match:rejected', handleMatchRejected);
      socket.off('walkover:applied', handleWalkoverApplied);
      socket.off('tournament:finished', handleTournamentFinished);
    };
  }, [socket, user?.playerId, user?.name, user?.player, dispatch]);

  // Derive initial active view from persistent tournament phase (RF-40)
  const [view, setView] = useState<ViewType>(() => {
    if (activeTournament) {
      if (activeTournament.phase === 'theme') return 'tematica';
      if (activeTournament.phase === 'draft') return 'draft';
      if (activeTournament.phase === 'bracket') return 'bracket';
      if (activeTournament.phase === 'league') return 'league';
      if (activeTournament.phase === 'group_stage') return 'group_stage';
      if (activeTournament.phase === 'group_playoffs') return 'bracket';
      if (activeTournament.phase === 'double_elimination') return 'double_elimination';
    }
    return 'registro';
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <Header currentView={view} onNavigate={setView} />

      <main className="mx-auto">
        {view === 'lobby' && (
          <LobbyView onProceedToVoting={() => setView('votacion')} />
        )}

        {view === 'votacion' && (
          <VotingView onProceedNext={() => setView('equipos')} />
        )}

        {view === 'equipos' && (
          <TeamsPreviewView onProceedToFixture={() => setView('draft')} />
        )}

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
            onProceedToGroupStage={() => setView('group_stage')}
            onProceedToDoubleElimination={() => setView('double_elimination')}
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

        {view === 'group_stage' && (
          <GroupStageView onProceedToPlayoffs={() => setView('bracket')} />
        )}

        {view === 'double_elimination' && (
          <DoubleEliminationView onTournamentFinished={() => setView('tabla')} />
        )}

        {view === 'tabla' && <StandingsView />}

        {view === 'reglamento' && <RulesView />}
      </main>

      {liveHandshakeMatch && (
        <HandshakeModal
          isOpen={Boolean(liveHandshakeMatch)}
          onClose={() => setLiveHandshakeMatch(null)}
          matchData={liveHandshakeMatch}
          onSuccess={() => {
            setLiveHandshakeMatch(null);
          }}
        />
      )}
    </div>
  );
}

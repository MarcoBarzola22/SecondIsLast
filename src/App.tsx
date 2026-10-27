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
import { PrimaryButton, SecondaryButton } from './components/ui/Buttons';
import { Trophy } from 'lucide-react';
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
  const [finishedTournamentModal, setFinishedTournamentModal] = useState<any | null>(null);

  // Derive initial active view from persistent tournament phase (RF-40) - default is always 'lobby' (T29)
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
    return 'lobby';
  });

  const [activeTournamentId, setActiveTournamentId] = useState<string | undefined>(activeTournament?.id);
  const [cloudTournament, setCloudTournament] = useState<any>(null);
  const [votingSessionData, setVotingSessionData] = useState<{
    expiresAt: string | null;
    options: string[];
    phase: 'FORMAT' | 'THEME';
    totalVoters: number;
  } | null>(null);

  // Derive real active tournament view according to status (T29)
  const getActiveTournamentView = useCallback((): ViewType => {
    const tourney = cloudTournament || activeTournament;
    if (!tourney) return 'lobby';

    const status = tourney.status;
    if (status === 'LOBBY') return 'lobby';
    if (status === 'VOTING_FORMAT') return 'votacion';
    if (status === 'VOTING_THEME') return 'equipos';
    if (status === 'IN_PROGRESS') {
      const format = (tourney.format || tourney.tournamentType || '').toLowerCase();
      if (format === 'league' || format === 'league_playoffs') return 'league';
      if (format === 'group_stage') return 'group_stage';
      if (format === 'double_elimination') return 'double_elimination';
      return 'bracket';
    }

    if (activeTournament) {
      if (activeTournament.phase === 'theme') return 'tematica';
      if (activeTournament.phase === 'draft') return 'draft';
      if (activeTournament.phase === 'bracket') return 'bracket';
      if (activeTournament.phase === 'league') return 'league';
      if (activeTournament.phase === 'group_stage') return 'group_stage';
      if (activeTournament.phase === 'double_elimination') return 'double_elimination';
    }

    return 'lobby';
  }, [cloudTournament, activeTournament]);

  // Intelligent navigation handler when returning from Reglamento or Tabla (T29)
  const handleNavigate = useCallback(
    (targetView: ViewType) => {
      if (targetView === 'lobby') {
        const activeStepView = getActiveTournamentView();
        setView(activeStepView);
        return;
      }
      setView(targetView);
    },
    [getActiveTournamentView]
  );

  // Cache active tournament on state changes (RF-120)
  useEffect(() => {
    if (activeTournament) {
      saveOfflineTournament(activeTournament);
    }
  }, [activeTournament]);

  // Automatic Rehydration from /api/tournaments/active upon reconnection & status sync (RF-120, RNF-3)
  const rehydrateActiveTournament = useCallback(async () => {
    try {
      const res = await fetch('/api/tournaments/active', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tournament) {
          setCloudTournament(data.tournament);
          saveOfflineTournament(data.tournament);
          setActiveTournamentId(data.tournament.id);
          dispatch({ type: 'HYDRATE_TOURNAMENT', payload: data.tournament });
          if (socket) {
            socket.emit('tournament:join', data.tournament.id);
          }

          // Auto-synchronize view according to tournament.status across all clients (T28)
          const status = data.tournament.status;
          if (status === 'LOBBY') {
            setView((curr) => (curr === 'tabla' || curr === 'reglamento' ? curr : 'lobby'));
          } else if (status === 'VOTING_FORMAT') {
            setView((curr) => (curr === 'tabla' || curr === 'reglamento' ? curr : 'votacion'));
            const vs = data.tournament.votingSession || data.votingSession;
            if (vs) {
              setVotingSessionData({
                expiresAt: vs.expiresAt,
                options: vs.options,
                phase: vs.phase,
                totalVoters: vs.totalVoters,
              });
            } else if (socket) {
              socket.emit('vote:sync', data.tournament.id, (resVote: any) => {
                if (resVote?.ok && resVote.session) {
                  setVotingSessionData({
                    expiresAt: resVote.session.expiresAt,
                    options: resVote.session.options,
                    phase: resVote.session.phase,
                    totalVoters: resVote.session.totalVoters,
                  });
                }
              });
            }
          } else if (status === 'VOTING_THEME') {
            const hasDraftSession = Boolean(data.tournament.draftSession);
            const vs = data.tournament.votingSession || data.votingSession;
            setView((curr) => {
              if (curr === 'tabla' || curr === 'reglamento') return curr;
              if (hasDraftSession || curr === 'draft') return 'draft';
              if (!vs || vs.phase === 'THEME' || vs.phase === 'FORMAT') return 'votacion';
              return 'equipos';
            });
          } else if (status === 'IN_PROGRESS') {
            const format = (data.tournament.format || '').toLowerCase();
            if (format === 'bracket') setView('bracket');
            else if (format === 'league' || format === 'league_playoffs') setView('league');
            else if (format === 'group_stage') setView('group_stage');
            else if (format === 'double_elimination') setView('double_elimination');
          }
        }
      }
    } catch (err) {
      console.warn('[App] Rehydration failed, continuing with offline cache:', err);
    }
  }, [socket]);

  // Only invoke rehydrate when user is authenticated (silences initial 401s)
  useEffect(() => {
    if (isOnline && user) {
      rehydrateActiveTournament();
    }
  }, [isOnline, user, rehydrateActiveTournament]);

  // Global socket listeners for automatic phase & view transitions (T28)
  useEffect(() => {
    if (!socket) return;

    const handleTournamentAbandoned = () => {
      saveOfflineTournament(null);
      dispatch({ type: 'TOURNAMENT_ABANDONED' });
      setCloudTournament(null);
      setActiveTournamentId(undefined);
      setVotingSessionData(null);
      setView('lobby');
    };

    const handleTournamentStatus = async (payload: any) => {
      if (payload?.status === 'ABANDONED') {
        handleTournamentAbandoned();
        return;
      }
      if (payload?.status === 'VOTING_FORMAT') {
        setView('votacion');
      } else if (payload?.status === 'VOTING_THEME') {
        setView((curr) => (curr === 'votacion' ? 'votacion' : 'equipos'));
      } else if (payload?.status === 'DRAFT') {
        setView('draft');
      }
      if (isOnline) {
        await rehydrateActiveTournament();
      }
    };

    const handleVoteStarted = (payload: any) => {
      if (payload?.phase === 'FORMAT' || payload?.phase === 'THEME') {
        setVotingSessionData({
          expiresAt: payload.expiresAt,
          options: payload.options,
          phase: payload.phase,
          totalVoters: payload.totalVoters,
        });
        setView('votacion');
      } else if (payload?.phase === 'ASSIGNMENT_METHOD') {
        setView('equipos');
      }
    };

    const handleVoteEnded = async () => {
      if (isOnline) {
        await rehydrateActiveTournament();
      }
    };

    const handleDraftTurnUpdated = async () => {
      setView('draft');
      if (isOnline) {
        await rehydrateActiveTournament();
      }
    };

    const handleFixtureReady = async (payload: any) => {
      const tournamentData = payload?.tournament || {
        ...cloudTournament,
        matches: payload?.matches,
      };

      if (tournamentData) {
        dispatch({
          type: 'HYDRATE_TOURNAMENT',
          payload: {
            ...tournamentData,
            matches: payload?.matches || tournamentData.matches,
          },
        });
      }

      const format = (
        payload?.tournament?.format ||
        payload?.format ||
        cloudTournament?.format ||
        ''
      ).toLowerCase();

      if (format === 'league' || format === 'league_playoffs') {
        setView('league');
      } else if (format === 'group_stage') {
        setView('group_stage');
      } else if (format === 'double_elimination') {
        setView('double_elimination');
      } else {
        setView('bracket');
      }

      if (isOnline) {
        await rehydrateActiveTournament();
      }
    };

    socket.on('tournament:status', handleTournamentStatus);
    socket.on('tournament:abandoned', handleTournamentAbandoned);
    socket.on('vote:started', handleVoteStarted);
    socket.on('vote:ended', handleVoteEnded);
    socket.on('draft:turn_updated', handleDraftTurnUpdated);
    socket.on('fixture:ready', handleFixtureReady);

    return () => {
      socket.off('tournament:status', handleTournamentStatus);
      socket.off('tournament:abandoned', handleTournamentAbandoned);
      socket.off('vote:started', handleVoteStarted);
      socket.off('vote:ended', handleVoteEnded);
      socket.off('draft:turn_updated', handleDraftTurnUpdated);
      socket.off('fixture:ready', handleFixtureReady);
    };
  }, [socket, isOnline, user, cloudTournament?.format, rehydrateActiveTournament]);

  // Global Handshake event listener from cards and rehydrate dispatcher (T35, T37)
  useEffect(() => {
    const handleOpenHandshake = (event: any) => {
      if (event?.detail) {
        setLiveHandshakeMatch(event.detail);
      }
    };
    const handleTournamentRehydrate = () => {
      if (isOnline) {
        rehydrateActiveTournament();
      }
    };
    window.addEventListener('open-handshake-modal', handleOpenHandshake);
    window.addEventListener('tournament-rehydrate', handleTournamentRehydrate);
    return () => {
      window.removeEventListener('open-handshake-modal', handleOpenHandshake);
      window.removeEventListener('tournament-rehydrate', handleTournamentRehydrate);
    };
  }, [isOnline, rehydrateActiveTournament]);

  // Live WebSocket Handshake Notification & Sequential Unlock (RF-105, RF-108, RF-114, RF-115, RF-119, T34, T35)
  useEffect(() => {
    if (!socket || !user) return;

    const handleMatchSubmitted = (payload: any) => {
      const matchDetail = payload?.match || payload || {};
      const matchId = payload?.matchId || matchDetail.id;
      if (!matchId) return;

      const userPlayerId = user?.playerId || user?.player?.id;
      const userEmail = (user?.email || '').toLowerCase().trim();
      const awayPlayerId = payload.awayPlayerId || matchDetail.awayPlayerId || matchDetail.awayParticipant?.playerId || matchDetail.awayParticipant?.player?.id;
      const awayParticipantId = matchDetail.awayParticipantId || matchDetail.awayParticipant?.id;
      const awayEmail = (payload.awayEmail || matchDetail.awayParticipant?.player?.user?.email || '').toLowerCase().trim();

      // Check against tournament participants
      const tournamentParticipants = (cloudTournament?.participants || (activeTournament as any)?.participants || []) as any[];
      const userParticipant = tournamentParticipants.find(
        (p: any) =>
          (userPlayerId && (p.playerId === userPlayerId || p.player?.id === userPlayerId)) ||
          (userEmail && (p.player?.user?.email?.toLowerCase() === userEmail || p.email?.toLowerCase() === userEmail)) ||
          (user?.id && (p.player?.userId === user.id || p.userId === user.id))
      );

      const isAwayPlayer = Boolean(
        (userPlayerId && awayPlayerId && userPlayerId === awayPlayerId) ||
        (userParticipant && awayParticipantId && userParticipant.id === awayParticipantId) ||
        (userEmail && awayEmail && userEmail === awayEmail) ||
        (user?.id && (matchDetail.awayParticipant?.player?.userId === user.id || matchDetail.awayParticipant?.userId === user.id))
      );

      if (isOnline) {
        rehydrateActiveTournament();
      }

      if (isAwayPlayer) {
        setLiveHandshakeMatch({
          id: matchId,
          round: matchDetail.round,
          leg: matchDetail.leg,
          seriesId: matchDetail.seriesId,
          homePlayerId: matchDetail.homeParticipant?.playerId || matchDetail.homePlayerId || payload.homePlayerId || '',
          awayPlayerId: awayPlayerId || userPlayerId || user?.id,
          homePlayerName: matchDetail.homeParticipant?.player
            ? `${matchDetail.homeParticipant.player.lastName}, ${matchDetail.homeParticipant.player.firstName}`
            : (matchDetail.homeParticipant?.name || matchDetail.homePlayerName || 'Local'),
          homeTeamName: matchDetail.homeTeamName || '',
          awayPlayerName: matchDetail.awayParticipant?.player
            ? `${matchDetail.awayParticipant.player.lastName}, ${matchDetail.awayParticipant.player.firstName}`
            : user?.player
              ? `${user.player.lastName}, ${user.player.firstName}`
              : user?.name,
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
            : matchDetail.penaltiesWinnerName || null,
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

      if (isOnline) {
        rehydrateActiveTournament();
      }
    };

    const handleMatchRejected = (payload: any) => {
      setLiveHandshakeMatch((prev) => (prev && prev.id === payload.matchId ? null : prev));
      if (isOnline) {
        rehydrateActiveTournament();
      }
    };

    const handleWalkoverApplied = (payload: any) => {
      setLiveHandshakeMatch(null);

      dispatch({
        type: 'PLAYER_WALKOVER_DECLARED',
        playerId: payload.playerId,
        participantId: payload.participantId,
        matches: payload.matches,
      });

      if (isOnline) {
        rehydrateActiveTournament();
      }
    };

    const handleTournamentFinished = (payload: any) => {
      setLiveHandshakeMatch(null);
      saveOfflineTournament(null);
      setCloudTournament(null);
      setActiveTournamentId(undefined);
      dispatch({
        type: 'TOURNAMENT_FINISHED',
        summaryId: payload?.tournamentId || crypto.randomUUID(),
        now: new Date().toISOString(),
      });
      setFinishedTournamentModal(payload);
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
  }, [socket, user, dispatch, isOnline, rehydrateActiveTournament, cloudTournament, activeTournament]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <Header currentView={view} onNavigate={handleNavigate} cloudTournament={cloudTournament} />

      <main className="mx-auto">
        {view === 'lobby' && (
          <LobbyView onProceedToVoting={() => setView('votacion')} />
        )}

        {view === 'votacion' && (
          <VotingView
            tournamentId={cloudTournament?.id || activeTournamentId || activeTournament?.id}
            initialExpiresAt={votingSessionData?.expiresAt}
            initialOptions={votingSessionData?.options}
            initialTotalVoters={votingSessionData?.totalVoters}
            onProceedNext={() => setView('equipos')}
          />
        )}

        {view === 'equipos' && (
          <TeamsPreviewView
            tournamentId={cloudTournament?.id || activeTournamentId || activeTournament?.id}
            initialTheme={cloudTournament?.theme || 'Apertura 2006'}
            participantCount={cloudTournament?.participants?.length || 4}
            participants={
              cloudTournament?.participants?.map((p: any) => ({
                id: p.id,
                name: p.player ? `${p.player.firstName} ${p.player.lastName}`.trim() : (p.name || 'Jugador'),
              })) || []
            }
            onProceedToFixture={(method?: string) => {
              if (method === 'DRAFT_ORDER') {
                setView('draft');
                return;
              }
              const format = (cloudTournament?.format || '').toLowerCase();
              if (format === 'bracket') setView('bracket');
              else if (format === 'league' || format === 'league_playoffs') setView('league');
              else if (format === 'group_stage') setView('group_stage');
              else if (format === 'double_elimination') setView('double_elimination');
              else setView('draft');
            }}
          />
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

        {view === 'tabla' && <StandingsView onGoToLobby={() => setView('lobby')} />}

        {view === 'reglamento' && <RulesView />}
      </main>

      {liveHandshakeMatch && (
        <HandshakeModal
          isOpen={Boolean(liveHandshakeMatch)}
          onClose={() => setLiveHandshakeMatch(null)}
          matchData={liveHandshakeMatch}
          onSuccess={() => {
            setLiveHandshakeMatch(null);
            if (isOnline) {
              rehydrateActiveTournament();
            }
          }}
        />
      )}

      {finishedTournamentModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-300"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-primary/50 bg-card p-6 shadow-[0_0_50px_rgba(34,197,94,0.3)] text-center space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 border-2 border-primary glow-green">
              <Trophy className="h-10 w-10 text-primary" />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-primary font-mono">
                Definición Oficial
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-black text-foreground text-glow uppercase">
                🏆 ¡Torneo Finalizado!
              </h2>
              <p className="text-xs text-muted-foreground">
                Podio Oficial de la Juntada
              </p>
            </div>

            <div className="space-y-2.5 rounded-xl border border-border/80 bg-secondary/40 p-4">
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-amber-500/50 bg-amber-500/10">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-amber-300">
                  <span>🥇</span> Campeón
                </span>
                <span className="font-display text-sm font-black text-foreground uppercase">
                  {finishedTournamentModal.podium?.championName || finishedTournamentModal.podium?.champion || 'Campeón'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-400/50 bg-slate-500/10">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-slate-300">
                  <span>🥈</span> Subcampeón
                </span>
                <span className="font-display text-sm font-black text-foreground uppercase">
                  {finishedTournamentModal.podium?.runnerUpName || finishedTournamentModal.podium?.runnerUp || 'Subcampeón'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg border border-amber-700/50 bg-amber-800/10">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-amber-500">
                  <span>🥉</span> 3er Puesto
                </span>
                <span className="font-display text-sm font-black text-foreground uppercase">
                  {finishedTournamentModal.podium?.thirdName || finishedTournamentModal.podium?.third || '3er Puesto'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <SecondaryButton
                onClick={() => {
                  setFinishedTournamentModal(null);
                  setView('tabla');
                }}
                className="w-full sm:w-auto text-xs py-2.5 px-4 font-bold uppercase tracking-wider"
              >
                Ver Tabla Histórica
              </SecondaryButton>
              <PrimaryButton
                onClick={() => {
                  setFinishedTournamentModal(null);
                  setView('lobby');
                }}
                className="w-full sm:w-auto text-xs py-2.5 px-5 font-bold uppercase tracking-wider glow-green shadow-[0_0_20px_rgba(34,197,94,0.35)]"
              >
                Abrir Nuevo Torneo en Lobby
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

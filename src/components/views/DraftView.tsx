import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Layers,
  ListOrdered,
  Shield,
  Trophy,
  Clock,
} from 'lucide-react';
import { generateBracket } from '../../domain/bracket';
import { generateLeagueFixture } from '../../domain/league';
import { generateGroupsFixture } from '../../domain/groupStage';
import { generateDoubleEliminationBracket } from '../../domain/doubleElimination';
import {
  getCurrentDrafter,
  isDraftComplete,
  validateTeamName,
} from '../../domain/draft';
import { formatPlayerName } from '../../domain/players';
import type { PlayerId } from '../../domain/types';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useCountdown } from '../../hooks/useCountdown';
import { DEFAULT_THEME_TEAMS } from '../../domain/teams';
import { PrimaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';

interface DraftViewProps {
  onProceedToBracket: () => void;
  onProceedToLeague?: () => void;
  onProceedToGroupStage?: () => void;
  onProceedToDoubleElimination?: () => void;
}

export function DraftView({
  onProceedToBracket,
  onProceedToLeague,
  onProceedToGroupStage,
  onProceedToDoubleElimination,
}: DraftViewProps) {
  const { activeTournament, players } = useAppState();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [error, setError] = useState<string | null>(null);

  // Synchronized 20s Draft Turn State (T34, T35, T37, T40)
  const [serverExpiresAt, setServerExpiresAt] = useState<string | null>(null);
  const [serverCurrentParticipantId, setServerCurrentParticipantId] = useState<string | null>(null);
  const [serverCurrentParticipantName, setServerCurrentParticipantName] = useState<string | null>(null);
  const [serverDraftOrder, setServerDraftOrder] = useState<Array<{
    order: number;
    participantId: string;
    playerId?: string;
    participantName: string;
  }>>([]);
  const [serverCurrentTurnIndex, setServerCurrentTurnIndex] = useState<number>(0);
  const [serverAvailableTeams, setServerAvailableTeams] = useState<string[]>([]);
  const [chosenTeamsByParticipantName, setChosenTeamsByParticipantName] = useState<Record<string, string>>({});
  const turnCountdown = useCountdown(serverExpiresAt, 20);

  // Synchronized WebSocket event listeners for live 20s draft (T34, T35, T37, T40)
  useEffect(() => {
    if (!socket || !activeTournament?.id) return;

    socket.emit('draft:sync', activeTournament.id, (res: any) => {
      if (res?.ok && res.session) {
        setServerExpiresAt(res.session.expiresAt);
        setServerCurrentParticipantId(res.session.currentParticipantId);
        if (res.session.currentParticipantName) {
          setServerCurrentParticipantName(res.session.currentParticipantName);
        }
        if (Array.isArray(res.session.draftOrder)) {
          setServerDraftOrder(res.session.draftOrder);
        }
        if (res.session.currentTurnIndex !== undefined) {
          setServerCurrentTurnIndex(res.session.currentTurnIndex);
        }
        if (Array.isArray(res.session.availableTeams)) {
          setServerAvailableTeams(res.session.availableTeams);
        }
        if (res.session.chosenTeamsByParticipantName) {
          setChosenTeamsByParticipantName((prev) => ({ ...prev, ...res.session.chosenTeamsByParticipantName }));
        }
        if (res.session.chosenTeamsByPlayerId || res.session.chosenTeams) {
          dispatch({
            type: 'TEAMS_BATCH_ASSIGNED',
            teams: { ...(res.session.chosenTeams || {}), ...(res.session.chosenTeamsByPlayerId || {}) },
          });
        }
      }
    });

    const handleTurnUpdated = (payload: any) => {
      setServerExpiresAt(payload.expiresAt);
      setServerCurrentParticipantId(payload.currentParticipantId);
      if (payload.currentParticipantName) {
        setServerCurrentParticipantName(payload.currentParticipantName);
      }
      if (Array.isArray(payload.draftOrder)) {
        setServerDraftOrder(payload.draftOrder);
      }
      if (payload.currentTurnIndex !== undefined) {
        setServerCurrentTurnIndex(payload.currentTurnIndex);
      }
      if (Array.isArray(payload.availableTeams)) {
        setServerAvailableTeams(payload.availableTeams);
      }
      if (payload.chosenTeamsByParticipantName) {
        setChosenTeamsByParticipantName((prev) => ({ ...prev, ...payload.chosenTeamsByParticipantName }));
      }
      if (payload.chosenTeamsByPlayerId || payload.chosenTeams) {
        dispatch({
          type: 'TEAMS_BATCH_ASSIGNED',
          teams: { ...(payload.chosenTeams || {}), ...(payload.chosenTeamsByPlayerId || {}) },
        });
      }
    };

    const handleSyncResponse = (payload: any) => {
      if (payload) {
        setServerExpiresAt(payload.expiresAt);
        setServerCurrentParticipantId(payload.currentParticipantId);
        if (payload.currentParticipantName) {
          setServerCurrentParticipantName(payload.currentParticipantName);
        }
        if (Array.isArray(payload.draftOrder)) {
          setServerDraftOrder(payload.draftOrder);
        }
        if (payload.currentTurnIndex !== undefined) {
          setServerCurrentTurnIndex(payload.currentTurnIndex);
        }
        if (Array.isArray(payload.availableTeams)) {
          setServerAvailableTeams(payload.availableTeams);
        }
        if (payload.chosenTeamsByParticipantName) {
          setChosenTeamsByParticipantName((prev) => ({ ...prev, ...payload.chosenTeamsByParticipantName }));
        }
        if (payload.chosenTeamsByPlayerId || payload.chosenTeams) {
          dispatch({
            type: 'TEAMS_BATCH_ASSIGNED',
            teams: { ...(payload.chosenTeams || {}), ...(payload.chosenTeamsByPlayerId || {}) },
          });
        }
      }
    };

    const handleDraftCompleted = (payload: any) => {
      if (payload.chosenTeamsByParticipantName) {
        setChosenTeamsByParticipantName((prev) => ({ ...prev, ...payload.chosenTeamsByParticipantName }));
      }
      if (payload.chosenTeamsByPlayerId || payload.chosenTeams) {
        dispatch({
          type: 'TEAMS_BATCH_ASSIGNED',
          teams: { ...(payload.chosenTeams || {}), ...(payload.chosenTeamsByPlayerId || {}) },
        });
      }
      setServerExpiresAt(null);
    };

    socket.on('draft:turn_updated', handleTurnUpdated);
    socket.on('draft:sync:response', handleSyncResponse);
    socket.on('draft:completed', handleDraftCompleted);

    return () => {
      socket.off('draft:turn_updated', handleTurnUpdated);
      socket.off('draft:sync:response', handleSyncResponse);
      socket.off('draft:completed', handleDraftCompleted);
    };
  }, [socket, activeTournament?.id, dispatch]);

  if (!activeTournament) {
    return null;
  }

  const { theme, draftOrder, teams, participantIds } = activeTournament;
  const playersMap = new Map(players.map((p) => [p.id, p]));

  const currentDrafterId = getCurrentDrafter(draftOrder, teams);
  const effectiveCurrentDrafterId = serverCurrentParticipantId || currentDrafterId;
  const complete = isDraftComplete(participantIds, teams);

  // Set of already chosen teams (normalized for filtering - T33)
  const chosenTeamsSet = useMemo(() => {
    const set = new Set<string>();
    Object.values(teams).forEach((t) => {
      if (typeof t === 'string' && t.trim().length > 0) {
        set.add(t.trim().toLowerCase());
      }
    });
    return set;
  }, [teams]);

  // Available teams from server or default theme teams, excluding already chosen teams (T33)
  const availableTeamsList = useMemo(() => {
    const baseList =
      serverAvailableTeams.length > 0
        ? serverAvailableTeams
        : (DEFAULT_THEME_TEAMS[theme || 'Apertura 2006'] || DEFAULT_THEME_TEAMS['Apertura 2006']);

    const unique = Array.from(new Set(baseList));
    return unique.filter((t) => !chosenTeamsSet.has(t.trim().toLowerCase()));
  }, [serverAvailableTeams, theme, chosenTeamsSet]);

  // All theme teams (available + chosen) for full grid display with locks (T35)
  const allThemeTeams = useMemo(() => {
    const baseList =
      serverAvailableTeams.length > 0
        ? serverAvailableTeams
        : (DEFAULT_THEME_TEAMS[theme || 'Apertura 2006'] || DEFAULT_THEME_TEAMS['Apertura 2006']);
    const chosenList = Object.values(teams).filter(Boolean);
    return Array.from(new Set([...baseList, ...chosenList]));
  }, [serverAvailableTeams, theme, teams]);

  // Display name of current participant whose turn it is (T35)
  const currentDrafterDisplayName = useMemo(() => {
    if (serverCurrentParticipantName) return serverCurrentParticipantName;
    if (effectiveCurrentDrafterId && playersMap.has(effectiveCurrentDrafterId)) {
      return formatPlayerName(playersMap.get(effectiveCurrentDrafterId)!);
    }
    return 'Participante';
  }, [serverCurrentParticipantName, effectiveCurrentDrafterId, playersMap]);

  // Determines whether the current authenticated user has the turn (T35, T40)
  const isUserTurn = useMemo(() => {
    if (!serverCurrentParticipantId && !serverDraftOrder.length) return true; // offline/dev mode without socket server
    if (!user) return false;

    const userPlayerId = user.playerId || user.player?.id;
    const userId = user.id;

    // 1. Direct match with current entry in turn
    const currentEntry =
      serverDraftOrder.length > serverCurrentTurnIndex
        ? serverDraftOrder[serverCurrentTurnIndex]
        : null;

    if (currentEntry) {
      if (userPlayerId && (currentEntry.playerId === userPlayerId || currentEntry.participantId === userPlayerId)) {
        return true;
      }
      if (currentEntry.participantId === userId || (currentEntry.playerId && currentEntry.playerId === userId)) {
        return true;
      }
    }

    // 2. Match with serverCurrentParticipantId / effectiveCurrentDrafterId
    if (userPlayerId && (effectiveCurrentDrafterId === userPlayerId || serverCurrentParticipantId === userPlayerId)) {
      return true;
    }
    if (userId && (effectiveCurrentDrafterId === userId || serverCurrentParticipantId === userId)) {
      return true;
    }

    // 3. Name fallback
    const drafterName = currentDrafterDisplayName.trim().toLowerCase();
    const userName = (user.name || '').trim().toLowerCase();
    if (user.player) {
      const full = `${user.player.firstName} ${user.player.lastName}`.trim().toLowerCase();
      if (full && drafterName && (drafterName.includes(full) || full.includes(drafterName))) {
        return true;
      }
    }
    if (userName && drafterName && (drafterName.includes(userName) || userName.includes(drafterName))) {
      return true;
    }
    return false;
  }, [
    user,
    serverDraftOrder,
    serverCurrentTurnIndex,
    effectiveCurrentDrafterId,
    serverCurrentParticipantId,
    currentDrafterDisplayName,
  ]);

  // Unified rendered draft order honoring strict server order 1°, 2°, 3°, 4° (T40)
  const renderedDraftEntries = useMemo(() => {
    const sourceOrder =
      serverDraftOrder.length > 0
        ? serverDraftOrder
        : (activeTournament as any).serverDraftOrder &&
          Array.isArray((activeTournament as any).serverDraftOrder) &&
          (activeTournament as any).serverDraftOrder.length > 0
        ? (activeTournament as any).serverDraftOrder
        : null;

    if (sourceOrder && sourceOrder.length > 0) {
      return [...sourceOrder]
        .sort((a, b) => a.order - b.order)
        .map((entry, index) => {
          const player = entry.playerId ? playersMap.get(entry.playerId) : undefined;
          const displayName = entry.participantName || (player ? formatPlayerName(player) : `Jugador ${index + 1}`);
          const assignedTeam =
            (entry.playerId ? teams[entry.playerId] : undefined) ||
            teams[entry.participantId] ||
            (entry.participantName && chosenTeamsByParticipantName[entry.participantName]
              ? chosenTeamsByParticipantName[entry.participantName]
              : undefined);
          const hasChosen = Boolean(assignedTeam && assignedTeam.trim().length > 0);
          const isCurrentTurn =
            index === serverCurrentTurnIndex ||
            (serverCurrentParticipantId &&
              (serverCurrentParticipantId === entry.participantId || serverCurrentParticipantId === entry.playerId)) ||
            (effectiveCurrentDrafterId &&
              (effectiveCurrentDrafterId === entry.participantId || effectiveCurrentDrafterId === entry.playerId));

          return {
            id: entry.participantId || entry.playerId || `entry-${index}`,
            participantId: entry.participantId,
            playerId: entry.playerId || entry.participantId,
            order: entry.order ?? index + 1,
            displayName,
            assignedTeam,
            hasChosen,
            isCurrentTurn,
          };
        });
    }

    return draftOrder.map((playerId, index) => {
      const player = playersMap.get(playerId);
      const assignedTeam = teams[playerId];
      const isCurrentTurn = index === serverCurrentTurnIndex || effectiveCurrentDrafterId === playerId;
      const hasChosen = Boolean(assignedTeam && assignedTeam.trim().length > 0);
      return {
        id: playerId,
        participantId: playerId,
        playerId,
        order: index + 1,
        displayName: player ? formatPlayerName(player) : 'Jugador',
        assignedTeam,
        hasChosen,
        isCurrentTurn,
      };
    });
  }, [
    serverDraftOrder,
    serverCurrentTurnIndex,
    serverCurrentParticipantId,
    effectiveCurrentDrafterId,
    activeTournament,
    draftOrder,
    playersMap,
    teams,
    chosenTeamsByParticipantName,
  ]);

  const handleConfirmTeam = async (
    e?: FormEvent,
    playerId?: PlayerId,
    customPick?: string,
    participantId?: string
  ) => {
    if (e) e.preventDefault();
    setError(null);

    if (!isUserTurn) {
      setError('Solo el participante que tiene el turno puede elegir su equipo.');
      return;
    }

    const currentEntry =
      serverDraftOrder.length > serverCurrentTurnIndex
        ? serverDraftOrder[serverCurrentTurnIndex]
        : null;

    const targetPlayerId = playerId || currentEntry?.playerId || effectiveCurrentDrafterId;
    const targetParticipantId =
      participantId || currentEntry?.participantId || serverCurrentParticipantId || targetPlayerId;

    if (!targetPlayerId && !targetParticipantId) return;

    const keyForValidation = targetPlayerId || targetParticipantId!;
    const rawChoice = customPick;
    if (!rawChoice) return;

    const validation = validateTeamName(rawChoice, teams, keyForValidation);
    if (!validation.isValid) {
      setError(validation.errorMessage);
      return;
    }

    const sanitizedChoice = validation.sanitizedTeamName;

    // Dispatch locally in frontend state for both targetPlayerId and targetParticipantId
    if (targetPlayerId) {
      dispatch({
        type: 'TEAM_ASSIGNED',
        playerId: targetPlayerId,
        team: sanitizedChoice,
      });
    }
    if (targetParticipantId && targetParticipantId !== targetPlayerId) {
      dispatch({
        type: 'TEAM_ASSIGNED',
        playerId: targetParticipantId,
        team: sanitizedChoice,
      });
    }

    // Synchronize via WebSockets and REST fallback (T33, T40)
    if (activeTournament.id) {
      const idToSend = targetParticipantId || targetPlayerId!;
      if (socket) {
        socket.emit('draft:pick', {
          tournamentId: activeTournament.id,
          participantId: idToSend,
          teamName: sanitizedChoice,
        });
      }

      fetch('/api/tournaments/draft/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: activeTournament.id,
          participantId: idToSend,
          teamName: sanitizedChoice,
        }),
        credentials: 'include',
      }).catch((err) => console.warn('[DraftView] Error syncing draft pick:', err));
    }
  };

  const handleProceedToCompetition = () => {
    if (!complete) return;

    if (activeTournament.id) {
      fetch('/api/tournaments/fixture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: activeTournament.id }),
        credentials: 'include',
      }).catch((err) => console.warn('[DraftView] Error triggering cloud fixture:', err));
    }

    if (
      activeTournament.tournamentType === 'league' ||
      activeTournament.tournamentType === 'league_playoffs'
    ) {
      const matches = generateLeagueFixture(
        participantIds,
        activeTournament.matchFormat
      );
      dispatch({
        type: 'LEAGUE_GENERATED',
        matches,
      });
      if (onProceedToLeague) {
        onProceedToLeague();
      } else {
        onProceedToBracket();
      }
    } else if (activeTournament.tournamentType === 'group_stage') {
      const { groups, matches } = generateGroupsFixture(
        participantIds,
        activeTournament.matchFormat ?? 'single_match'
      );
      dispatch({
        type: 'GROUP_STAGE_GENERATED',
        groups,
        matches,
      });
      if (onProceedToGroupStage) {
        onProceedToGroupStage();
      } else {
        onProceedToBracket();
      }
    } else if (activeTournament.tournamentType === 'double_elimination') {
      const bracket = generateDoubleEliminationBracket(participantIds);
      dispatch({
        type: 'DOUBLE_ELIMINATION_GENERATED',
        bracket,
      });
      if (onProceedToDoubleElimination) {
        onProceedToDoubleElimination();
      } else {
        onProceedToBracket();
      }
    } else {
      // Shuffle participants and create asymmetric bracket (RF-17)
      const { series, byes, shuffledOrder } = generateBracket(participantIds);

      dispatch({
        type: 'BRACKET_GENERATED',
        series,
        byes,
        bracketOrder: shuffledOrder,
      });

      onProceedToBracket();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Panel
        title="Draft de Equipos"
        subtitle={theme ? `Temática: ${theme}` : 'Orden de selección'}
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Cada participante elige su equipo de la temática según el orden sorteado. No se pueden repetir equipos.
        </p>

            {/* Banner Gigante de Turno y Tiempo Restante (T35) */}
            {!complete && effectiveCurrentDrafterId && (
              <div
                className={`mb-6 rounded-2xl border-4 p-6 sm:p-8 text-center shadow-2xl transition-all ${
                  turnCountdown.secondsLeft <= 5 && !turnCountdown.isExpired
                    ? 'border-destructive bg-destructive/15 animate-pulse glow-red'
                    : 'border-primary/80 bg-gradient-to-r from-primary/15 via-background/95 to-primary/15 glow-blue'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs font-bold uppercase tracking-widest">
                    <Clock className="h-4 w-4" /> Draft Oficial de Equipos (20s)
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black font-display uppercase tracking-wide text-foreground">
                  TURNO DE: <span className="text-primary text-glow">{currentDrafterDisplayName}</span>
                  {isUserTurn && (
                    <span className="ml-3 inline-block rounded-full bg-primary/25 border-2 border-primary px-3 py-0.5 text-xs font-bold text-primary animate-pulse">
                      ¡ES TU TURNO!
                    </span>
                  )}
                </h1>
                <div className="mt-3 py-3 px-8 inline-block rounded-2xl bg-background/90 border-2 border-primary/50 shadow-inner">
                  <span className="font-mono text-4xl sm:text-5xl font-black text-primary tracking-wider">
                    TIEMPO RESTANTE:{' '}
                    <span
                      className={
                        turnCountdown.secondsLeft <= 5
                          ? 'text-destructive font-black animate-pulse'
                          : 'text-primary'
                      }
                    >
                      {turnCountdown.formattedTime}
                    </span>
                  </span>
                </div>
                <div className="mt-4 max-w-md mx-auto h-2.5 w-full bg-background/80 rounded-full overflow-hidden border border-border/50">
                  <div
                    className={`h-full transition-all duration-300 ${
                      turnCountdown.secondsLeft <= 5 ? 'bg-destructive' : 'bg-primary'
                    }`}
                    style={{ width: `${turnCountdown.progressPercentage}%` }}
                  />
                </div>
                {!isUserTurn && (
                  <p className="text-xs text-muted-foreground mt-3 font-medium">
                    🔒 Es el turno de <strong>{currentDrafterDisplayName}</strong>. La cuadrícula de equipos se desbloqueará cuando te toque elegir.
                  </p>
                )}
              </div>
            )}

            {/* Cuadrícula de Equipos de la Temática con Candados (T35) */}
            <div className="mb-6 rounded-xl border-2 border-border/80 bg-background/60 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-display font-bold text-sm uppercase tracking-wider text-foreground">
                    Cuadrícula de Equipos ({theme || 'Temática'})
                  </span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">
                  {availableTeamsList.length} disponibles de {allThemeTeams.length} total
                </span>
              </div>

              {allThemeTeams.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto pr-1">
                  {allThemeTeams.map((teamName) => {
                    const isChosen = chosenTeamsSet.has(teamName.trim().toLowerCase());
                    const chosenByPlayerId = Object.keys(teams).find(
                      (k) => (teams[k] || '').trim().toLowerCase() === teamName.trim().toLowerCase()
                    );
                    const chosenByPlayer = chosenByPlayerId ? playersMap.get(chosenByPlayerId) : null;

                    if (isChosen) {
                      const drafterName = chosenTeamsByParticipantName[teamName] || (chosenByPlayer ? formatPlayerName(chosenByPlayer) : null);
                      return (
                        <div
                          key={teamName}
                          className="flex flex-col items-center justify-center p-3 rounded-lg border border-border/40 bg-secondary/20 opacity-40 cursor-not-allowed text-center select-none"
                          title={`Ya elegido por ${drafterName || 'otro participante'}`}
                        >
                          <span className="line-through text-xs font-semibold text-muted-foreground truncate w-full">
                            {teamName}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1 mt-1 truncate max-w-full px-1">
                            🔒 {drafterName ? `Elegido por ${drafterName}` : 'Elegido'}
                          </span>
                        </div>
                      );
                    }

                    if (!isUserTurn) {
                      return (
                        <div
                          key={teamName}
                          className="flex flex-col items-center justify-center p-3 rounded-lg border border-border/50 bg-secondary/30 opacity-60 cursor-not-allowed text-center select-none"
                          title="Esperá tu turno para poder elegir"
                        >
                          <span className="text-xs font-semibold text-foreground truncate w-full">
                            {teamName}
                          </span>
                          <span className="text-[10px] text-muted-foreground mt-1">
                            🔒 Turno de otro
                          </span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={teamName}
                        type="button"
                        onClick={() => {
                          const currentEntry =
                            serverDraftOrder.length > serverCurrentTurnIndex
                              ? serverDraftOrder[serverCurrentTurnIndex]
                              : null;
                          handleConfirmTeam(
                            undefined,
                            currentEntry?.playerId || effectiveCurrentDrafterId!,
                            teamName,
                            currentEntry?.participantId || serverCurrentParticipantId || undefined
                          );
                        }}
                        className="flex flex-col items-center justify-center p-3 rounded-lg border-2 border-primary/50 bg-primary/10 hover:border-primary hover:bg-primary/25 hover:scale-[1.02] text-foreground font-bold text-xs transition cursor-pointer shadow-sm text-center"
                        title={`Hacé clic para elegir ${teamName}`}
                      >
                        <span className="truncate w-full">{teamName}</span>
                        <span className="text-[10px] text-primary font-bold mt-1">
                          Elegir →
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {complete
                    ? '¡Todos los equipos fueron seleccionados!'
                    : 'No quedan más equipos disponibles en la temática.'}
                </p>
              )}
            </div>

            <ol className="space-y-3">
              {renderedDraftEntries.map((item, index) => {
                const {
                  id,
                  order,
                  displayName,
                  assignedTeam,
                  hasChosen,
                  isCurrentTurn,
                } = item;

                return (
                  <li
                    key={id || index}
                    className={`flex flex-col gap-3 rounded-sm border p-4 transition sm:flex-row sm:items-center ${
                      isCurrentTurn
                        ? 'border-accent bg-accent/10 glow-blue shadow-[0_0_15px_rgba(56,189,248,0.2)]'
                        : hasChosen
                          ? 'border-border bg-background/60'
                          : 'border-border/40 bg-background/20 opacity-60'
                    }`}
                  >
                    {/* Posición en el draft */}
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-10 w-12 items-center justify-center rounded-sm font-display font-black text-sm ${
                          order === 1
                            ? 'bg-accent text-accent-foreground glow-blue'
                            : isCurrentTurn
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-accent'
                        }`}
                      >
                        {order}°
                      </span>

                      {/* Nombre del jugador */}
                      <span className="w-44 truncate text-lg font-semibold text-foreground">
                        {displayName}
                      </span>
                    </div>

                    {/* Formulario de equipo o visualización */}
                    <div className="flex-1">
                      {hasChosen ? (
                        <div className="flex items-center justify-between gap-2 rounded-sm border border-border/80 bg-field px-3 py-2 text-foreground">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary" />
                            <span className="font-semibold">{assignedTeam}</span>
                          </div>
                          <span className="flex items-center gap-1 font-display text-xs text-primary">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Elegido
                          </span>
                        </div>
                      ) : isCurrentTurn ? (
                        isUserTurn ? (
                          <div className="flex items-center gap-2 rounded-sm border border-primary/50 bg-primary/10 px-3 py-2 text-xs text-primary font-bold animate-pulse">
                            <span>👉 Hacé clic en tu equipo en la cuadrícula de arriba para seleccionarlo</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-sm border border-border/60 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground italic">
                            <span>
                              🔒 Esperando que {currentDrafterDisplayName} elija su equipo (tiempo restante: {turnCountdown.formattedTime})
                            </span>
                          </div>
                        )
                      ) : (
                        <span className="text-xs uppercase tracking-wider text-muted-foreground/80">
                          Esperando turno...
                        </span>
                      )}

                      {isCurrentTurn && error && (
                        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-destructive">
                          {error}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

        {/* Botón de generar competencia */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 sm:flex-row">
          <div>
            {complete ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {activeTournament.tournamentType === 'league' ||
                activeTournament.tournamentType === 'league_playoffs'
                  ? '¡Todos los equipos fueron elegidos! Podés armar el fixture de la liga.'
                  : activeTournament.tournamentType === 'group_stage'
                    ? '¡Todos los equipos fueron elegidos! Podés sortear los grupos y armar el fixture.'
                    : '¡Todos los equipos fueron elegidos! Podés armar el cuadro de partidos.'}
              </p>
            ) : (
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Esperando a que todos los participantes confirmen su equipo...
              </p>
            )}
          </div>

          <PrimaryButton
            disabled={!complete}
            onClick={handleProceedToCompetition}
          >
            {activeTournament.tournamentType === 'league' ||
            activeTournament.tournamentType === 'league_playoffs' ? (
              <>
                Sortear fixture de liga <ListOrdered className="h-4 w-4" />
              </>
            ) : activeTournament.tournamentType === 'group_stage' ? (
              <>
                Sortear grupos y fixture <Layers className="h-4 w-4" />
              </>
            ) : (
              <>
                Sortear llaves <Trophy className="h-4 w-4" />
              </>
            )}
          </PrimaryButton>
        </div>
      </Panel>
    </div>
  );
}

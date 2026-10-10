import { Award, ChevronRight, Medal, Trophy } from 'lucide-react';
import { formatPlayerName } from '../../domain/players';
import { isBracketComplete } from '../../domain/series';
import { getPodium } from '../../domain/standings';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { PrimaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';

interface PodiumPanelProps {
  onTournamentFinished: () => void;
}

export function PodiumPanel({ onTournamentFinished }: PodiumPanelProps) {
  const { activeTournament, players } = useAppState();
  const dispatch = useAppDispatch();

  if (!activeTournament) return null;

  const finalSeries = activeTournament.series.find((s) => s.id === 'F');
  const thirdPlaceSeries = activeTournament.series.find((s) => s.id === 'TP');

  // Render only when both Final and Third place exist and are strictly 100% confirmed (RF-30)
  if (
    !isBracketComplete(activeTournament.series) ||
    !finalSeries ||
    !finalSeries.confirmed ||
    !thirdPlaceSeries ||
    !thirdPlaceSeries.confirmed
  ) {
    return null;
  }

  const matchFormat = activeTournament.matchFormat ?? 'two_legged';
  let podium: ReturnType<typeof getPodium>;
  try {
    podium = getPodium(activeTournament.series, matchFormat);
  } catch (err) {
    console.error('[PodiumPanel] Error al obtener el podio:', err);
    return null;
  }
  const playersMap = new Map(players.map((p) => [p.id, p]));
  const { teams } = activeTournament;

  const champPlayer = playersMap.get(podium.champion);
  const runnerPlayer = playersMap.get(podium.runnerUp);
  const thirdPlayer = playersMap.get(podium.third);
  const fourthPlayer = playersMap.get(podium.fourth);

  const champName = champPlayer ? formatPlayerName(champPlayer) : 'Campeón';
  const runnerName = runnerPlayer ? formatPlayerName(runnerPlayer) : 'Subcampeón';
  const thirdName = thirdPlayer ? formatPlayerName(thirdPlayer) : '3er Puesto';
  const fourthName = fourthPlayer ? formatPlayerName(fourthPlayer) : '4to Puesto';

  const champTeam = teams[podium.champion] ?? '—';
  const runnerTeam = teams[podium.runnerUp] ?? '—';
  const thirdTeam = teams[podium.third] ?? '—';
  const fourthTeam = teams[podium.fourth] ?? '—';

  const handleFinish = () => {
    dispatch({
      type: 'TOURNAMENT_FINISHED',
      summaryId: crypto.randomUUID(),
      now: new Date().toISOString(),
    });

    onTournamentFinished();
  };

  return (
    <Panel
      title="🏆 Podio Oficial del Torneo"
      subtitle="Definición final completada"
      className="border-primary/80 glow-green"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1° Campeón */}
        <div className="flex flex-col items-center justify-between rounded-sm border-2 border-primary bg-primary/10 p-5 text-center shadow-[0_0_20px_rgba(74,222,128,0.25)]">
          <div className="flex flex-col items-center">
            <Trophy className="h-10 w-10 text-primary glow-green" />
            <span className="mt-2 font-display text-xs font-black uppercase tracking-widest text-primary">
              Campeón (+10 PTS)
            </span>
            <p className="mt-2 text-lg font-bold text-foreground">{champName}</p>
            <p className="text-xs text-muted-foreground">{champTeam}</p>
          </div>
        </div>

        {/* 2° Subcampeón */}
        <div className="flex flex-col items-center justify-between rounded-sm border border-accent bg-accent/10 p-5 text-center">
          <div className="flex flex-col items-center">
            <Medal className="h-10 w-10 text-accent glow-blue" />
            <span className="mt-2 font-display text-xs font-black uppercase tracking-widest text-accent">
              Subcampeón (+7 PTS)
            </span>
            <p className="mt-2 text-lg font-bold text-foreground">{runnerName}</p>
            <p className="text-xs text-muted-foreground">{runnerTeam}</p>
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground/75 italic">
            El segundo es el primero de los perdedores
          </p>
        </div>

        {/* 3° Tercer Puesto */}
        <div className="flex flex-col items-center justify-between rounded-sm border border-border bg-background/60 p-5 text-center">
          <div className="flex flex-col items-center">
            <Award className="h-9 w-9 text-gold" />
            <span className="mt-2 font-display text-xs font-black uppercase tracking-widest text-gold">
              3er Puesto (+5 PTS)
            </span>
            <p className="mt-2 text-lg font-bold text-foreground">{thirdName}</p>
            <p className="text-xs text-muted-foreground">{thirdTeam}</p>
          </div>
        </div>

        {/* 4° Cuarto Puesto */}
        <div className="flex flex-col items-center justify-between rounded-sm border border-border/60 bg-background/40 p-5 text-center opacity-85">
          <div className="flex flex-col items-center">
            <Award className="h-9 w-9 text-muted-foreground" />
            <span className="mt-2 font-display text-xs font-black uppercase tracking-widest text-muted-foreground">
              4to Puesto (+3 PTS)
            </span>
            <p className="mt-2 text-lg font-bold text-foreground">{fourthName}</p>
            <p className="text-xs text-muted-foreground">{fourthTeam}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          Al finalizar, se guardará el resumen en el historial y se sumarán los puntos y estadísticas a la tabla histórica.
        </p>

        <PrimaryButton onClick={handleFinish} className="px-8 py-3.5">
          Finalizar Torneo y Ver Tabla <ChevronRight className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </Panel>
  );
}

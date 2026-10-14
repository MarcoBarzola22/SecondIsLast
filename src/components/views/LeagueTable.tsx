import { AlertTriangle, CheckCircle2, Shield, Trophy, XCircle } from 'lucide-react';
import type { LeagueStandingRow, PlayerId, TournamentType } from '../../domain/types';
import { useAppState } from '../../state/AppContext';

interface LeagueTableProps {
  standings: LeagueStandingRow[];
  walkoverPlayerIds?: readonly PlayerId[];
  qualifyingCutoff?: number;
  mathematicallyQualifiedIds?: Record<PlayerId, boolean> | Set<PlayerId>;
  mathematicallyEliminatedIds?: Record<PlayerId, boolean> | Set<PlayerId>;
  qualificationLegend?: string;
  isGroupTable?: boolean;
  tournamentType?: TournamentType;
}

export function LeagueTable({
  standings,
  walkoverPlayerIds,
  qualifyingCutoff: propQualifyingCutoff,
  mathematicallyQualifiedIds,
  mathematicallyEliminatedIds,
  qualificationLegend,
  isGroupTable,
  tournamentType: propTournamentType,
}: LeagueTableProps) {
  const { activeTournament } = useAppState();
  const tournamentType = propTournamentType ?? activeTournament?.tournamentType;
  const isLeague = tournamentType === 'league';

  const qualifyingCutoff = isLeague ? 1 : propQualifyingCutoff;

  const legendText =
    qualificationLegend ??
    (isLeague
      ? 'El 1º se consagra Campeón'
      : isGroupTable
      ? qualifyingCutoff === 2
        ? '1° y 2° de cada grupo clasifican a Semifinales'
        : 'El 1° de cada grupo clasifica directo a Semifinales'
      : qualifyingCutoff === 2
        ? 'Los primeros 2 clasifican a la Final'
        : qualifyingCutoff !== undefined
          ? `Los primeros ${qualifyingCutoff} clasifican al Reducido`
          : null);

  return (
    <div className="space-y-3">
      {/* Leyenda explicativa de corte y clasificación (RF-83) */}
      {legendText && (
        <div className="flex items-center justify-between gap-2 rounded-sm border border-border/70 bg-secondary/30 px-3.5 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
            <span className="font-semibold text-foreground">{legendText}</span>
          </div>
          {!isLeague && qualifyingCutoff !== undefined && (
            <span className="font-mono text-[11px] font-bold text-emerald-400">
              Cupos: {qualifyingCutoff}
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left min-w-[700px]">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
              <th className="py-3 pl-3 text-center w-14">Pos</th>
              <th className="py-3 px-3">Participante</th>
              <th className="py-3 px-3 text-center">PTS</th>
              <th className="py-3 px-2 text-center">PJ</th>
              <th className="py-3 px-2 text-center">PG</th>
              <th className="py-3 px-2 text-center">PE</th>
              <th className="py-3 px-2 text-center">PP</th>
              <th className="py-3 px-2 text-center">GF</th>
              <th className="py-3 px-2 text-center">GC</th>
              <th className="py-3 px-2 text-center">DG</th>
              <th className="py-3 px-2 text-center" title="Tarjetas Rojas">
                <span className="inline-flex items-center justify-center gap-1 text-red-400">
                  <span className="inline-block w-2 h-2.5 rounded-[1px] bg-red-500"></span>
                  TR
                </span>
              </th>
              <th className="py-3 pr-3 text-center" title="Tarjetas Amarillas">
                <span className="inline-flex items-center justify-center gap-1 text-amber-400">
                  <span className="inline-block w-2 h-2.5 rounded-[1px] bg-amber-400"></span>
                  TA
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-mono text-sm">
            {standings.map((r, index) => {
              const isLeader = index === 0;
              const isRunnerUp = index === 1;
              const isThird = index === 2;
              const isWalkover = walkoverPlayerIds?.includes(r.playerId);
              const isQualified =
                qualifyingCutoff !== undefined && index < qualifyingCutoff;
              const isCutoffLine =
                qualifyingCutoff !== undefined &&
                index === qualifyingCutoff - 1 &&
                index < standings.length - 1;

              const isMathQualified = Boolean(
                mathematicallyQualifiedIds instanceof Set
                  ? mathematicallyQualifiedIds.has(r.playerId)
                  : mathematicallyQualifiedIds?.[r.playerId]
              );

              const isMathEliminated = Boolean(
                mathematicallyEliminatedIds instanceof Set
                  ? mathematicallyEliminatedIds.has(r.playerId)
                  : mathematicallyEliminatedIds?.[r.playerId]
              );

              return (
                <tr
                  key={r.playerId}
                  className={`transition border-l-4 ${
                    isCutoffLine ? 'border-b-2 border-emerald-500/60' : ''
                  } ${
                    isWalkover
                      ? 'border-l-transparent bg-destructive/5 opacity-80'
                      : isMathEliminated
                        ? 'border-l-destructive/50 bg-destructive/5 opacity-75 hover:opacity-100 hover:bg-background/40'
                        : isQualified
                          ? 'border-l-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 shadow-[inset_0_0_12px_rgba(74,222,128,0.06)]'
                          : 'border-l-transparent hover:bg-background/40'
                  }`}
                >
                  {/* Pos */}
                  <td className="py-3.5 pl-3 text-center font-display font-black text-base">
                    <span
                      className={
                        isWalkover
                          ? 'text-muted-foreground'
                          : isLeader
                            ? 'text-primary glow-green'
                            : isRunnerUp
                              ? 'text-accent'
                              : isThird
                                ? 'text-gold'
                                : 'text-muted-foreground'
                      }
                    >
                      {r.rank}°
                    </span>
                  </td>

                  {/* Participante (con equipo) */}
                  <td className="py-3.5 px-3 font-sans">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`font-semibold text-base ${
                          isWalkover ? 'text-destructive line-through' : 'text-foreground'
                        }`}
                      >
                        {r.displayName}
                      </span>

                      {/* Badge "Clasificado" con check verde (RF-74) */}
                      {isMathQualified && !isWalkover && (
                        <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/80 bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300 shadow-[0_0_8px_rgba(74,222,128,0.25)]">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                          {isLeague ? 'Campeón' : 'Clasificado'}
                        </span>
                      )}

                      {/* Badge "Sin chances / Eliminado" (RF-83) */}
                      {isMathEliminated && !isWalkover && !isMathQualified && (
                        <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive/90">
                          <XCircle className="h-3 w-3 text-destructive shrink-0" />
                          Sin chances
                        </span>
                      )}

                      {/* En zona de clasificación previa al cálculo matemático definitivo */}
                      {!isMathQualified && !isMathEliminated && isQualified && !isWalkover && (
                        <span className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                          {isLeague
                            ? 'Campeón'
                            : isGroupTable
                            ? 'Semifinales'
                            : qualifyingCutoff !== undefined && qualifyingCutoff <= 2
                            ? 'Final'
                            : 'Reducido'}
                        </span>
                      )}

                      {isWalkover && (
                        <span className="rounded bg-destructive/20 border border-destructive/50 px-1.5 py-0.5 text-[10px] font-black uppercase text-destructive flex items-center gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" /> W.O.
                        </span>
                      )}
                      {isLeader && !isWalkover && (
                        <span title="Líder del torneo">
                          <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />
                        </span>
                      )}
                    </div>
                    {r.team && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Shield className="h-3 w-3 text-primary shrink-0" />
                        <span className="truncate">{r.team}</span>
                      </div>
                    )}
                  </td>

                {/* PTS */}
                <td className="py-3.5 px-3 text-center font-display font-black text-base text-accent">
                  {r.pts}
                </td>

                {/* PJ */}
                <td className="py-3.5 px-2 text-center text-foreground font-semibold">
                  {r.pj}
                </td>

                {/* PG */}
                <td className="py-3.5 px-2 text-center text-primary font-semibold">
                  {r.pg}
                </td>

                {/* PE */}
                <td className="py-3.5 px-2 text-center text-muted-foreground">
                  {r.pe}
                </td>

                {/* PP */}
                <td className="py-3.5 px-2 text-center text-destructive/80">
                  {r.pp}
                </td>

                {/* GF */}
                <td className="py-3.5 px-2 text-center text-foreground">
                  {r.gf}
                </td>

                {/* GC */}
                <td className="py-3.5 px-2 text-center text-muted-foreground">
                  {r.gc}
                </td>

                {/* DG */}
                <td className="py-3.5 px-2 text-center font-bold">
                  <span
                    className={
                      r.dg > 0
                        ? 'text-primary'
                        : r.dg < 0
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    }
                  >
                    {r.dg > 0 ? `+${r.dg}` : r.dg}
                  </span>
                </td>

                {/* TR */}
                <td className="py-3.5 px-2 text-center text-red-400 font-semibold font-mono text-xs">
                  {r.redCards ?? 0}
                </td>

                {/* TA */}
                <td className="py-3.5 pr-3 text-center text-amber-400 font-semibold font-mono text-xs">
                  {r.yellowCards ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);
}

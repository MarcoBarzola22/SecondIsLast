import { Trophy, Users } from 'lucide-react';
import { buildStandings } from '../../domain/standings';
import { useAppState } from '../../state/AppContext';
import { Panel } from '../ui/Panel';

export function StandingsView() {
  const { players, stats, history } = useAppState();

  const rows = buildStandings(players, stats);
  const totalTournaments = history.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Panel
        title="Tabla General"
        subtitle={
          totalTournaments === 0
            ? 'Sin torneos jugados'
            : totalTournaments === 1
              ? '1 torneo disputado'
              : `${totalTournaments} torneos disputados`
        }
      >
        {rows.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-12 text-center text-muted-foreground">
            <Users className="mx-auto mb-3 h-10 w-10 opacity-40 text-accent" />
            <p className="font-display text-lg font-bold uppercase tracking-wider text-foreground">
              Todavía no se jugó ningún torneo
            </p>
            <p className="mt-2 text-sm">
              Cargá los participantes, sorteá la temática y jugá el primer torneo para empezar a sumar puntos en el historial.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="py-3 pl-3 text-center w-14">Rank</th>
                  <th className="py-3 px-3">JUGADORES</th>
                  <th className="py-3 px-3 text-center">PTS</th>
                  <th className="py-3 px-2 text-center">PJ</th>
                  <th className="py-3 px-2 text-center">PG</th>
                  <th className="py-3 px-2 text-center">PP</th>
                  <th className="py-3 px-2 text-center">GF</th>
                  <th className="py-3 px-2 text-center">GC</th>
                  <th className="py-3 px-2 text-center">DG</th>
                  <th className="py-3 pr-3 text-center">TJ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono text-sm">
                {rows.map((r, index) => {
                  const isLeader = index === 0;

                  return (
                    <tr
                      key={r.playerId}
                      className={`transition ${
                        isLeader
                          ? 'bg-primary/10 shadow-[inset_0_0_15px_rgba(74,222,128,0.08)]'
                          : 'hover:bg-background/40'
                      }`}
                    >
                      {/* Rank */}
                      <td className="py-3.5 pl-3 text-center font-display font-black text-accent text-base">
                        {r.rank}
                      </td>

                      {/* JUGADORES */}
                      <td className="py-3.5 px-3 font-sans font-semibold text-foreground text-base">
                        <div className="flex items-center gap-2">
                          <span>{r.displayName}</span>
                          {isLeader && (
                            <span title="Puntero del torneo">
                              <Trophy className="h-4 w-4 shrink-0 text-primary glow-green" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* PTS */}
                      <td className="py-3.5 px-3 text-center font-display font-black text-primary text-lg">
                        {r.pts}
                      </td>

                      {/* PJ */}
                      <td className="py-3.5 px-2 text-center text-foreground">
                        {r.pj}
                      </td>

                      {/* PG */}
                      <td className="py-3.5 px-2 text-center text-foreground font-semibold">
                        {r.pg}
                      </td>

                      {/* PP */}
                      <td className="py-3.5 px-2 text-center text-muted-foreground">
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
                      <td
                        className={`py-3.5 px-2 text-center font-bold ${
                          r.dg > 0
                            ? 'text-primary'
                            : r.dg < 0
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {r.dg > 0 ? `+${r.dg}` : r.dg}
                      </td>

                      {/* TJ */}
                      <td className="py-3.5 pr-3 text-center font-bold text-accent">
                        {r.tj}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="mt-6 text-xs uppercase tracking-widest text-muted-foreground/80 italic text-right">
              El segundo es el primero de los perdedores.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

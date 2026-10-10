import { Shield, Trophy } from 'lucide-react';
import type { LeagueStandingRow } from '../../domain/types';

interface LeagueTableProps {
  standings: LeagueStandingRow[];
}

export function LeagueTable({ standings }: LeagueTableProps) {
  return (
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
            <th className="py-3 pr-3 text-center">DG</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40 font-mono text-sm">
          {standings.map((r, index) => {
            const isLeader = index === 0;
            const isRunnerUp = index === 1;
            const isThird = index === 2;

            return (
              <tr
                key={r.playerId}
                className={`transition ${
                  isLeader
                    ? 'bg-primary/10 shadow-[inset_0_0_15px_rgba(74,222,128,0.08)]'
                    : 'hover:bg-background/40'
                }`}
              >
                {/* Pos */}
                <td className="py-3.5 pl-3 text-center font-display font-black text-base">
                  <span
                    className={
                      isLeader
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
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-base">
                      {r.displayName}
                    </span>
                    {isLeader && (
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
                <td className="py-3.5 pr-3 text-center font-bold">
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

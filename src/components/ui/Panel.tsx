import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, children, className = '' }: PanelProps) {
  return (
    <section className={`panel-metal rounded-md ${className}`}>
      <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-3">
        <h2 className="font-display text-lg font-extrabold uppercase tracking-widest text-accent text-glow">
          {title}
        </h2>
        {subtitle && (
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            {subtitle}
          </span>
        )}
      </div>
      <div className="p-5 md:p-8">{children}</div>
    </section>
  );
}

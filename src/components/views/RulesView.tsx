import { useEffect, useState, useMemo } from 'react';
import {
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Quote,
  Scale,
  Search,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import {
  OFFICIAL_HOUSE_RULES,
  type HouseRule,
  type OfficialHouseRulesDocument,
} from '../../domain/houseRules';
import { loadOfflineRules, saveOfflineRules } from '../../cache/offlineStore';

type CategoryFilter = 'all' | 'governance' | 'handshake' | 'fixture' | 'awards';

export function RulesView() {
  const [rulesDoc, setRulesDoc] = useState<OfficialHouseRulesDocument>(() => {
    const cached = loadOfflineRules();
    return cached?.rules ? cached : OFFICIAL_HOUSE_RULES;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [isFromNetwork, setIsFromNetwork] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchRules() {
      try {
        const res = await fetch('/api/rules', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          const doc: OfficialHouseRulesDocument = data.document || {
            ...OFFICIAL_HOUSE_RULES,
            rules: data.rules || OFFICIAL_HOUSE_RULES.rules,
          };
          if (isMounted) {
            setRulesDoc(doc);
            setIsFromNetwork(true);
            saveOfflineRules(doc);
          }
        }
      } catch (err) {
        // Fallback already provided by state initialization (RF-120)
        console.info('[RulesView] Running from local/offline house rules cache:', err);
      }
    }

    fetchRules();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRules = useMemo(() => {
    return rulesDoc.rules.filter((rule: HouseRule) => {
      // Category filter
      if (selectedCategory === 'governance') {
        if (rule.id !== 'quorum' && rule.id !== 'voting') return false;
      } else if (selectedCategory === 'handshake') {
        if (rule.id !== 'handshake' && rule.id !== 'anti_tamper') return false;
      } else if (selectedCategory === 'fixture') {
        if (rule.id !== 'sequential_queue' && rule.id !== 'tiebreakers') return false;
      } else if (selectedCategory === 'awards') {
        if (rule.id !== 'walkover' && rule.id !== 'annual_ranking') return false;
      }

      // Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        rule.title.toLowerCase().includes(q) ||
        rule.subtitle.toLowerCase().includes(q) ||
        rule.summary.toLowerCase().includes(q) ||
        rule.description.toLowerCase().includes(q) ||
        rule.rfReference.toLowerCase().includes(q) ||
        rule.keyPoints.some((pt) => pt.toLowerCase().includes(q))
      );
    });
  }, [rulesDoc.rules, searchQuery, selectedCategory]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="panel-metal rounded-md p-5 border border-primary/40 bg-card/90 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 h-44 w-44 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/20 border border-primary/50 text-primary shadow-[0_0_15px_rgba(34,197,94,0.3)]">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl font-black uppercase tracking-wider text-foreground">
                  Reglamento Oficial de la Casa
                </h2>
                <span className="rounded bg-primary/20 border border-primary/40 px-2 py-0.5 text-[10px] font-mono font-bold text-primary tracking-wider uppercase">
                  v{rulesDoc.version}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {rulesDoc.subtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded bg-secondary/80 border border-border px-2.5 py-1 text-xs text-muted-foreground font-mono">
              <Scale className="h-3.5 w-3.5 text-accent" />
              8 Artículos Consensuados
            </span>
            <span
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono font-medium border ${
                isFromNetwork
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              {isFromNetwork ? (
                <>
                  <Sparkles className="h-3 w-3" /> Servidor en Vivo
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" /> Caché Local
                </>
              )}
            </span>
          </div>
        </div>

        {/* Preamble Quote */}
        <div className="mt-5 rounded-md border border-accent/30 bg-accent/5 p-4 text-sm text-foreground/90 relative">
          <Quote className="absolute top-3 right-3 h-8 w-8 text-accent/15 pointer-events-none" />
          <p className="italic leading-relaxed">
            "{rulesDoc.preamble}"
          </p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar en el reglamento (ej: quórum, 0-3, desempate, penales)..."
            className="w-full rounded-md border border-border bg-secondary/60 pl-9 pr-4 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-primary text-primary-foreground font-bold shadow'
                : 'bg-secondary text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Todos (8)
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('governance')}
            className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition shrink-0 ${
              selectedCategory === 'governance'
                ? 'bg-primary text-primary-foreground font-bold shadow'
                : 'bg-secondary text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Quórum & Voto
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('handshake')}
            className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition shrink-0 ${
              selectedCategory === 'handshake'
                ? 'bg-primary text-primary-foreground font-bold shadow'
                : 'bg-secondary text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Handshake & Admin
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('fixture')}
            className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition shrink-0 ${
              selectedCategory === 'fixture'
                ? 'bg-primary text-primary-foreground font-bold shadow'
                : 'bg-secondary text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Fixture & Desempate
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('awards')}
            className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition shrink-0 ${
              selectedCategory === 'awards'
                ? 'bg-primary text-primary-foreground font-bold shadow'
                : 'bg-secondary text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Walkover & Ranking
          </button>
        </div>
      </div>

      {/* Rules Grid */}
      {filteredRules.length === 0 ? (
        <div className="panel-metal rounded-md text-center py-12 px-4">
          <HelpCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-muted-foreground text-sm font-medium">
            No se encontraron artículos que coincidan con "{searchQuery}".
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="mt-3 text-xs text-primary hover:underline font-semibold uppercase tracking-wider"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredRules.map((rule) => {
            const isHandshake = rule.id === 'handshake';
            const isAntiTamper = rule.id === 'anti_tamper';
            const isRanking = rule.id === 'annual_ranking';

            return (
              <div
                key={rule.id}
                className="panel-metal rounded-md p-5 flex flex-col justify-between border-border hover:border-primary/50 transition-all duration-200 shadow-lg bg-card/95 hover:shadow-xl"
              >
                <div>
                  {/* Article Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded bg-primary/20 text-primary font-display font-black text-sm border border-primary/40 shrink-0">
                        {rule.articleNumber}
                      </span>
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                          Artículo {rule.articleNumber}
                        </span>
                        <h3 className="font-display text-lg font-black tracking-wide text-foreground leading-tight">
                          {rule.title}
                        </h3>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider border ${
                        isAntiTamper
                          ? 'bg-destructive/15 text-destructive border-destructive/30'
                          : isRanking
                          ? 'bg-gold/15 text-gold border-gold/30'
                          : isHandshake
                          ? 'bg-accent/15 text-accent border-accent/30'
                          : 'bg-primary/10 text-primary border-primary/25'
                      }`}
                    >
                      {rule.badge}
                    </span>
                  </div>

                  {/* Subtitle */}
                  <p className="text-xs font-semibold text-accent mb-3">
                    {rule.subtitle}
                  </p>

                  {/* Summary Box */}
                  <div className="rounded bg-secondary/50 border border-border/80 p-2.5 text-xs text-foreground/90 font-medium mb-3.5 leading-relaxed">
                    {rule.summary}
                  </div>

                  {/* Full Description */}
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    {rule.description}
                  </p>

                  {/* Key Points Bullet List */}
                  <div className="space-y-1.5 mb-4">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground block mb-1">
                      Puntos Clave:
                    </span>
                    {rule.keyPoints.map((point, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 text-xs text-foreground/80 leading-snug"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Quote */}
                <div className="mt-2 pt-3 border-t border-border/60 flex items-center gap-2 text-xs italic text-muted-foreground/90 bg-secondary/20 -mx-4 -mb-4 px-4 py-2.5 rounded-b">
                  <Quote className="h-3.5 w-3.5 text-accent/60 shrink-0" />
                  <span>"{rule.quote}"</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Legal Note */}
      <div className="text-center py-4 text-xs text-muted-foreground border-t border-border/50">
        <p className="font-mono tracking-wider">
          {rulesDoc.footer} · Última actualización: {rulesDoc.lastUpdated}
        </p>
      </div>
    </div>
  );
}

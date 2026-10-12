import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  ChevronRight,
  Disc3,
  Dices,
  ListFilter,
  Plus,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { createDraftOrder } from '../../domain/draft';
import {
  THEMES,
  getAllThemes,
  pickRandomTheme,
  validateCustomTheme,
} from '../../domain/theme';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';
import { inputClassName } from '../ui/input';
import { Panel } from '../ui/Panel';

interface ThemeViewProps {
  onProceedToDraft: () => void;
}

export function ThemeView({ onProceedToDraft }: ThemeViewProps) {
  const { activeTournament, customThemes } = useAppState();
  const dispatch = useAppDispatch();

  const availableThemes = getAllThemes(customThemes ?? []);
  const currentTheme = activeTournament?.theme ?? null;

  const [display, setDisplay] = useState<string>(
    currentTheme ?? '¿Qué temática te toca?'
  );
  const [spinning, setSpinning] = useState(false);

  // Selector manual interactivo (RF-81)
  const [manualThemeSelection, setManualThemeSelection] = useState<string>(
    currentTheme ?? (availableThemes[0] || '')
  );

  useEffect(() => {
    if (currentTheme) {
      setManualThemeSelection(currentTheme);
    }
  }, [currentTheme]);

  // Form for custom theme (RF-57)
  const [newTheme, setNewTheme] = useState('');
  const [themeError, setThemeError] = useState<string | null>(null);

  const isLocked =
    activeTournament !== null &&
    (activeTournament.phase === 'draft' ||
      activeTournament.phase === 'bracket' ||
      activeTournament.phase === 'league');

  const spin = () => {
    if (spinning || isLocked || availableThemes.length === 0) return;

    setSpinning(true);
    let n = 0;
    const totalTicks = 20 + Math.floor(Math.random() * 10);

    const tick = () => {
      n++;
      const nextTemp = availableThemes[n % availableThemes.length]!;
      setDisplay(nextTemp);

      if (n < totalTicks) {
        // Decelerating delay
        const delay = 40 + n * n * 0.6;
        setTimeout(tick, delay);
      } else {
        // Final pick using domain logic over all available themes (RF-8, RF-58)
        const selected = pickRandomTheme(Math.random, availableThemes);
        setDisplay(selected);
        dispatch({ type: 'THEME_SET', theme: selected });
        setSpinning(false);
      }
    };

    tick();
  };

  const handleSelectManualTheme = (themeToSet?: string) => {
    const chosen = themeToSet ?? manualThemeSelection;
    if (!chosen || spinning || isLocked) return;
    setManualThemeSelection(chosen);
    setDisplay(chosen);
    dispatch({ type: 'THEME_SET', theme: chosen });
  };

  const handleAddTheme = (e: FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setThemeError(null);

    const validation = validateCustomTheme(newTheme, availableThemes);
    if (!validation.isValid) {
      setThemeError(validation.errorMessage);
      return;
    }

    dispatch({
      type: 'CUSTOM_THEME_ADDED',
      theme: validation.sanitizedTheme,
    });

    setNewTheme('');
  };

  const handleProceed = () => {
    if (!currentTheme || spinning || !activeTournament) return;

    // Generate randomized draft pick order with Fisher-Yates (RF-11)
    const order =
      activeTournament.draftOrder.length > 0
        ? activeTournament.draftOrder
        : createDraftOrder(activeTournament.participantIds);

    dispatch({ type: 'DRAFT_STARTED', order });
    onProceedToDraft();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Panel
        title="Temática del Torneo"
        subtitle={
          currentTheme
            ? `Elegida: ${currentTheme}`
            : 'Girá la ruleta o elegí directamente la temática'
        }
      >
        <div className="flex flex-col items-center gap-6 py-4">
          {/* Ruleta Display */}
          <div
            className={`relative w-full overflow-hidden rounded-sm border-2 bg-background py-10 text-center transition ${
              spinning
                ? 'border-accent glow-blue shadow-[0_0_15px_rgba(56,189,248,0.25)]'
                : currentTheme
                  ? 'border-primary glow-green shadow-[0_0_15px_rgba(74,222,128,0.2)]'
                  : 'border-border'
            }`}
          >
            <Disc3
              className={`absolute left-4 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground transition ${
                spinning
                  ? 'animate-spin text-accent'
                  : currentTheme
                    ? 'text-primary'
                    : ''
              }`}
            />
            <p className="px-12 font-display text-2xl font-black uppercase tracking-wider text-foreground md:text-3xl">
              {display}
            </p>
          </div>

          {/* Botón de girar ruleta */}
          <div className="flex flex-col items-center gap-2">
            <SecondaryButton
              type="button"
              disabled={spinning || isLocked}
              onClick={spin}
              className="px-8 py-3 text-sm"
            >
              {spinning ? (
                <>
                  <Disc3 className="h-4 w-4 animate-spin" /> Girando ruleta...
                </>
              ) : currentTheme ? (
                <>
                  <RotateCcw className="h-4 w-4" /> Volver a girar
                </>
              ) : (
                <>
                  <Dices className="h-4 w-4" /> Girar ruleta
                </>
              )}
            </SecondaryButton>

            <span className="text-xs tracking-wider text-muted-foreground">
              {spinning
                ? 'Sorteando entre las temáticas disponibles...'
                : currentTheme
                  ? 'Podés volver a girar antes de confirmar el Draft.'
                  : `Tocá para sortear entre las ${availableThemes.length} temáticas disponibles.`}
            </span>
          </div>

          {/* Selector interactivo directo (RF-81) */}
          {!isLocked && availableThemes.length > 0 && (
            <div className="w-full rounded-sm border border-border/80 bg-secondary/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="manual-theme-select"
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  <ListFilter className="h-4 w-4 text-accent" />
                  Elegir temática a mano (saltar ruleta)
                </label>
                {currentTheme && (
                  <span className="text-[11px] font-semibold text-primary">
                    Seleccionada: {currentTheme}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  id="manual-theme-select"
                  value={manualThemeSelection}
                  disabled={spinning || isLocked}
                  onChange={(e) => setManualThemeSelection(e.target.value)}
                  className={`flex-1 text-sm bg-background font-sans ${inputClassName}`}
                >
                  <option value="" disabled>
                    -- Seleccioná una temática de la lista --
                  </option>
                  {availableThemes.map((theme) => (
                    <option
                      key={theme}
                      value={theme}
                      className="bg-background text-foreground"
                    >
                      {theme}
                    </option>
                  ))}
                </select>

                <SecondaryButton
                  type="button"
                  disabled={spinning || isLocked || !manualThemeSelection}
                  onClick={() => handleSelectManualTheme()}
                  className="px-5 py-2 text-xs font-semibold"
                >
                  <Check className="h-4 w-4 text-primary" /> Elegir temática
                </SecondaryButton>
              </div>
            </div>
          )}
        </div>

        {/* Sección de Temáticas Disponibles (RF-56, RF-57) */}
        <div className="border-t border-border pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Temáticas disponibles en la ruleta ({availableThemes.length})
            </label>
            <span className="text-[11px] text-muted-foreground">
              Hacé click en un chip para elegirlo directamente
            </span>
          </div>

          {/* Lista de chips / badges interactivos (RF-56, RF-81) */}
          <div className="flex flex-wrap gap-2">
            {availableThemes.map((theme) => {
              const isSelected = currentTheme === theme;
              const isCustom = !(THEMES as readonly string[]).includes(theme);

              return (
                <button
                  type="button"
                  key={theme}
                  disabled={spinning || isLocked}
                  onClick={() => handleSelectManualTheme(theme)}
                  className={`flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/20 text-primary shadow-[0_0_10px_rgba(74,222,128,0.2)] ring-1 ring-primary'
                      : 'border-border bg-background/60 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                  title={`Elegir directamente "${theme}"`}
                >
                  <Sparkles
                    className={`h-3 w-3 ${
                      isSelected ? 'text-primary' : 'text-accent'
                    }`}
                  />
                  <span>{theme}</span>
                  {isCustom && (
                    <span className="rounded bg-accent/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent font-mono">
                      Custom
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Formulario para agregar temática personalizada (RF-57) */}
          {!isLocked && (
            <form onSubmit={handleAddTheme} className="space-y-2 pt-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  maxLength={40}
                  placeholder="Sumar temática personalizada (ej. Champions 2005)..."
                  value={newTheme}
                  disabled={spinning}
                  onChange={(e) => {
                    setNewTheme(e.target.value);
                    if (themeError) setThemeError(null);
                  }}
                  className={`flex-1 text-sm ${inputClassName}`}
                />
                <SecondaryButton
                  type="submit"
                  disabled={spinning || newTheme.trim().length === 0}
                  className="px-4 py-2 text-xs"
                >
                  <Plus className="h-4 w-4" /> Agregar
                </SecondaryButton>
              </div>

              {themeError && (
                <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                  {themeError}
                </p>
              )}
            </form>
          )}
        </div>

        {/* Footer con estado y avance */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Temática actual:{' '}
            <span className="font-semibold text-primary">
              {currentTheme ?? 'Ninguna elegida'}
            </span>
          </p>

          <PrimaryButton
            disabled={!currentTheme || spinning}
            onClick={handleProceed}
          >
            Ir al Draft <ChevronRight className="h-4 w-4" />
          </PrimaryButton>
        </div>
      </Panel>
    </div>
  );
}

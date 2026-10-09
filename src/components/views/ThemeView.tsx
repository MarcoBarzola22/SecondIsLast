import { useState } from 'react';
import { ChevronRight, Disc3, Dices, RotateCcw } from 'lucide-react';
import { createDraftOrder } from '../../domain/draft';
import { THEMES, pickRandomTheme } from '../../domain/theme';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';
import { Panel } from '../ui/Panel';

interface ThemeViewProps {
  onProceedToDraft: () => void;
}

export function ThemeView({ onProceedToDraft }: ThemeViewProps) {
  const { activeTournament } = useAppState();
  const dispatch = useAppDispatch();

  const currentTheme = activeTournament?.theme ?? null;
  const [display, setDisplay] = useState<string>(
    currentTheme ?? '¿Qué temática te toca?'
  );
  const [spinning, setSpinning] = useState(false);

  const isLocked =
    activeTournament !== null &&
    (activeTournament.phase === 'draft' || activeTournament.phase === 'bracket');

  const spin = () => {
    if (spinning || isLocked) return;

    setSpinning(true);
    let n = 0;
    const totalTicks = 20 + Math.floor(Math.random() * 10);

    const tick = () => {
      n++;
      const nextTemp = THEMES[n % THEMES.length]!;
      setDisplay(nextTemp);

      if (n < totalTicks) {
        // Decelerating delay
        const delay = 40 + n * n * 0.6;
        setTimeout(tick, delay);
      } else {
        // Final pick using domain logic (RF-8)
        const selected = pickRandomTheme();
        setDisplay(selected);
        dispatch({ type: 'THEME_SET', theme: selected });
        setSpinning(false);
      }
    };

    tick();
  };

  const handleProceed = () => {
    if (!currentTheme || spinning || !activeTournament) return;

    // Generate randomized draft pick order with Fisher-Yates (RF-11)
    // If draftOrder already exists, preserve it; otherwise create it
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
            : 'Girá la ruleta para definir la temática'
        }
      >
        <div className="flex flex-col items-center gap-6 py-4">
          {/* Ruleta Display */}
          <div
            className={`relative w-full overflow-hidden rounded-sm border-2 bg-background py-10 text-center transition ${
              spinning
                ? 'border-accent glow-blue'
                : currentTheme
                  ? 'border-primary glow-green'
                  : 'border-border'
            }`}
          >
            <Disc3
              className={`absolute left-4 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground transition ${
                spinning ? 'animate-spin text-accent' : currentTheme ? 'text-primary' : ''
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
                ? 'Sorteando temáticas clásicas de PES 6...'
                : currentTheme
                  ? 'Podés volver a girar antes de confirmar el Draft.'
                  : 'Tocá para sortear entre las 5 temáticas disponibles.'}
            </span>
          </div>
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

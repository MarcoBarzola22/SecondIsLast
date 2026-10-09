import type {
  PlayerId,
  Series,
  SeriesId,
  Side,
} from './types';

/**
 * Validates that a goal count is an integer between 0 and 99 (RF-22).
 */
export function isValidGoal(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 99
  );
}

/**
 * Checks if a series has both participants defined and ready to play (RF-27).
 */
export function isSeriesReady(series: Series): boolean {
  return series.playerA !== null && series.playerB !== null;
}

export interface SeriesResult {
  isReady: boolean;
  isComplete: boolean;
  globalA: number;
  globalB: number;
  isTied: boolean;
  winner: PlayerId | null;
  loser: PlayerId | null;
  canConfirm: boolean;
}

/**
 * Computes the aggregate score and winner/loser for a two-legged series (RF-21, RF-23, RF-24, RF-25, RF-29).
 * Penalty shootouts are strictly tiebreakers and do not add to global score or GF/GC (RF-29).
 */
export function getSeriesResult(series: Series): SeriesResult {
  if (!isSeriesReady(series)) {
    return {
      isReady: false,
      isComplete: false,
      globalA: 0,
      globalB: 0,
      isTied: false,
      winner: null,
      loser: null,
      canConfirm: false,
    };
  }

  const { leg1, leg2, playerA, playerB, penaltyWinner } = series;

  // Running goals for partial displays (RF-24)
  const runningA = (leg1.a ?? 0) + (leg2.a ?? 0);
  const runningB = (leg1.b ?? 0) + (leg2.b ?? 0);

  const isComplete =
    leg1.a !== null &&
    leg1.b !== null &&
    leg2.a !== null &&
    leg2.b !== null;

  if (!isComplete) {
    return {
      isReady: true,
      isComplete: false,
      globalA: runningA,
      globalB: runningB,
      isTied: false,
      winner: null,
      loser: null,
      canConfirm: false,
    };
  }

  const globalA = leg1.a! + leg2.a!;
  const globalB = leg1.b! + leg2.b!;
  const isTied = globalA === globalB;

  let winner: PlayerId | null = null;
  let loser: PlayerId | null = null;

  if (globalA > globalB) {
    winner = playerA;
    loser = playerB;
  } else if (globalB > globalA) {
    winner = playerB;
    loser = playerA;
  } else {
    // Tied aggregate: requires penalty shootout winner (RF-25)
    if (penaltyWinner === playerA) {
      winner = playerA;
      loser = playerB;
    } else if (penaltyWinner === playerB) {
      winner = playerB;
      loser = playerA;
    }
  }

  const canConfirm = isComplete && winner !== null;

  return {
    isReady: true,
    isComplete,
    globalA,
    globalB,
    isTied,
    winner,
    loser,
    canConfirm,
  };
}

/**
 * Updates a leg score. Pure update returning a new series list.
 * If score change resolves a tie, penaltyWinner is automatically cleared.
 */
export function setLegScore(
  seriesList: readonly Series[],
  seriesId: SeriesId,
  leg: 'leg1' | 'leg2',
  side: Side,
  value: number | null
): Series[] {
  if (value !== null && !isValidGoal(value)) {
    throw new Error(
      `Goles inválidos: ${value}. Deben ser números enteros entre 0 y 99.`
    );
  }

  return seriesList.map((s) => {
    if (s.id !== seriesId) return s;

    const updatedLeg = { ...s[leg], [side]: value };
    const updatedSeries: Series = {
      ...s,
      [leg]: updatedLeg,
    };

    // Recalculate to verify if tie status changed
    const res = getSeriesResult(updatedSeries);
    if (!res.isTied && updatedSeries.penaltyWinner !== null) {
      updatedSeries.penaltyWinner = null;
    }

    return updatedSeries;
  });
}

/**
 * Sets or clears the penalty winner for a series.
 */
export function setPenaltyWinner(
  seriesList: readonly Series[],
  seriesId: SeriesId,
  winnerId: PlayerId | null
): Series[] {
  return seriesList.map((s) => {
    if (s.id !== seriesId) return s;

    if (
      winnerId !== null &&
      winnerId !== s.playerA &&
      winnerId !== s.playerB
    ) {
      throw new Error(
        'El ganador por penales debe ser uno de los dos participantes de la llave.'
      );
    }

    return { ...s, penaltyWinner: winnerId };
  });
}

/**
 * Checks whether any scores have been entered for a series.
 */
export function hasSeriesStarted(series: Series): boolean {
  return (
    series.leg1.a !== null ||
    series.leg1.b !== null ||
    series.leg2.a !== null ||
    series.leg2.b !== null ||
    series.confirmed
  );
}

/**
 * Determines whether a confirmed series can be reopened for editing (RF-28).
 * Allowed only if none of the downstream series (winnerTo or loserTo) have started.
 */
export function canEditSeries(
  seriesList: readonly Series[],
  seriesId: SeriesId
): boolean {
  const current = seriesList.find((s) => s.id === seriesId);
  if (!current || !current.confirmed) {
    return false;
  }

  const downstreamIds: SeriesId[] = [];
  if (current.winnerTo) downstreamIds.push(current.winnerTo.seriesId);
  if (current.loserTo) downstreamIds.push(current.loserTo.seriesId);

  for (const targetId of downstreamIds) {
    const target = seriesList.find((s) => s.id === targetId);
    if (target && hasSeriesStarted(target)) {
      return false;
    }
  }

  return true;
}

/**
 * Reopens a confirmed series for modification (RF-28).
 */
export function reopenSeries(
  seriesList: readonly Series[],
  seriesId: SeriesId
): Series[] {
  if (!canEditSeries(seriesList, seriesId)) {
    throw new Error(
      'No se puede editar esta llave porque la siguiente ronda ya tiene goles cargados.'
    );
  }

  return seriesList.map((s) =>
    s.id === seriesId ? { ...s, confirmed: false } : s
  );
}

/**
 * Confirms a series, locks it, and advances winner and loser to downstream matches (RF-26).
 */
export function confirmSeries(
  seriesList: readonly Series[],
  seriesId: SeriesId
): Series[] {
  const target = seriesList.find((s) => s.id === seriesId);
  if (!target) {
    throw new Error(`Llave no encontrada: ${seriesId}`);
  }

  const result = getSeriesResult(target);
  if (!result.canConfirm || result.winner === null) {
    throw new Error(
      'No se puede confirmar la llave: faltan goles o definir el ganador por penales.'
    );
  }

  const { winner, loser } = result;

  return seriesList.map((s) => {
    // 1. Mark confirmed
    if (s.id === seriesId) {
      return { ...s, confirmed: true };
    }

    let updated = s;

    // 2. Propagate winner
    if (target.winnerTo && s.id === target.winnerTo.seriesId) {
      updated = {
        ...updated,
        [target.winnerTo.side === 'a' ? 'playerA' : 'playerB']: winner,
      };
    }

    // 3. Propagate loser (e.g. SF -> Third Place)
    if (target.loserTo && s.id === target.loserTo.seriesId) {
      updated = {
        ...updated,
        [target.loserTo.side === 'a' ? 'playerA' : 'playerB']: loser,
      };
    }

    return updated;
  });
}

/**
 * Checks whether both the Final and Third Place series are confirmed (RF-30).
 */
export function isBracketComplete(seriesList: readonly Series[]): boolean {
  const finalSeries = seriesList.find((s) => s.id === 'F');
  const thirdPlaceSeries = seriesList.find((s) => s.id === 'TP');

  return (
    finalSeries !== undefined &&
    finalSeries.confirmed &&
    thirdPlaceSeries !== undefined &&
    thirdPlaceSeries.confirmed
  );
}

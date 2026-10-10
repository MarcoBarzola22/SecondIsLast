import type { LegScore, PlayerId, Round, Series, SeriesId, SlotTarget } from './types';
import { shuffle, type RngFn } from './random';

export interface BracketGenerationResult {
  series: Series[];
  byes: PlayerId[];
  shuffledOrder: PlayerId[];
}

function createEmptyLeg(): LegScore {
  return { a: null, b: null };
}

function createSeries(
  id: SeriesId,
  round: Round,
  playerA: PlayerId | null,
  playerB: PlayerId | null,
  winnerTo: SlotTarget | null,
  loserTo: SlotTarget | null
): Series {
  return {
    id,
    round,
    playerA,
    playerB,
    leg1: createEmptyLeg(),
    leg2: createEmptyLeg(),
    penaltyWinner: null,
    confirmed: false,
    winnerTo,
    loserTo,
    winner: null,
    loser: null,
  };
}

/**
 * Generates an asymmetric tournament bracket for 4 to 10 players (RF-17, RF-18, RF-19).
 *
 * Shuffles participants with Fisher-Yates and wires rounds:
 * - 4 players: 0 Byes, 0 QF, 2 SF (SF1: P0 vs P1, SF2: P2 vs P3), 1 Final, 1 Third Place.
 * - 5 players: 3 Byes (P2, P3, P4), 1 QF (QF1: P0 vs P1 -> SF1.a),
 *              SF1: QF1.win vs P2, SF2: P3 vs P4, 1 Final, 1 Third Place.
 * - 6 players: 2 Byes (P4, P5), 2 QF (QF1: P0 vs P1 -> SF1.a, QF2: P2 vs P3 -> SF2.a),
 *              SF1: QF1.win vs P4, SF2: QF2.win vs P5, 1 Final, 1 Third Place.
 * - 7 players: 1 Bye a Semis (P6 -> SF2.b), 3 QF (QF1: P0 vs P1 -> SF1.a, QF2: P2 vs P3 -> SF1.b, QF3: P4 vs P5 -> SF2.a),
 *              SF1: QF1.win vs QF2.win, SF2: QF3.win vs P6, 1 Final, 1 Third Place.
 * - 8 players: 0 Byes, 4 QF (QF1: P0 vs P1 -> SF1.a, QF2: P2 vs P3 -> SF1.b, QF3: P4 vs P5 -> SF2.a, QF4: P6 vs P7 -> SF2.b),
 *              SF1: QF1.win vs QF2.win, SF2: QF3.win vs QF4.win, 1 Final, 1 Third Place.
 * - 9 players: 7 Byes a Cuartos (P2..P8), 1 Octavos (R16_1: P0 vs P1 -> QF1.a),
 *              QF1: R16_1.win vs P2 -> SF1.a, QF2: P3 vs P4 -> SF1.b, QF3: P5 vs P6 -> SF2.a, QF4: P7 vs P8 -> SF2.b,
 *              SF1: QF1.win vs QF2.win, SF2: QF3.win vs QF4.win, 1 Final, 1 Third Place.
 * - 10 players: 6 Byes a Cuartos (P4..P9), 2 Octavos (R16_1: P0 vs P1 -> QF1.a, R16_2: P2 vs P3 -> QF3.a),
 *              QF1: R16_1.win vs P4 -> SF1.a, QF2: P5 vs P6 -> SF1.b, QF3: R16_2.win vs P7 -> SF2.a, QF4: P8 vs P9 -> SF2.b,
 *              SF1: QF1.win vs QF2.win, SF2: QF3.win vs QF4.win, 1 Final, 1 Third Place.
 *
 * @throws Error if participant count is not between 4 and 10.
 */
export function generateBracket(
  participantIds: readonly PlayerId[],
  rng: RngFn = Math.random
): BracketGenerationResult {
  const count = participantIds.length;
  if (count < 4 || count > 10) {
    throw new Error(
      `El número de participantes debe ser entre 4 y 10 inclusive. Recibido: ${count}.`
    );
  }

  // Ensure unique participants
  const unique = new Set(participantIds);
  if (unique.size !== count) {
    throw new Error('No se pueden generar llaves con participantes duplicados.');
  }

  const p = shuffle(participantIds, rng);

  // Common final rounds (RF-18)
  const finalSeries = createSeries('F', 'final', null, null, null, null);
  const thirdPlaceSeries = createSeries(
    'TP',
    'third_place',
    null,
    null,
    null,
    null
  );

  if (count === 4) {
    const sf1 = createSeries(
      'SF1',
      'semifinal',
      p[0]!,
      p[1]!,
      { seriesId: 'F', side: 'a' },
      { seriesId: 'TP', side: 'a' }
    );
    const sf2 = createSeries(
      'SF2',
      'semifinal',
      p[2]!,
      p[3]!,
      { seriesId: 'F', side: 'b' },
      { seriesId: 'TP', side: 'b' }
    );

    return {
      series: [sf1, sf2, finalSeries, thirdPlaceSeries],
      byes: [],
      shuffledOrder: p,
    };
  }

  if (count === 5) {
    const byes = [p[2]!, p[3]!, p[4]!];

    const qf1 = createSeries(
      'QF1',
      'quarterfinal',
      p[0]!,
      p[1]!,
      { seriesId: 'SF1', side: 'a' },
      null
    );

    const sf1 = createSeries(
      'SF1',
      'semifinal',
      null,
      p[2]!,
      { seriesId: 'F', side: 'a' },
      { seriesId: 'TP', side: 'a' }
    );

    const sf2 = createSeries(
      'SF2',
      'semifinal',
      p[3]!,
      p[4]!,
      { seriesId: 'F', side: 'b' },
      { seriesId: 'TP', side: 'b' }
    );

    return {
      series: [qf1, sf1, sf2, finalSeries, thirdPlaceSeries],
      byes,
      shuffledOrder: p,
    };
  }

  if (count === 6) {
    const byes = [p[4]!, p[5]!];

    const qf1 = createSeries(
      'QF1',
      'quarterfinal',
      p[0]!,
      p[1]!,
      { seriesId: 'SF1', side: 'a' },
      null
    );

    const qf2 = createSeries(
      'QF2',
      'quarterfinal',
      p[2]!,
      p[3]!,
      { seriesId: 'SF2', side: 'a' },
      null
    );

    const sf1 = createSeries(
      'SF1',
      'semifinal',
      null,
      p[4]!,
      { seriesId: 'F', side: 'a' },
      { seriesId: 'TP', side: 'a' }
    );

    const sf2 = createSeries(
      'SF2',
      'semifinal',
      null,
      p[5]!,
      { seriesId: 'F', side: 'b' },
      { seriesId: 'TP', side: 'b' }
    );

    return {
      series: [qf1, qf2, sf1, sf2, finalSeries, thirdPlaceSeries],
      byes,
      shuffledOrder: p,
    };
  }

  if (count === 7) {
    const byes = [p[6]!];

    const qf1 = createSeries(
      'QF1',
      'quarterfinal',
      p[0]!,
      p[1]!,
      { seriesId: 'SF1', side: 'a' },
      null
    );
    const qf2 = createSeries(
      'QF2',
      'quarterfinal',
      p[2]!,
      p[3]!,
      { seriesId: 'SF1', side: 'b' },
      null
    );
    const qf3 = createSeries(
      'QF3',
      'quarterfinal',
      p[4]!,
      p[5]!,
      { seriesId: 'SF2', side: 'a' },
      null
    );

    const sf1 = createSeries(
      'SF1',
      'semifinal',
      null,
      null,
      { seriesId: 'F', side: 'a' },
      { seriesId: 'TP', side: 'a' }
    );
    const sf2 = createSeries(
      'SF2',
      'semifinal',
      null,
      p[6]!,
      { seriesId: 'F', side: 'b' },
      { seriesId: 'TP', side: 'b' }
    );

    return {
      series: [qf1, qf2, qf3, sf1, sf2, finalSeries, thirdPlaceSeries],
      byes,
      shuffledOrder: p,
    };
  }

  if (count === 8) {
    const qf1 = createSeries(
      'QF1',
      'quarterfinal',
      p[0]!,
      p[1]!,
      { seriesId: 'SF1', side: 'a' },
      null
    );
    const qf2 = createSeries(
      'QF2',
      'quarterfinal',
      p[2]!,
      p[3]!,
      { seriesId: 'SF1', side: 'b' },
      null
    );
    const qf3 = createSeries(
      'QF3',
      'quarterfinal',
      p[4]!,
      p[5]!,
      { seriesId: 'SF2', side: 'a' },
      null
    );
    const qf4 = createSeries(
      'QF4',
      'quarterfinal',
      p[6]!,
      p[7]!,
      { seriesId: 'SF2', side: 'b' },
      null
    );

    const sf1 = createSeries(
      'SF1',
      'semifinal',
      null,
      null,
      { seriesId: 'F', side: 'a' },
      { seriesId: 'TP', side: 'a' }
    );
    const sf2 = createSeries(
      'SF2',
      'semifinal',
      null,
      null,
      { seriesId: 'F', side: 'b' },
      { seriesId: 'TP', side: 'b' }
    );

    return {
      series: [qf1, qf2, qf3, qf4, sf1, sf2, finalSeries, thirdPlaceSeries],
      byes: [],
      shuffledOrder: p,
    };
  }

  if (count === 9) {
    const byes = [p[2]!, p[3]!, p[4]!, p[5]!, p[6]!, p[7]!, p[8]!];

    const r16_1 = createSeries(
      'R16_1',
      'round_of_16',
      p[0]!,
      p[1]!,
      { seriesId: 'QF1', side: 'a' },
      null
    );

    const qf1 = createSeries(
      'QF1',
      'quarterfinal',
      null,
      p[2]!,
      { seriesId: 'SF1', side: 'a' },
      null
    );
    const qf2 = createSeries(
      'QF2',
      'quarterfinal',
      p[3]!,
      p[4]!,
      { seriesId: 'SF1', side: 'b' },
      null
    );
    const qf3 = createSeries(
      'QF3',
      'quarterfinal',
      p[5]!,
      p[6]!,
      { seriesId: 'SF2', side: 'a' },
      null
    );
    const qf4 = createSeries(
      'QF4',
      'quarterfinal',
      p[7]!,
      p[8]!,
      { seriesId: 'SF2', side: 'b' },
      null
    );

    const sf1 = createSeries(
      'SF1',
      'semifinal',
      null,
      null,
      { seriesId: 'F', side: 'a' },
      { seriesId: 'TP', side: 'a' }
    );
    const sf2 = createSeries(
      'SF2',
      'semifinal',
      null,
      null,
      { seriesId: 'F', side: 'b' },
      { seriesId: 'TP', side: 'b' }
    );

    return {
      series: [
        r16_1,
        qf1,
        qf2,
        qf3,
        qf4,
        sf1,
        sf2,
        finalSeries,
        thirdPlaceSeries,
      ],
      byes,
      shuffledOrder: p,
    };
  }

  // count === 10
  const byes = [p[4]!, p[5]!, p[6]!, p[7]!, p[8]!, p[9]!];

  const r16_1 = createSeries(
    'R16_1',
    'round_of_16',
    p[0]!,
    p[1]!,
    { seriesId: 'QF1', side: 'a' },
    null
  );
  const r16_2 = createSeries(
    'R16_2',
    'round_of_16',
    p[2]!,
    p[3]!,
    { seriesId: 'QF3', side: 'a' },
    null
  );

  const qf1 = createSeries(
    'QF1',
    'quarterfinal',
    null,
    p[4]!,
    { seriesId: 'SF1', side: 'a' },
    null
  );
  const qf2 = createSeries(
    'QF2',
    'quarterfinal',
    p[5]!,
    p[6]!,
    { seriesId: 'SF1', side: 'b' },
    null
  );
  const qf3 = createSeries(
    'QF3',
    'quarterfinal',
    null,
    p[7]!,
    { seriesId: 'SF2', side: 'a' },
    null
  );
  const qf4 = createSeries(
    'QF4',
    'quarterfinal',
    p[8]!,
    p[9]!,
    { seriesId: 'SF2', side: 'b' },
    null
  );

  const sf1 = createSeries(
    'SF1',
    'semifinal',
    null,
    null,
    { seriesId: 'F', side: 'a' },
    { seriesId: 'TP', side: 'a' }
  );
  const sf2 = createSeries(
    'SF2',
    'semifinal',
    null,
    null,
    { seriesId: 'F', side: 'b' },
    { seriesId: 'TP', side: 'b' }
  );

  return {
    series: [
      r16_1,
      r16_2,
      qf1,
      qf2,
      qf3,
      qf4,
      sf1,
      sf2,
      finalSeries,
      thirdPlaceSeries,
    ],
    byes,
    shuffledOrder: p,
  };
}

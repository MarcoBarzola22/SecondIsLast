import { generateBracket } from './bracket';
import { generateLeagueFixture } from './league';
import { generateDoubleEliminationBracket } from './doubleElimination';
import { generateGroupsFixture } from './groupStage';
import type { PlayerId } from './types';

export interface RawFixtureMatch {
  round: number;
  leg: number;
  seriesId: string;
  homeParticipantId: string;
  awayParticipantId: string | null;
  status: 'PENDING_SUBMISSION' | 'PENDING_CONFIRMATION' | 'CLOSED';
  isBye: boolean;
  version: number;
  closedAt: Date | null;
}

export interface GeneratedFixture {
  matches: RawFixtureMatch[];
  byesCount: number;
  totalMatches: number;
  format: string;
}

export interface FixtureOptions {
  format: 'BRACKET' | 'LEAGUE' | 'GROUP_STAGE' | 'LEAGUE_PLAYOFFS' | 'DOUBLE_ELIMINATION' | string;
  matchFormat?: 'SINGLE_MATCH' | 'TWO_LEGGED' | string;
  participants: Array<{ id: string; name?: string }>;
  rng?: () => number;
}

/**
 * Maps bracket round identifier string to an integer round index (1..4).
 */
function mapBracketRoundToNumber(round: string, hasR16: boolean, hasQF: boolean): number {
  switch (round.toLowerCase()) {
    case 'r16':
    case 'round_of_16':
    case 'octavos':
      return 1;
    case 'qf':
    case 'quarterfinal':
    case 'cuartos':
      return hasR16 ? 2 : 1;
    case 'sf':
    case 'semifinal':
    case 'semis':
      return hasR16 ? 3 : hasQF ? 2 : 1;
    case 'f':
    case 'final':
    case 'tp':
    case 'third_place':
    case 'tercer_puesto':
      return hasR16 ? 4 : hasQF ? 3 : 2;
    default:
      return 1;
  }
}

/**
 * Maps double elimination round identifier string to an integer round index.
 */
function mapDoubleEliminationRoundToNumber(round: string): number {
  const r = round.toLowerCase();
  if (r.includes('r16') || r.includes('round_of_16')) return 1;
  if (r.includes('quarterfinal') || r.includes('qf')) return 2;
  if (r.includes('semifinal') || r.includes('sf') || r.includes('lb_round_1')) return 3;
  if (r.includes('final') || r.includes('lb_round_2')) return 4;
  if (r.includes('grand_final')) return 5;
  return 1;
}

/**
 * Generates all relational Match objects for a tournament fixture using pure domain algorithms (RF-113, RNF-2).
 * Automatically marks Byes (isBye: true) as CLOSED with closedAt, auto-advancing participants.
 */
export function generateTournamentFixture(options: FixtureOptions): GeneratedFixture {
  const { format, matchFormat = 'SINGLE_MATCH', participants, rng = Math.random } = options;
  const count = participants.length;

  if (count < 4 || count > 10) {
    throw new Error(`Se requieren entre 4 y 10 participantes para generar el fixture (hay ${count}).`);
  }

  const participantIds: PlayerId[] = participants.map((p) => p.id);
  const normalizedFormat = format.toUpperCase();
  const isTwoLegged = matchFormat.toUpperCase() === 'TWO_LEGGED';

  const matches: RawFixtureMatch[] = [];
  let byesCount = 0;

  if (normalizedFormat === 'BRACKET') {
    const result = generateBracket(participantIds, rng);
    const hasR16 = count >= 9;
    const hasQF = count >= 5;
    byesCount = result.byes.length;

    // 1. Create auto-closed Bye matches in Round 1 for participants bypassing round 1 (RF-113)
    for (const byeId of result.byes) {
      matches.push({
        round: 1,
        leg: 1,
        seriesId: `BYE_${byeId}`,
        homeParticipantId: byeId,
        awayParticipantId: null,
        status: 'CLOSED',
        isBye: true,
        version: 1,
        closedAt: new Date(),
      });
    }

    // 2. Create tournament series matches
    for (const s of result.series) {
      const roundNum = mapBracketRoundToNumber(s.round, hasR16, hasQF);
      const isSeriesBye = Boolean(s.isBye);

      if (isSeriesBye) {
        matches.push({
          round: roundNum,
          leg: 1,
          seriesId: s.id,
          homeParticipantId: s.playerA || 'TBD',
          awayParticipantId: null,
          status: 'CLOSED',
          isBye: true,
          version: 1,
          closedAt: new Date(),
        });
      } else {
        // Leg 1
        matches.push({
          round: roundNum,
          leg: 1,
          seriesId: s.id,
          homeParticipantId: s.playerA || 'TBD',
          awayParticipantId: s.playerB || null,
          status: 'PENDING_SUBMISSION',
          isBye: false,
          version: 1,
          closedAt: null,
        });

        // Leg 2 (if two-legged, reversed home/away)
        if (isTwoLegged && s.round !== 'third_place') {
          matches.push({
            round: roundNum,
            leg: 2,
            seriesId: s.id,
            homeParticipantId: s.playerB || 'TBD',
            awayParticipantId: s.playerA || null,
            status: 'PENDING_SUBMISSION',
            isBye: false,
            version: 1,
            closedAt: null,
          });
        }
      }
    }
  } else if (normalizedFormat === 'DOUBLE_ELIMINATION') {
    const result = generateDoubleEliminationBracket(participantIds, rng);
    byesCount = result.byes.length;

    // 1. Auto-closed Byes in Round 1
    for (const byeId of result.byes) {
      matches.push({
        round: 1,
        leg: 1,
        seriesId: `BYE_${byeId}`,
        homeParticipantId: byeId,
        awayParticipantId: null,
        status: 'CLOSED',
        isBye: true,
        version: 1,
        closedAt: new Date(),
      });
    }

    // 2. Series matches
    for (const s of result.series) {
      const roundNum = mapDoubleEliminationRoundToNumber(s.round);
      const isSeriesBye = Boolean(s.isBye);

      matches.push({
        round: roundNum,
        leg: 1,
        seriesId: s.id,
        homeParticipantId: s.playerA || 'TBD',
        awayParticipantId: s.playerB || null,
        status: isSeriesBye ? 'CLOSED' : 'PENDING_SUBMISSION',
        isBye: isSeriesBye,
        version: 1,
        closedAt: isSeriesBye ? new Date() : null,
      });

      if (isTwoLegged && !isSeriesBye && s.round !== 'grand_final') {
        matches.push({
          round: roundNum,
          leg: 2,
          seriesId: s.id,
          homeParticipantId: s.playerB || 'TBD',
          awayParticipantId: s.playerA || null,
          status: 'PENDING_SUBMISSION',
          isBye: false,
          version: 1,
          closedAt: null,
        });
      }
    }
  } else if (normalizedFormat === 'LEAGUE' || normalizedFormat === 'LEAGUE_PLAYOFFS') {
    const leagueMatches = generateLeagueFixture(
      participantIds,
      isTwoLegged ? 'two_legged' : 'single_match',
      rng
    );

    for (const lm of leagueMatches) {
      matches.push({
        round: lm.round,
        leg: 1,
        seriesId: lm.id,
        homeParticipantId: lm.playerA,
        awayParticipantId: lm.playerB,
        status: 'PENDING_SUBMISSION',
        isBye: false,
        version: 1,
        closedAt: null,
      });
    }
  } else if (normalizedFormat === 'GROUP_STAGE') {
    const fixture = generateGroupsFixture(
      participantIds,
      isTwoLegged ? 'two_legged' : 'single_match',
      rng
    );

    for (const gm of fixture.matches) {
      matches.push({
        round: gm.round,
        leg: 1,
        seriesId: gm.id,
        homeParticipantId: gm.playerA,
        awayParticipantId: gm.playerB,
        status: 'PENDING_SUBMISSION',
        isBye: false,
        version: 1,
        closedAt: null,
      });
    }
  } else {
    // Default fallback to bracket
    return generateTournamentFixture({
      ...options,
      format: 'BRACKET',
    });
  }

  return {
    matches,
    byesCount,
    totalMatches: matches.length,
    format: normalizedFormat,
  };
}

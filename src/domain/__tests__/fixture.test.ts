import { describe, it, expect } from 'vitest';
import { generateTournamentFixture } from '../fixture.js';

describe('generateTournamentFixture pure domain logic (RF-113, RNF-2)', () => {
  const p4 = [
    { id: 'part-1', name: 'Lionel Messi' },
    { id: 'part-2', name: 'Angel Di Maria' },
    { id: 'part-3', name: 'Julian Alvarez' },
    { id: 'part-4', name: 'Emiliano Martinez' },
  ];

  const p5 = [
    ...p4,
    { id: 'part-5', name: 'Rodrigo De Paul' },
  ];

  const p6 = [
    ...p5,
    { id: 'part-6', name: 'Alexis Mac Allister' },
  ];

  describe('Bracket format (RF-17, RF-18, RF-113)', () => {
    it('generates 4 matches for 4 participants with 0 byes in single match', () => {
      const fixture = generateTournamentFixture({
        format: 'BRACKET',
        matchFormat: 'SINGLE_MATCH',
        participants: p4,
        rng: () => 0, // deterministic
      });

      expect(fixture.byesCount).toBe(0);
      expect(fixture.matches).toHaveLength(4); // SF1, SF2, F, TP
      // All initial matches in round 1 should be PENDING_SUBMISSION
      const round1 = fixture.matches.filter((m) => m.round === 1);
      expect(round1).toHaveLength(2);
      expect(round1[0]?.status).toBe('PENDING_SUBMISSION');
      expect(round1[0]?.isBye).toBe(false);
    });

    it('generates auto-closed Byes and auto-advances participants for 5 participants (RF-113)', () => {
      const fixture = generateTournamentFixture({
        format: 'BRACKET',
        matchFormat: 'SINGLE_MATCH',
        participants: p5,
        rng: () => 0,
      });

      expect(fixture.byesCount).toBe(3);

      // Verify that 3 closed Bye matches exist in Round 1
      const round1Byes = fixture.matches.filter((m) => m.round === 1 && m.isBye);
      expect(round1Byes).toHaveLength(3);
      for (const byeMatch of round1Byes) {
        expect(byeMatch.status).toBe('CLOSED');
        expect(byeMatch.isBye).toBe(true);
        expect(byeMatch.closedAt).toBeInstanceOf(Date);
        expect(byeMatch.awayParticipantId).toBeNull();
      }

      // Verify the active QF1 match in Round 1
      const qfMatches = fixture.matches.filter((m) => m.round === 1 && !m.isBye);
      expect(qfMatches).toHaveLength(1);
      expect(qfMatches[0]?.status).toBe('PENDING_SUBMISSION');

      // Verify that the 3 participants with Byes are auto-advanced into Round 2 (Semifinals)
      const round2Matches = fixture.matches.filter((m) => m.round === 2);
      expect(round2Matches).toHaveLength(2);
      const round2ParticipantIds = round2Matches.flatMap((m) => [m.homeParticipantId, m.awayParticipantId]).filter(Boolean);
      for (const byeMatch of round1Byes) {
        expect(round2ParticipantIds).toContain(byeMatch.homeParticipantId);
      }
    });

    it('generates 2 auto-closed Byes for 6 participants (RF-113)', () => {
      const fixture = generateTournamentFixture({
        format: 'BRACKET',
        matchFormat: 'SINGLE_MATCH',
        participants: p6,
        rng: () => 0,
      });

      expect(fixture.byesCount).toBe(2);
      const round1Byes = fixture.matches.filter((m) => m.round === 1 && m.isBye);
      expect(round1Byes).toHaveLength(2);
      for (const byeMatch of round1Byes) {
        expect(byeMatch.status).toBe('CLOSED');
      }
    });

    it('generates 2 legs per series when matchFormat is TWO_LEGGED', () => {
      const fixture = generateTournamentFixture({
        format: 'BRACKET',
        matchFormat: 'TWO_LEGGED',
        participants: p4,
        rng: () => 0,
      });

      // SF1 (leg 1 & 2), SF2 (leg 1 & 2), Final (leg 1 & 2), TP (single or 2)
      const round1 = fixture.matches.filter((m) => m.round === 1);
      expect(round1).toHaveLength(4); // 2 SF * 2 legs
      const sf1Leg1 = round1.find((m) => m.seriesId === 'SF1' && m.leg === 1);
      const sf1Leg2 = round1.find((m) => m.seriesId === 'SF1' && m.leg === 2);
      expect(sf1Leg1).toBeDefined();
      expect(sf1Leg2).toBeDefined();
      expect(sf1Leg1?.homeParticipantId).toBe(sf1Leg2?.awayParticipantId);
      expect(sf1Leg1?.awayParticipantId).toBe(sf1Leg2?.homeParticipantId);
    });
  });

  describe('League format (RF-49, RF-50)', () => {
    it('generates Round Robin Berger fixture for 4 players (3 rounds of 2 matches = 6 matches)', () => {
      const fixture = generateTournamentFixture({
        format: 'LEAGUE',
        matchFormat: 'SINGLE_MATCH',
        participants: p4,
        rng: () => 0,
      });

      expect(fixture.matches).toHaveLength(6);
      expect(fixture.byesCount).toBe(0);
      const rounds = new Set(fixture.matches.map((m) => m.round));
      expect(rounds.size).toBe(3);
    });
  });

  describe('Double Elimination format (RF-60)', () => {
    it('generates Double Elimination series and auto-closes Byes if present', () => {
      const fixture = generateTournamentFixture({
        format: 'DOUBLE_ELIMINATION',
        matchFormat: 'SINGLE_MATCH',
        participants: p5,
        rng: () => 0,
      });

      expect(fixture.matches.length).toBeGreaterThan(0);
      const byeMatches = fixture.matches.filter((m) => m.isBye);
      for (const m of byeMatches) {
        expect(m.status).toBe('CLOSED');
      }
    });
  });
});

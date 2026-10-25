import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THEME_TEAMS,
  sanitizeTeamList,
  validateTeamList,
  getAvailableTeamsForTheme,
  createDrawPlan,
} from '../teams.js';

function createSeqRng(seq: number[]) {
  let idx = 0;
  return () => seq[idx++ % seq.length]!;
}

describe('teams pure domain logic (RF-103, RF-104)', () => {
  it('provides default built-in rosters with at least 10 teams per base theme', () => {
    expect(DEFAULT_THEME_TEAMS['Apertura 2006'].length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_THEME_TEAMS['Clásicos PES 6'].length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_THEME_TEAMS['Europa Actual'].length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_THEME_TEAMS['Selecciones Mundial 06'].length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_THEME_TEAMS['Solo Sudamérica'].length).toBeGreaterThanOrEqual(10);
  });

  it('sanitizes and trims team names while filtering empty lines', () => {
    const raw = ['  Boca Juniors  ', '', '   ', 'River Plate   '];
    const sanitized = sanitizeTeamList(raw);
    expect(sanitized).toEqual(['Boca Juniors', 'River Plate']);
  });

  describe('validateTeamList', () => {
    it('returns valid when count >= participantCount and names are unique', () => {
      const teams = ['Boca', 'River', 'Racing', 'Independiente'];
      const res = validateTeamList(teams, 4);
      expect(res.isValid).toBe(true);
      expect(res.errorMessage).toBeNull();
      expect(res.sanitizedTeams).toEqual(teams);
    });

    it('returns error when fewer teams than participant count', () => {
      const teams = ['Boca', 'River', 'Racing'];
      const res = validateTeamList(teams, 4);
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toContain('Se necesitan al menos 4 equipos');
    });

    it('returns error when duplicate team names exist (case-insensitive)', () => {
      const teams = ['Boca Juniors', 'River Plate', 'boca JUNIORS', 'San Lorenzo'];
      const res = validateTeamList(teams, 4);
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toContain('está duplicado');
    });
  });

  describe('getAvailableTeamsForTheme', () => {
    it('returns default teams for built-in theme when no custom override exists', () => {
      const teams = getAvailableTeamsForTheme('Apertura 2006');
      expect(teams).toContain('Boca Juniors');
      expect(teams).toContain('River Plate');
    });

    it('returns custom theme teams when provided in overrides', () => {
      const custom = {
        'Copa Libertadores 90s': ['Vélez 94', 'River 96', 'São Paulo 93', 'Cruzeiro 97'],
      };
      const teams = getAvailableTeamsForTheme('Copa Libertadores 90s', custom);
      expect(teams).toEqual(['Vélez 94', 'River 96', 'São Paulo 93', 'Cruzeiro 97']);
    });

    it('prefers custom overrides even for built-in theme names', () => {
      const custom = {
        'Apertura 2006': ['Boca de Basile', 'Estudiantes del Cholo'],
      };
      const teams = getAvailableTeamsForTheme('Apertura 2006', custom);
      expect(teams).toEqual(['Boca de Basile', 'Estudiantes del Cholo']);
    });
  });

  describe('createDrawPlan (RF-104)', () => {
    const participants = [
      { id: 'p1', name: 'Lionel Messi' },
      { id: 'p2', name: 'Angel Di Maria' },
      { id: 'p3', name: 'Julian Alvarez' },
      { id: 'p4', name: 'Emiliano Martinez' },
    ];
    const teams = ['Boca Juniors', 'River Plate', 'Milan', 'Real Madrid'];

    it('generates a step-by-step draw plan matching participant count', () => {
      // Deterministic sequence
      const seqRng = createSeqRng([0.1, 0.2, 0.3, 0.4]);
      const plan = createDrawPlan(participants, teams, seqRng);

      expect(plan.steps).toHaveLength(4);
      expect(plan.steps[0]).toMatchObject({
        step: 1,
        totalSteps: 4,
        participantId: 'p1',
        participantName: 'Lionel Messi',
        isFinal: false,
      });
      expect(plan.steps[3]).toMatchObject({
        step: 4,
        totalSteps: 4,
        participantId: 'p4',
        participantName: 'Emiliano Martinez',
        isFinal: true,
      });

      // Verify all participants have a unique assigned team
      expect(Object.keys(plan.finalAssignments)).toHaveLength(4);
      const assigned = Object.values(plan.finalAssignments);
      const uniqueAssigned = new Set(assigned);
      expect(uniqueAssigned.size).toBe(4);
    });

    it('throws when available teams are insufficient', () => {
      expect(() => createDrawPlan(participants, ['Boca', 'River'])).toThrow(
        /Se necesitan al menos 4 equipos/i
      );
    });
  });
});

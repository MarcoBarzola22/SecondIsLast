import type { PlayerId } from './types';
import { shuffle, type RngFn } from './random';
import { normalizeTeamName } from './draft';

/**
 * Predefined default team rosters for PES 6 juntada themes (RF-7, RF-103).
 */
export const DEFAULT_THEME_TEAMS: Record<string, string[]> = {
  'Apertura 2006': [
    'Boca Juniors',
    'River Plate',
    'Estudiantes LP',
    'Vélez Sarsfield',
    'San Lorenzo',
    'Racing Club',
    'Independiente',
    'Lanús',
    'Gimnasia LP',
    'Newell’s Old Boys',
    'Rosario Central',
    'Banfield',
  ],
  'Clásicos PES 6': [
    'Inter de Milán',
    'AC Milan',
    'Juventus',
    'FC Barcelona',
    'Real Madrid',
    'Arsenal',
    'Chelsea',
    'Manchester United',
    'Liverpool',
    'Bayern Munich',
    'Valencia CF',
    'AS Roma',
  ],
  'Europa Actual': [
    'Real Madrid',
    'Manchester City',
    'Bayern Munich',
    'Paris Saint-Germain',
    'Arsenal',
    'Liverpool',
    'FC Barcelona',
    'Inter de Milán',
    'Atlético de Madrid',
    'Borussia Dortmund',
    'Bayer Leverkusen',
    'Juventus',
  ],
  'Selecciones Mundial 06': [
    'Argentina',
    'Brasil',
    'Italia',
    'Francia',
    'Alemania',
    'Inglaterra',
    'España',
    'Portugal',
    'Holanda',
    'Costa de Marfil',
    'República Checa',
    'Suecia',
  ],
  'Solo Sudamérica': [
    'Boca Juniors',
    'River Plate',
    'Flamengo',
    'Palmeiras',
    'Fluminense',
    'Santos',
    'São Paulo',
    'Peñarol',
    'Nacional',
    'Olimpia',
    'Liga de Quito',
    'Colo-Colo',
  ],
  'Champions (Europa)': [
    'Real Madrid',
    'Manchester City',
    'Bayern Munich',
    'Paris Saint-Germain',
    'Arsenal',
    'Liverpool',
    'FC Barcelona',
    'Inter de Milán',
    'Atlético de Madrid',
    'Borussia Dortmund',
    'Bayer Leverkusen',
    'Juventus',
  ],
  'Mundial / Selecciones': [
    'Argentina',
    'Brasil',
    'Italia',
    'Francia',
    'Alemania',
    'Inglaterra',
    'España',
    'Portugal',
    'Holanda',
    'Costa de Marfil',
    'República Checa',
    'Suecia',
  ],
  'Libertadores (Sudamérica)': [
    'Boca Juniors',
    'River Plate',
    'Flamengo',
    'Palmeiras',
    'Fluminense',
    'Santos',
    'São Paulo',
    'Peñarol',
    'Nacional',
    'Olimpia',
    'Liga de Quito',
    'Colo-Colo',
  ],
};

/**
 * Normalizes a string removing accents, whitespace, and case.
 */
export function normalizeThemeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Unifies valid theme options for theme voting (DEFAULT_THEME_TEAMS + custom + 'random').
 */
export function getThemeVotingOptions(customThemes: string[] = []): string[] {
  const defaultThemes = [
    'Apertura 2006',
    'Clásicos PES 6',
    'Champions (Europa)',
    'Mundial / Selecciones',
    'Libertadores (Sudamérica)',
    ...Object.keys(DEFAULT_THEME_TEAMS),
  ];
  return Array.from(new Set([...defaultThemes, ...customThemes, 'random']));
}

/**
 * Finds matching theme name (case-insensitive, accent-insensitive, trimmed).
 */
export function matchThemeName(choice: string, availableThemes: string[]): string | null {
  const clean = normalizeThemeString(choice);
  if (clean === 'random' || clean.includes('random') || clean.includes('azar')) {
    return 'random';
  }
  for (const theme of availableThemes) {
    const norm = normalizeThemeString(theme);
    if (norm === clean || norm.includes(clean) || clean.includes(norm)) {
      return theme;
    }
  }
  return null;
}


export interface TeamValidationResult {
  isValid: boolean;
  errorMessage: string | null;
  sanitizedTeams: string[];
}

/**
 * Sanitizes and removes empty entries from a team list.
 */
export function sanitizeTeamList(teams: readonly string[]): string[] {
  return teams
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter((t) => t.length > 0);
}

/**
 * Validates a list of preloaded teams for a tournament (RF-103):
 * - Must contain at least participantCount teams.
 * - Must not have duplicate names (case- and whitespace-insensitive).
 */
export function validateTeamList(
  teams: readonly string[],
  participantCount: number = 4
): TeamValidationResult {
  const sanitized = sanitizeTeamList(teams);

  if (sanitized.length < participantCount) {
    return {
      isValid: false,
      errorMessage: `Se necesitan al menos ${participantCount} equipos para los participantes presentes (hay ${sanitized.length}).`,
      sanitizedTeams: sanitized,
    };
  }

  const seen = new Set<string>();
  for (const team of sanitized) {
    const normalized = normalizeTeamName(team);
    if (seen.has(normalized)) {
      return {
        isValid: false,
        errorMessage: `El equipo "${team}" está duplicado en la lista.`,
        sanitizedTeams: sanitized,
      };
    }
    seen.add(normalized);
  }

  return {
    isValid: true,
    errorMessage: null,
    sanitizedTeams: sanitized,
  };
}

/**
 * Returns available teams for a given theme, falling back to default theme teams if available.
 */
export function getAvailableTeamsForTheme(
  theme: string,
  customThemeTeams: Record<string, string[]> = {}
): string[] {
  if (customThemeTeams[theme] && customThemeTeams[theme].length > 0) {
    return [...customThemeTeams[theme]];
  }

  if (DEFAULT_THEME_TEAMS[theme]) {
    return [...DEFAULT_THEME_TEAMS[theme]];
  }

  const norm = (theme || '').trim().toLowerCase();
  for (const [key, teams] of Object.entries(customThemeTeams)) {
    if (key.toLowerCase() === norm || key.toLowerCase().includes(norm) || norm.includes(key.toLowerCase())) {
      return [...teams];
    }
  }

  for (const [key, teams] of Object.entries(DEFAULT_THEME_TEAMS)) {
    if (key.toLowerCase() === norm || key.toLowerCase().includes(norm) || norm.includes(key.toLowerCase())) {
      return [...teams];
    }
  }

  return DEFAULT_THEME_TEAMS['Clásicos PES 6'] ?? [];
}

export interface DrawAnimationStep {
  step: number;
  totalSteps: number;
  participantId: PlayerId;
  participantName: string;
  assignedTeam: string;
  isFinal: boolean;
}

export interface DraftOrderEntry {
  order: number;
  participantId: PlayerId;
  playerId?: string;
  participantName: string;
}

export interface DrawPlan {
  steps: DrawAnimationStep[];
  finalAssignments: Record<PlayerId, string>;
  method?: 'DIRECT_DRAW' | 'DRAFT_ORDER';
  draftOrder?: DraftOrderEntry[];
}

/**
 * Generates deterministic draw plan and step sequence for synchronized draw animation (RF-104).
 */
export function createDrawPlan(
  participants: Array<{ id: PlayerId; name: string }>,
  availableTeams: readonly string[],
  rng: RngFn = Math.random
): DrawPlan {
  const participantIds = participants.map((p) => p.id);
  const validation = validateTeamList(availableTeams, participantIds.length);
  if (!validation.isValid) {
    throw new Error(validation.errorMessage!);
  }

  // Pick N teams and shuffle
  const selectedTeams = validation.sanitizedTeams.slice(0, participantIds.length);
  const shuffledTeams = shuffle(selectedTeams, rng);

  const finalAssignments: Record<PlayerId, string> = {};
  const steps: DrawAnimationStep[] = [];
  const totalSteps = participants.length;

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i]!;
    const team = shuffledTeams[i]!;
    finalAssignments[p.id] = team;

    steps.push({
      step: i + 1,
      totalSteps,
      participantId: p.id,
      participantName: p.name,
      assignedTeam: team,
      isFinal: i === participants.length - 1,
    });
  }

  return {
    steps,
    finalAssignments,
    method: 'DIRECT_DRAW',
  };
}

/**
 * Generates deterministic draft pick order plan (1st, 2nd, 3rd pick...) without assigning teams.
 */
export function createDraftOrderPlan(
  participants: Array<{ id: PlayerId; playerId?: string; name: string }>,
  rng: RngFn = Math.random
): DrawPlan {
  const shuffledParticipants = shuffle(participants, rng);
  const steps: DrawAnimationStep[] = [];
  const draftOrder: DraftOrderEntry[] = [];
  const totalSteps = shuffledParticipants.length;

  for (let i = 0; i < shuffledParticipants.length; i++) {
    const p = shuffledParticipants[i]!;
    const orderNum = i + 1;
    const label = `${orderNum}º en elegir`;

    draftOrder.push({
      order: orderNum,
      participantId: p.id,
      playerId: p.playerId,
      participantName: p.name,
    });

    steps.push({
      step: orderNum,
      totalSteps,
      participantId: p.id,
      participantName: p.name,
      assignedTeam: label,
      isFinal: i === shuffledParticipants.length - 1,
    });
  }

  return {
    steps,
    finalAssignments: {},
    method: 'DRAFT_ORDER',
    draftOrder,
  };
}

export type RngFn = () => number;

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 */
export function shuffle<T>(items: readonly T[], rng: RngFn = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

export type PlayerId = string;

/**
 * Normalizes a team name for duplicate detection (case- and whitespace-insensitive).
 */
export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

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
};

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

  return [];
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
  participants: Array<{ id: PlayerId; name: string }>,
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

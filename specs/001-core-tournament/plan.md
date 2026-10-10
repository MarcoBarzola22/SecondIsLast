# Plan 001 — Core Tournament (MVP)

> Implementa `specs/001-core-tournament/spec.md` (aprobada). Respeta `docs/constitution.md`.
> Aprobación explícita del usuario: se agrega **Vitest** solo para testear `src/domain/`.

## 1. Decisiones Técnicas

| # | Decisión | Motivo |
|---|---|---|
| D1 | **App nueva con Vite + React 19 + TS (`strict`) en la raíz del repo.** La maqueta (`pixel-perfect-screenshot-main/`) se usa solo como referencia para copiar JSX y estilos. | La maqueta usa TanStack Start (SSR, server functions, router), que viola el principio 1. Además, el SSR genera problemas de hidratación con `localStorage`. |
| D2 | **Dependencias finales:** `react`, `react-dom`, `lucide-react`, `tailwindcss` + `@tailwindcss/vite` (v4). Dev: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`. **Nada más.** | Principio 1. Lucide y Tailwind ya estaban en la maqueta. Vitest está aprobado. |
| D3 | **Estado global con Context + `useReducer`** (sin Zustand). | Zustand sería una dependencia nueva. Un reducer alcanza para un solo árbol de estado. |
| D4 | **Reducer delgado:** cada acción delega en funciones puras de `src/domain/`. Ni el reducer ni los componentes calculan reglas de negocio. | Principio 3. |
| D5 | **Autosave:** un `useEffect` en el Provider llama a `saveAppData(state)` cada vez que cambia el estado. Lectura única al montar (`loadAppData`). | RF-39, RF-40. Simple y suficiente para el tamaño de los datos. |
| D6 | **Una sola clave de storage** (`second-is-last:data`) con todo el `AppData`. | Escritura atómica: finalizar el torneo (RF-31/RF-33) actualiza estadísticas, historial y torneo activo de una sola vez. |
| D7 | **Sin router.** Navegación por `view` local en `App`. La vista inicial se deriva de `activeTournament.phase` (RF-40). | Principio 1. Una SPA de 5 vistas no necesita router. |
| D8 | **Azar inyectable:** toda función de dominio que sortea recibe `rng: () => number` (por defecto, `Math.random`). | Tests deterministas. |
| D9 | **IDs:** `crypto.randomUUID()` para jugadores y torneos, generados fuera de `domain/` (en el reducer) y pasados como argumento. | Mantiene el dominio puro. |
| D10 | **Estilos:** se copian los tokens y utilidades de la maqueta (`panel-metal`, `glow-*`, `text-glow`, colores oklch) a `src/index.css`. Fuentes Orbitron y Chakra Petch vía Google Fonts en `index.html`. Se descarta `tw-animate-css`. | Fidelidad visual sin dependencias extra. |
| D11 | **Temática:** se elimina la pestaña "manual" de la maqueta. Solo queda la ruleta (RF-7 a RF-9). | Fidelidad a la spec. |
| D12 | **Abandonar torneo:** confirmación con `window.confirm`. | Cero dependencias, suficiente para el MVP. |
| D13 | **Eliminar jugadores y resetear tabla:** `PLAYER_REMOVED` elimina al jugador de `players` y limpia sus `stats`. Bloqueado si participa en un torneo activo en curso. `STANDINGS_RESET` limpia `stats: {}` e `history: []` manteniendo `players` intactos. Confirmación estricta con `window.confirm`. | RF-46, RF-47. Principio 2, 4. |
| D14 | **Modalidad de Partido en Llaves:** `MatchFormat = 'two_legged' | 'single_match'`. Si es `'single_match'`, la UI solo renderiza `leg1`. En empate, se decide por penales. Estadísticas acumulan solo los goles de `leg1`. | RF-21, RF-49. Principio 3. |
| D15 | **Modalidad de Torneo (Liga Round Robin):** `TournamentType = 'bracket' | 'league'`. En modo Liga, `src/domain/league.ts` genera el fixture (algoritmo Berger) con fechas y partidos únicos. Los partidos admiten empate (PG 3 pts, PE 1 pt, PP 0 pts). La tabla interna del torneo ordena por PTS ↓, DG ↓, GF ↓, nombre. Al confirmar todos los partidos, el podio (1° a 4°) habilita `TOURNAMENT_FINISHED`. | RF-48, RF-50, RF-51, RF-53, RF-54, RF-55. |
| D16 | **Sorteo Automático de Equipos:** en `src/domain/draft.ts`, `assignTeamsAutomatically(participantIds, teamNames, rng)`. Valida N nombres no vacíos y no repetidos, los mezcla con Fisher-Yates y asigna aleatoriamente a los participantes. | RF-11, RF-52. Principio 3. |
| D17 | **Temáticas personalizadas:** en `AppData`, `customThemes: string[]`. En `src/domain/theme.ts`, `validateCustomTheme(name, existing)` y `getAllThemes(customThemes)`. Validación estricta contra vacíos y duplicados. En `ThemeView`, chips con las temáticas y formulario de carga rápida. | RF-56, RF-57, RF-58. Principio 2, 3. |
| D18 | **Liga Ida y Vuelta (Doble Round Robin):** `generateLeagueFixture` acepta `matchFormat: MatchFormat = 'single_match'`. Si es `'two_legged'`, genera la segunda rueda replicando las fechas invirtiendo localías (`home <-> away`) y asignando números de fecha consecutivos. En `RegistrationView`, el selector de formato de partido se mantiene siempre visible para ambos tipos de torneo. | RF-49, RF-50, RF-59. Principio 3. |
| D19 | **Ampliación a 10 participantes (Base 8 y Base 16):** Límite ampliado de 4 a 10 en Registro y Reducer. `generateBracket` en `src/domain/bracket.ts` soporta: 7 jugadores (3 QFs, 1 Bye a SF), 8 jugadores (4 QFs, 0 Byes), 9 jugadores (1 Play-in Octavos `R16_1`, 7 Byes a Cuartos), 10 jugadores (2 Play-ins Octavos `R16_1` y `R16_2`, 6 Byes a Cuartos). En `src/domain/league.ts`, el algoritmo Berger maneja participantes impares (7 y 9) con 1 libre por fecha. En `BracketView`, se añade la columna "Octavos" si existen series de esa ronda. | RF-6, RF-17, RF-50, RF-60. Principio 3. |

## 2. Estructura de Carpetas

```
/ (raíz del repo)
├─ index.html                 # Google Fonts + <div id="root">
├─ package.json  vite.config.ts  vitest.config.ts  tsconfig.json
├─ docs/  specs/              # SDD
├─ pixel-perfect-screenshot-main/   # referencia visual
└─ src/
   ├─ main.tsx                # ErrorBoundary + AppProvider + App
   ├─ App.tsx                 # shell: Header + switch de vistas
   ├─ index.css               # Tailwind v4 + tokens portados
   ├─ domain/                 # PURO: sin React, sin storage, sin side-effects
   │  ├─ types.ts
   │  ├─ random.ts            # shuffle (Fisher-Yates)
   │  ├─ players.ts           # normalizeName, isDuplicatePlayer, formatPlayerName, removePlayer
   │  ├─ theme.ts             # THEMES, pickRandomTheme
   │  ├─ draft.ts             # createDraftOrder, getCurrentDrafter, validateTeamName, assignTeamsAutomatically
   │  ├─ bracket.ts           # generateBracket
   │  ├─ series.ts            # getSeriesResult, setLegScore, confirmSeries, canEditSeries (Ida/Vuelta y Partido Único)
   │  ├─ league.ts            # generateLeagueFixture, computeLeagueTable, isLeagueComplete, getLeaguePodium
   │  ├─ standings.ts         # getPodium, computeTournamentStats, applyStats, buildStandings, resetStandings
   │  └─ __tests__/*.test.ts
   ├─ storage/
   │  ├─ schema.ts            # AppData, SCHEMA_VERSION, createEmptyAppData, isAppData
   │  └─ storage.ts           # loadAppData, saveAppData (localStorage)
   ├─ state/
   │  ├─ actions.ts           # unión de Action
   │  ├─ reducer.ts           # appReducer (delegando en domain)
   │  └─ AppContext.tsx       # AppProvider, useAppState, useAppDispatch, autosave
   └─ components/
      ├─ ui/                  # Panel, PrimaryButton, SecondaryButton, DangerButton, inputClassName
      ├─ layout/Header.tsx    # logo + StepNav + "Abandonar torneo"
      ├─ ErrorBoundary.tsx
      └─ views/
         ├─ RegistrationView.tsx   # Registro + selectores de modalidades + borrado de jugadores
         ├─ ThemeView.tsx          # Ruleta de temáticas
         ├─ DraftView.tsx          # Asignación Manual vs Sorteo Automático
         ├─ BracketView.tsx  SeriesCard.tsx  PodiumPanel.tsx # Llaves (Ida y Vuelta o Partido Único)
         ├─ LeagueView.tsx   LeagueMatchCard.tsx  LeagueTable.tsx # Liga Round Robin
         └─ StandingsView.tsx      # Tabla histórica + botón resetear con confirmación
```

## 3. Modelo de Datos (`src/domain/types.ts` + `src/storage/schema.ts`)

```ts
// ---------- domain/types.ts ----------
export type PlayerId = string;

export interface Player {
  id: PlayerId;
  firstName: string;
  lastName: string;
  createdAt: string; // ISO
}

/** Historical accumulated stats. DG is derived (gf - gc), never stored. */
export interface PlayerStats {
  playerId: PlayerId;
  pts: number; pj: number; pg: number; pp: number;
  gf: number; gc: number; tj: number;
}

export type TournamentType = 'bracket' | 'league';
export type MatchFormat = 'two_legged' | 'single_match';

export type SeriesId =
  | 'R16_1'
  | 'R16_2'
  | 'QF1'
  | 'QF2'
  | 'QF3'
  | 'QF4'
  | 'SF1'
  | 'SF2'
  | 'F'
  | 'TP'; // TP = 3er puesto
export type Round =
  | 'round_of_16'
  | 'quarterfinal'
  | 'semifinal'
  | 'final'
  | 'third_place';
export type Side = 'a' | 'b';

/** Goals per side in one leg. null = not entered yet. */
export interface LegScore { a: number | null; b: number | null; }

export interface SlotTarget { seriesId: SeriesId; side: Side; }

export interface Series {
  id: SeriesId;
  round: Round;
  playerA: PlayerId | null;   // null = "Por definir"
  playerB: PlayerId | null;
  leg1: LegScore;             // En single_match, solo se usa leg1
  leg2: LegScore;             // Vuelta (solo si two_legged)
  penaltyWinner: PlayerId | null; // desempate
  confirmed: boolean;
  winnerTo: SlotTarget | null;
  loserTo: SlotTarget | null;
}

export interface LeagueMatch {
  id: string;                 // ej. "R1_M1"
  round: number;              // fecha (1..N)
  playerA: PlayerId;
  playerB: PlayerId;
  scoreA: number | null;
  scoreB: number | null;
  confirmed: boolean;
}

export interface LeagueStandingRow {
  playerId: PlayerId;
  displayName: string;
  team: string;
  pts: number; pj: number; pg: number; pe: number; pp: number;
  gf: number; gc: number; dg: number;
}

export type TournamentPhase = 'theme' | 'draft' | 'bracket' | 'league';

export interface ActiveTournament {
  id: string;
  createdAt: string;            // ISO
  phase: TournamentPhase;
  tournamentType: TournamentType; // 'bracket' | 'league'
  matchFormat: MatchFormat;       // 'two_legged' | 'single_match'
  participantIds: PlayerId[];   // 4..10
  theme: string | null;
  draftOrder: PlayerId[];       // orden de selección o sorteo
  teams: Record<PlayerId, string>;
  byes: PlayerId[];             // para llaves
  series: Series[];             // para llaves
  leagueMatches: LeagueMatch[]; // para liga
}

export interface Podium {
  champion: PlayerId; runnerUp: PlayerId; third: PlayerId; fourth: PlayerId;
}

export interface TournamentSummary {
  id: string;
  finishedAt: string;
  tournamentType: TournamentType;
  matchFormat?: MatchFormat;
  theme: string;
  participants: { playerId: PlayerId; team: string }[];
  podium: Podium;
}

export interface StandingsRow extends PlayerStats {
  rank: number;
  displayName: string; // "Apellido, Nombre"
  dg: number;
}

// ---------- storage/schema.ts ----------
export const SCHEMA_VERSION = 1;
export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION;
  players: Player[];
  stats: Record<PlayerId, PlayerStats>;
  activeTournament: ActiveTournament | null;
  history: TournamentSummary[];
}
```

### Reglas de cableado del bracket y fixture de liga

- **Bracket (`generateBracket`):**
  - Mismo algoritmo actual para 4, 5 y 6 jugadores con Byes en Cuartos.
  - Si `matchFormat === 'single_match'`, cada serie evalúa solo `leg1`. Si empatan, `penaltyWinner` es obligatorio.
- **Liga (`generateLeagueFixture`):**
  - Algoritmo Berger / Round Robin para N participantes. Si N es impar (5), se usa un dummy "bye" para que en cada fecha descanse un participante.
  - 4 jugadores: 3 fechas de 2 partidos (6 partidos).
  - 5 jugadores: 5 fechas de 2 partidos + 1 libre (10 partidos).
  - 6 jugadores: 5 fechas de 3 partidos (15 partidos).

### Semántica de las funciones de `league.ts`

- `generateLeagueFixture(participantIds, rng)`: genera las fechas y los partidos con IDs únicos `R{fecha}_M{partido}`.
- `setLeagueMatchScore(matches, matchId, scoreA, scoreB)`: asigna goles.
- `confirmLeagueMatch(matches, matchId)`: marca confirmado si ambos goles son válidos (0-99).
- `reopenLeagueMatch(matches, matchId)`: desmarca confirmado para permitir corrección (RF-54).
- `computeLeagueTable(matches, participantIds, teams, players)`: calcula la tabla de posiciones interna con puntos (PG=3, PE=1, PP=0), partidos jugados, goles y diferencia de gol.
- `isLeagueComplete(matches)`: `true` cuando todos los partidos están confirmados.
- `getLeaguePodium(leagueStandings)`: toma los 4 primeros de la tabla para el podio (1° Campeón, 2° Subcampeón, 3° Tercer Puesto, 4° Cuarto Puesto).

## 4. Estado y Acciones (`src/state/`)

```ts
type Action =
  | { type: 'PLAYER_ADDED'; player: Player }                    // RF-1..4
  | { type: 'PLAYER_REMOVED'; playerId: PlayerId }              // RF-46
  | {
      type: 'PARTICIPANTS_SET';
      participantIds: PlayerId[];
      tournamentType: TournamentType;
      matchFormat: MatchFormat;
      tournamentId: string;
      now: string;
    }                                                           // RF-5, RF-6, RF-48, RF-49
  | { type: 'THEME_SET'; theme: string }                        // RF-8, RF-9
  | { type: 'DRAFT_STARTED'; order: PlayerId[] }                // RF-11 (phase -> 'draft')
  | { type: 'TEAM_ASSIGNED'; playerId: PlayerId; team: string } // RF-12..14
  | { type: 'TEAMS_BATCH_ASSIGNED'; teams: Record<PlayerId, string> } // RF-52 (Sorteo automático)
  | { type: 'BRACKET_GENERATED'; series: Series[]; byes: PlayerId[] } // RF-17..20 (phase -> 'bracket')
  | { type: 'LEG_SCORE_SET'; seriesId: SeriesId; leg: 'leg1'|'leg2'; side: Side; value: number|null }
  | { type: 'PENALTY_WINNER_SET'; seriesId: SeriesId; playerId: PlayerId|null }
  | { type: 'SERIES_CONFIRMED'; seriesId: SeriesId }
  | { type: 'SERIES_EDIT_REQUESTED'; seriesId: SeriesId }
  | { type: 'LEAGUE_GENERATED'; matches: LeagueMatch[] }        // RF-50 (phase -> 'league')
  | { type: 'LEAGUE_MATCH_SCORE_SET'; matchId: string; scoreA: number|null; scoreB: number|null }
  | { type: 'LEAGUE_MATCH_CONFIRMED'; matchId: string }
  | { type: 'LEAGUE_MATCH_EDIT_REQUESTED'; matchId: string }
  | { type: 'TOURNAMENT_FINISHED'; summaryId: string; now: string } // RF-31, RF-33, RF-55
  | { type: 'TOURNAMENT_ABANDONED' }                            // RF-44
  | { type: 'STANDINGS_RESET' };                                // RF-47
```

## 5. Persistencia y Robustez

- Compatibilidad hacia atrás: Si un estado cargado no tiene `tournamentType` o `matchFormat`, se asignan valores por defecto (`'bracket'` y `'two_legged'`, `leagueMatches: []`).
- Borrado seguro: `PLAYER_REMOVED` se rechaza si el jugador está en `activeTournament` en fase `draft`, `bracket` o `league`.
- Reseteo atómico: `STANDINGS_RESET` vacía `stats: {}` e `history: []` sin tocar los jugadores registrados ni el torneo activo.

## 6. Estrategia de Tests (solo `src/domain/`)

- **Runner:** Vitest, `environment: 'node'`. Script: `npm test`.
- **Casos de prueba para las nuevas funcionalidades:**
  - `league`:
    - Generación correcta de Round Robin para 4, 5 y 6 jugadores (número exacto de fechas y partidos, todos juegan contra todos sin repeticiones).
    - Cálculo de tabla de liga con victorias, empates y derrotas. Desempate por PTS → DG → GF.
    - Detección de liga completa y podio de los 4 primeros.
  - `series`:
    - Validación y cálculo de ganador en modalidad `single_match` (empate exige penales; resultado sin leg2).
    - Estadísticas de torneo en `single_match` suman solo los goles de `leg1`.
  - `draft`:
    - `assignTeamsAutomatically`: rechaza lista incompleta o nombres vacíos/duplicados. Con lista válida, asigna un equipo único a cada participante con Fisher-Yates.
  - `players`:
    - Borrado de jugador y limpieza de referencias.
  - `standings`:
    - Cierre de torneo en modo Liga calcula correctamente los puntos acumulados para la tabla histórica.
    - Reseteo de historial devuelve acumulados vacíos.

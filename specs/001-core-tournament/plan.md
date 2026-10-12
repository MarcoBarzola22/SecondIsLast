# Plan 001 — Core Tournament & Versión 2.0 Local

> Implementa `specs/001-core-tournament/spec.md`. Respeta rigurosamente `docs/constitution.md`.
> Arquitectura pura en `src/domain/`, persistencia versionada en `src/storage/`, UI reactiva con Tailwind y sin backend.

## 1. Decisiones Técnicas

| # | Decisión | Motivo |
|---|---|---|
| D1 | **Vite + React 19 + TS (`strict`) en la raíz del repo.** | Cumplimiento estricto del Principio 1. |
| D2 | **Dependencias mínimas:** `react`, `react-dom`, `lucide-react`, `tailwindcss` (v4). Dev: `typescript`, `vite`, `vitest`. | Principio 1. Cero librerías pesadas externas. |
| D3 | **Estado global con Context + `useReducer`** (sin Zustand/Redux). | Un solo árbol de estado predecible y serializable. |
| D4 | **Reducer delgado:** toda lógica de cálculo se delega en funciones puras de `src/domain/`. | Principio 3 de la Constitución. |
| D5 | **Autosave:** `useEffect` en `AppContext` sincroniza con `saveAppData` ante cada cambio de estado. | Persistencia automática e ininterrumpida. |
| D6 | **Almacenamiento atómico:** clave única `second-is-last:data` en `localStorage`. | Evita inconsistencias de estado parcial. |
| D7 | **Navegación por estado:** vista derivada de `activeTournament.phase` con accesos a Registro y Tabla. | Sin routers innecesarios. |
| D8 | **Azar inyectable:** funciones con sorteo reciben `rng: () => number` (`Math.random` por defecto). | Pruebas unitarias 100% deterministas. |
| D9 | **IDs universales:** `crypto.randomUUID()` generado en acciones/reducer. | Dominio desacoplado y puro. |
| D10 | **Tokens visuales:** tema oscuro deportivo con panel metalizado, neón y fuentes Orbitron / Chakra Petch. | Estética gamer retro de PES 6. |
| D11 | **Temáticas personalizadas:** `customThemes: string[]` en `AppData`. | Flexibilidad para el usuario. |
| D12 | **Abandono global:** `TOURNAMENT_ABANDONED` cancela el torneo activo preservando el historial. | Acción de escape para el organizador. |
| D13 | **Eliminar jugadores y resetear tabla:** eliminación segura de jugadores y reseteo atómico. | Mantenimiento del historial. |
| D14 | **Modalidad de Partido en Llaves:** `MatchFormat = 'two_legged' | 'single_match'`. | Adaptabilidad del tiempo de la juntada. |
| D15 | **Liga Round Robin:** algoritmo Berger con fechas, tabla interna y podio final. | Formato liga tradicional. |
| D16 | **Sorteo Automático de Equipos:** asignación rápida 1 a 1 de N equipos mediante Fisher-Yates. | Agilidad en el Draft. |
| D17 | **Temáticas dinámicas en ruleta:** integración de temas base y personalizados. | Variedad de juego. |
| D18 | **Liga a Ida y Vuelta:** dos ruedas completas con inversión de localía. | Competencia extendida. |
| D19 | **Ampliación a 10 participantes:** soporte de Play-in Octavos en Llaves y Berger para números impares con libre. | Escalabilidad de jugadores. |
| D20 | **Fair Play y Desempates (Tarjetas & H2H):** Tarjetas en partidos (`yellowCardsA`, `redCardsA`, etc.). Función pura `sortStandingsWithFairPlay` implementa el orden: 1) PTS, 2) DG, 3) H2H (mini-tabla de duelos directos), 4) PG, 5) Menos TR, 6) Menos TA, 7) Alfabético. | Criterio deportivo justo y transparente (RF-61..63). |
| D21 | **Walkover individual por Jugador (Abandono 3-0):** Acción `PLAYER_WALKOVER_DECLARED`. Función pura `applyWalkoverToTournament(tournament, playerId)` sobreescribe todos los partidos (jugados y por jugar) con resultado 0-3 en contra del desertor, avanza al rival en cruces de eliminación directa y recalcula la tabla en tiempo real. | Trato justo e igualitario para todos los rivales (RF-64..66). |
| D22 | **Fase de Grupos (6 y 9 participantes):** Módulo puro `src/domain/groupStage.ts`. 6 jugadores: 2 grupos de 3 (clasifican 1° y 2° a Semis). 9 jugadores: 3 grupos de 3 (clasifican 1° de cada grupo + mejor 2° por tabla comparativa). Configuración de grupos a Partido Único o Ida y Vuelta. Transición automática a playoffs. | Nueva modalidad de copa corta (RF-67). |
| D23 | **Liga + Reducido:** Módulo puro `src/domain/leaguePlayoffs.ts`. Fase regular Round Robin completa. Al finalizar, generación automática de cuadro de eliminación: top 4 a Semis (6 u 8 participantes), top 8 a Cuartos (10 participantes), top 2 a Final (4 participantes). | Emoción de liguilla final (RF-68). |
| D24 | **Doble Eliminación (Winner & Loser Bracket):** Módulo puro `src/domain/doubleElimination.ts`. Cuadro con WB y LB para 4 a 10 participantes con Byes asimétricos. Grand Final con opción de Bracket Reset obligatorio si el campeón de LB gana la primera serie. | Formato esports de alta competencia (RF-69). |
| D25 | **Calculadora de Escenarios (Smart UI):** Módulo puro `src/domain/scenarios.ts`. Calcula clasificados matemáticos (`isMathematicallyQualified`) comparando puntos máximos alcanzables de los rivales fuera de zona, y genera mensajes explicativos de escenarios en tarjetas de partidos en las últimas 2 o 3 fechas. | Claridad estratégica para los participantes (RF-73..75). |
| D26 | **Historial Avanzado, Premios y Ranking Anual Ponderado:** Módulo puro `src/domain/awardsAndRankings.ts`. Registro H2H acumulado entre cada par de jugadores, distinciones honoríficas (Bota de Oro, Premio de Madera, Valla Invicta) y Ranking Anual con puntaje escalado según tamaño del torneo ($10 \times N/4$, etc.). | Incentivo competitivo a largo plazo (RF-76..79). |
| D27 | **Migración transparente de Storage a Schema v2:** `SCHEMA_VERSION = 2`. El adaptador `loadAppData` migra estados v1 asegurando campos por defecto (`fairPlay`, `headToHead: {}`, `annualRankings: {}`, `walkovers: []`) sin romper datos guardados. | Principio 6 de la Constitución (RF-80). |
| D28 | **Selección Manual de Temática Directa:** Selector o dropdown interactivo en `ThemeView` para elegir cualquier temática disponible (predeterminada o personalizada) y fijarla con `THEME_SET` sin obligar a girar la ruleta. | Agilidad operativa si el grupo ya decidió qué jugar (RF-81). |
| D29 | **Animación de Revelado Secuencial en Draft Automático:** En `DraftView`, el sorteo automático de equipos ejecuta una animación paso a paso (revelado progresivo con suspenso / efecto ruleta individual) antes de fijar las asignaciones completas. | Emoción y dramatismo en el sorteo (RF-82). |
| D30 | **Detección de Eliminación Matemática ("Sin chances") y Leyenda de Corte:** Función pura `calculateMathematicalElimination` en `src/domain/scenarios.ts` para marcar con badge rojo/gris a los participantes sin posibilidad matemática de alcanzar el cupo clasificatorio. Banner explicativo contextual sobre la tabla indicando cuántos avanzan a playoffs o final. | Claridad competitiva total para los participantes (RF-83). |
| D31 | **Banner Informativo de Puntos del Torneo Activo:** Función pura `getTournamentPointsDistribution(participantCount)` en `src/domain/awardsAndRankings.ts` y componente informativo en `Header` o cabecera que exhibe el desglose de puntos a repartir para el Ranking Anual según $N$. | Visibilidad y motivación competitiva en vivo (RF-84). |

## 2. Estructura de Carpetas

```
/ (raíz del repo)
├─ index.html
├─ package.json  vite.config.ts  vitest.config.ts  tsconfig.json
├─ docs/  specs/
└─ src/
   ├─ main.tsx
   ├─ App.tsx
   ├─ index.css
   ├─ domain/                         # PURO: reglas de negocio sin React
   │  ├─ types.ts                    # Modelo completo de tipos v2.0
   │  ├─ random.ts                   # shuffle (Fisher-Yates)
   │  ├─ players.ts                  # normalizeName, removePlayer
   │  ├─ theme.ts                    # base + personalizadas
   │  ├─ draft.ts                    # draft manual y automático
   │  ├─ bracket.ts                  # llaves clásicas simples
   │  ├─ series.ts                   # series con soporte Fair Play (tarjetas)
   │  ├─ league.ts                   # fixture Berger y tabla con Fair Play
   │  ├─ groupStage.ts               # grupos (6 y 9 jugadores) y clasificación
   │  ├─ leaguePlayoffs.ts           # liga regular + reducido
   │  ├─ doubleElimination.ts        # bracket WB, LB y Grand Final con reset
   │  ├─ walkover.ts                 # aplicación de W.O. 0-3 y recálculo
   │  ├─ scenarios.ts                # zonas de clasificación y calculadora de cruces
   │  ├─ awardsAndRankings.ts        # H2H, distinciones y ranking anual ponderado
   │  ├─ standings.ts                # tabla histórica y podios
   │  └─ __tests__/*.test.ts         # Vitest suites por cada módulo
   ├─ storage/
   │  ├─ schema.ts                   # Schema v2 + migración de v1
   │  └─ storage.ts                  # lectura/escritura con try/catch seguro
   ├─ state/
   │  ├─ actions.ts                  # acciones v2.0
   │  ├─ reducer.ts                  # appReducer delgado
   │  └─ AppContext.tsx              # provider, hooks y autosave
   └─ components/
      ├─ ui/                         # primitivas visuales (botones, badges, tarjetas)
      ├─ layout/Header.tsx           # StepNav + abandono
      ├─ ErrorBoundary.tsx
      └─ views/
         ├─ RegistrationView.tsx     # selectores de las 5 modalidades
         ├─ ThemeView.tsx            # ruleta + badges de temas
         ├─ DraftView.tsx            # manual o automático
         ├─ BracketView.tsx          # llaves con tarjetas y walkover
         ├─ LeagueView.tsx           # liga con Smart UI, tarjetas y walkover
         ├─ GroupStageView.tsx       # vista de fase de grupos y playoffs
         ├─ DoubleEliminationView.tsx# vista WB, LB y Grand Final
         └─ StandingsView.tsx        # pestañas: General, Anual, H2H y Premios
```

## 3. Modelo de Datos (`src/domain/types.ts` & `src/storage/schema.ts`)

```ts
export type PlayerId = string;

export interface Player {
  id: PlayerId;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export type TournamentType =
  | 'bracket'            // Llaves clásicas
  | 'league'             // Liga Round Robin
  | 'group_stage'        // Fase de Grupos (6 o 9 participantes)
  | 'league_playoffs'    // Liga regular + Playoffs
  | 'double_elimination';// Doble Eliminación

export type MatchFormat = 'two_legged' | 'single_match';

export type TournamentPhase =
  | 'theme'
  | 'draft'
  | 'bracket'
  | 'league'
  | 'group_stage'
  | 'group_playoffs'
  | 'league_playoffs'
  | 'double_elimination';

export interface CardCounts {
  yellow: number;
  red: number;
}

export interface LegScore {
  a: number | null;
  b: number | null;
  cardsA?: CardCounts;
  cardsB?: CardCounts;
}

export interface Series {
  id: string;
  round: string;
  playerA: PlayerId | null;
  playerB: PlayerId | null;
  leg1: LegScore;
  leg2: LegScore;
  penaltyWinner: PlayerId | null;
  confirmed: boolean;
  winnerTo: { seriesId: string; side: 'a' | 'b' } | null;
  loserTo: { seriesId: string; side: 'a' | 'b' } | null;
  isWalkover?: boolean;
}

export interface LeagueMatch {
  id: string;
  round: number;
  playerA: PlayerId;
  playerB: PlayerId;
  scoreA: number | null;
  scoreB: number | null;
  cardsA?: CardCounts;
  cardsB?: CardCounts;
  confirmed: boolean;
  isWalkover?: boolean;
}

export interface GroupData {
  id: 'A' | 'B' | 'C';
  participantIds: PlayerId[];
  matches: LeagueMatch[];
}

export interface DoubleEliminationBracket {
  winnerSeries: Series[];
  loserSeries: Series[];
  grandFinal: Series;
  grandFinalReset?: Series; // Opcional, solo si el campeón de LB gana la primera final
}

export interface ActiveTournament {
  id: string;
  createdAt: string;
  phase: TournamentPhase;
  tournamentType: TournamentType;
  matchFormat: MatchFormat;
  participantIds: PlayerId[];
  theme: string | null;
  draftOrder: PlayerId[];
  teams: Record<PlayerId, string>;
  byes: PlayerId[];
  walkoverPlayerIds: PlayerId[];
  // Contenedores según modalidad
  series?: Series[];
  leagueMatches?: LeagueMatch[];
  groups?: GroupData[];
  playoffSeries?: Series[];
  doubleElimination?: DoubleEliminationBracket;
}

export interface HeadToHeadRecord {
  playerA: PlayerId;
  playerB: PlayerId;
  played: number;
  winsA: number;
  draws: number;
  winsB: number;
  goalsA: number;
  goalsB: number;
}

export interface AnnualRankingEntry {
  playerId: PlayerId;
  pts: number;
  tournamentsPlayed: number;
  championships: number;
  runnerUps: number;
}

export interface AwardsLeaderboard {
  goldenBoot: { playerId: PlayerId; goals: number };
  woodenSpoon: { playerId: PlayerId; losses: number };
  cleanSheet: { playerId: PlayerId; cleanSheets: number };
}

export const SCHEMA_VERSION = 2;

export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION;
  players: Player[];
  stats: Record<PlayerId, PlayerStats>;
  activeTournament: ActiveTournament | null;
  history: TournamentSummary[];
  customThemes?: string[];
  headToHead?: Record<string, HeadToHeadRecord>; // key: "idA_idB" alfabético
  annualRankings?: Record<string, Record<PlayerId, AnnualRankingEntry>>; // key: "YYYY"
}
```

## 4. Estado y Acciones (`src/state/actions.ts`)

```ts
export type Action =
  | { type: 'PLAYER_ADDED'; player: Player }
  | { type: 'PLAYER_REMOVED'; playerId: PlayerId }
  | {
      type: 'PARTICIPANTS_SET';
      participantIds: PlayerId[];
      tournamentType: TournamentType;
      matchFormat: MatchFormat;
      tournamentId: string;
      now: string;
    }
  | { type: 'THEME_SET'; theme: string }
  | { type: 'CUSTOM_THEME_ADDED'; theme: string }
  | { type: 'DRAFT_STARTED'; order: PlayerId[] }
  | { type: 'TEAM_ASSIGNED'; playerId: PlayerId; team: string }
  | { type: 'TEAMS_BATCH_ASSIGNED'; teams: Record<PlayerId, string> }
  // Bracket & Series
  | { type: 'BRACKET_GENERATED'; series: Series[]; byes: PlayerId[] }
  | {
      type: 'LEG_SCORE_SET';
      seriesId: string;
      leg: 'leg1' | 'leg2';
      side: 'a' | 'b';
      value: number | null;
      cards?: CardCounts;
    }
  | { type: 'PENALTY_WINNER_SET'; seriesId: string; playerId: PlayerId | null }
  | { type: 'SERIES_CONFIRMED'; seriesId: string }
  | { type: 'SERIES_EDIT_REQUESTED'; seriesId: string }
  // Liga
  | { type: 'LEAGUE_GENERATED'; matches: LeagueMatch[] }
  | {
      type: 'LEAGUE_MATCH_SCORE_SET';
      matchId: string;
      scoreA: number | null;
      scoreB: number | null;
      cardsA?: CardCounts;
      cardsB?: CardCounts;
    }
  | { type: 'LEAGUE_MATCH_CONFIRMED'; matchId: string }
  | { type: 'LEAGUE_MATCH_EDIT_REQUESTED'; matchId: string }
  // Nuevas modalidades v2.0
  | { type: 'GROUP_STAGE_GENERATED'; groups: GroupData[] }
  | {
      type: 'GROUP_MATCH_SCORE_SET';
      groupId: 'A' | 'B' | 'C';
      matchId: string;
      scoreA: number | null;
      scoreB: number | null;
      cardsA?: CardCounts;
      cardsB?: CardCounts;
    }
  | { type: 'GROUP_MATCH_CONFIRMED'; groupId: 'A' | 'B' | 'C'; matchId: string }
  | { type: 'GROUP_PLAYOFFS_STARTED'; playoffSeries: Series[] }
  | { type: 'LEAGUE_PLAYOFFS_STARTED'; playoffSeries: Series[] }
  | { type: 'DOUBLE_ELIMINATION_GENERATED'; bracket: DoubleEliminationBracket }
  | { type: 'DOUBLE_ELIMINATION_MATCH_CONFIRMED'; bracketType: 'winner'|'loser'|'grandFinal'|'grandFinalReset'; seriesId: string }
  | { type: 'DOUBLE_ELIMINATION_RESET_TRIGGERED' }
  // Walkover individual
  | { type: 'PLAYER_WALKOVER_DECLARED'; playerId: PlayerId }
  // Cierre y gestión
  | { type: 'TOURNAMENT_FINISHED'; summaryId: string; now: string }
  | { type: 'TOURNAMENT_ABANDONED' }
  | { type: 'STANDINGS_RESET' };
```

## 5. Estrategia de Migración y Compatibilidad hacia Atrás

1. **Lectura Segura (`storage.ts`):**
   Al cargar `loadAppData()`, si el archivo tiene `schemaVersion: 1` o ausente:
   - Se migra a `schemaVersion: 2`.
   - Se inicializan campos faltantes: `customThemes: []`, `headToHead: {}`, `annualRankings: {}`.
   - Si existe un `activeTournament` en curso, se le asigna `walkoverPlayerIds: []` y tarjetas por defecto `{ yellow: 0, red: 0 }` en partidos no calificados.
2. **Robustez ante Abandono Individual (W.O.):**
   - El desertor mantiene registro de que jugó el torneo pero todos sus partidos pasan a 0-3.
   - Si el rival ya había ganado 5-0, se normaliza o prevalece la regla de Walkover según la spec (derrota por 3-0 en contra).
   - El desempate de tabla se recalcula instantáneamente sin corromper el árbol de cruces.

## 6. Estrategia de Tests (Vitest)

- **`fairPlay.test.ts` & `standings.test.ts`:**
  - Desempate jerárquico estricto: igualdad de puntos y DG resuelta por H2H; si empatan en H2H, por PG; si empatan en PG, por menos TR; luego menos TA; fallback alfabético.
- **`walkover.test.ts`:**
  - Declarar walkover en Liga: todos los partidos del jugador se fijan en 0-3 (goles a favor 0, en contra 3), los partidos jugados y no jugados quedan confirmados, recálculo de tabla inmediato.
  - Declarar walkover en Llaves y Doble Eliminación: pase automático del contrincante.
- **`groupStage.test.ts`:**
  - 6 participantes: 2 grupos de 3 con fixture Round Robin (1 o 2 ruedas). Clasificación de 1° y 2° de cada grupo y cruce de Semis (1°A vs 2°B, 1°B vs 2°A).
  - 9 participantes: 3 grupos de 3. Clasificación de tres 1° y del mejor 2° comparativo por criterios Fair Play.
- **`leaguePlayoffs.test.ts`:**
  - Detección de fin de fase regular y corte correcto según N: 4 jugadores (avanzan 2 a final), 6 u 8 (avanzan 4 a semis), 10 (avanzan 8 a cuartos).
- **`doubleElimination.test.ts`:**
  - Bracket de ganadores y perdedores para 4 a 10 participantes con Byes.
  - Flujo de perdedores cayendo a Loser Bracket.
  - Grand Final: victoria de WB corona campeón; victoria de LB dispara Grand Final Reset.
- **`scenarios.test.ts`:**
  - Verificación matemática de clasificados matemáticos asegurados antes de la última fecha.
  - Generación de mensajes descriptivos para cruces clave.
- **`awardsAndRankings.test.ts`:**
  - Acumulación de estadísticas cara a cara (H2H).
  - Cálculo de Bota de Oro, Madera y Valla Invicta.
  - Cálculo de puntos anuales ponderados multiplicados por factor de escala $N/4$.
  - Distribución de puntos del torneo para el Ranking Anual según $N$ (`getTournamentPointsDistribution`).
- **`scenarios.test.ts` (Fase Q):**
  - Verificación matemática de participantes sin chances / eliminados (`calculateMathematicalElimination`).
  - Verificación de borde con empates matemáticos y sin partidos pendientes.
- **Hotfixes Fase R:**
  - **`awardsAndRankings.test.ts`:** Verificación de enteros estrictos (`Math.round`) en `getTournamentPointsDistribution` y `computeAnnualRanking` para todos los $N \in [4, 10]$. Verificación de acumulación de TR, TA y podios en estadísticas y ranking anual.
  - **`scenarios.test.ts`:** Verificación de que `getMatchScenarioGuidance` retorna estrictamente "Eliminado matemáticamente" o "Sin chances" para jugadores sin posibilidades matemáticas.
  - **`bracket.test.ts` & `doubleElimination.test.ts`:** Verificación de generación de cruces con orden manual de participantes y asignación explícita de Byes sin duplicados.

## 7. Decisiones de Diseño — Fase R (Hotfixes)

- **D32 (Puntos estrictamente enteros):** Para evitar inconsistencias visuales o decimales extraños en torneos con cantidades de jugadores donde $N/4$ tiene decimales (ej. $N=5, 6, 7, 9, 10$), `getTournamentPointsDistribution` y `computeAnnualRanking` aplicarán `Math.round(...)` a cada puesto de la distribución ($10 \times N/4$, $7 \times N/4$, etc.).
- **D33 (Mensaje estricto para eliminados en escenarios):** En `scenarios.ts`, antes de calcular posibilidades de empate o victoria, se verifica si el jugador ya está eliminado matemáticamente. Si es así, se asigna el mensaje exacto `"Eliminado matemáticamente"` o `"Sin chances"` en lugar de sugerencias de suma de puntos inalcanzables.
- **D34 (Tracking de Fair Play y Podios en historial):** Se extienden `PlayerStats` y `AnnualRankingEntry` con campos opcionales `yellowCards`, `redCards` y `podiums`. En `TOURNAMENT_FINISHED`, se consolidan las tarjetas de todos los partidos jugados y se incrementa el contador de podios para los jugadores que finalizaron 1º (Campeón), 2º (Subcampeón) y 3º (Tercer puesto). En `StandingsView`, se agregan columnas para visualizar estas métricas en ambas tablas.
- **D35 (Selector de Clasificados y Sorteo de Formato en Registro):** En `RegistrationView`, para "Liga + Reducido", se añade un selector de cupos a playoffs (2, 4 u 8 clasificados, respetando $N$), guardado en el estado del torneo activo. Junto a la botonera de formatos, se añade un botón "Sortear Formato" con efecto aleatorio que selecciona una modalidad compatible con el número de jugadores elegidos.
- **D36 (Armado manual de cruces y Byes):** En `BracketView` y `DoubleEliminationView`, mientras no se haya disputado ningún partido (`series.every(s => !s.confirmed && s.leg1.a === null)`), se disponibiliza un panel de configuración manual de cruces. El administrador puede seleccionar mediante dropdowns qué jugadores se enfrentan en cada cruce de primera ronda y quiénes obtienen Byes. La acción (`BRACKET_MATCHUPS_MANUALLY_SET` / `DOUBLE_ELIMINATION_MATCHUPS_MANUALLY_SET`) regenera la estructura respetando el orden manual sin romper el árbol de eliminatorias.


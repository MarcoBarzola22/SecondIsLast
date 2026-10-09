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

## 2. Estructura de Carpetas

```
/ (raíz del repo)
├─ index.html                 # Google Fonts + <div id="root">
├─ package.json  vite.config.ts  vitest.config.ts  tsconfig.json
├─ docs/  specs/              # SDD
├─ pixel-perfect-screenshot-main/   # referencia visual (excluida de tsconfig/vitest)
└─ src/
   ├─ main.tsx                # monta <ErrorBoundary><AppProvider><App/></AppProvider></ErrorBoundary>
   ├─ App.tsx                 # shell: Header + switch de vistas
   ├─ index.css               # Tailwind v4 + tokens portados de la maqueta
   ├─ domain/                 # PURO: sin React, sin storage, sin Date.now/Math.random implícitos
   │  ├─ types.ts
   │  ├─ random.ts            # shuffle (Fisher-Yates)
   │  ├─ players.ts           # normalizeName, isDuplicatePlayer, formatPlayerName
   │  ├─ theme.ts             # THEMES, pickRandomTheme
   │  ├─ draft.ts             # createDraftOrder, getCurrentDrafter, validateTeamName
   │  ├─ bracket.ts           # generateBracket
   │  ├─ series.ts            # getSeriesResult, setLegScore, confirmSeries, canEditSeries
   │  ├─ standings.ts         # getPodium, computeTournamentStats, applyStats, buildStandings
   │  └─ __tests__/*.test.ts
   ├─ storage/
   │  ├─ schema.ts            # AppData, SCHEMA_VERSION, createEmptyAppData, isAppData (guard)
   │  └─ storage.ts           # loadAppData, saveAppData (únicos que tocan localStorage)
   ├─ state/
   │  ├─ actions.ts           # union de Action
   │  ├─ reducer.ts           # appReducer (delegando en domain)
   │  └─ AppContext.tsx       # AppProvider, useAppState, useAppDispatch, autosave
   └─ components/
      ├─ ui/                  # Panel, PrimaryButton, SecondaryButton, inputClassName
      ├─ layout/Header.tsx    # logo + StepNav + "Abandonar torneo"
      ├─ ErrorBoundary.tsx
      └─ views/
         ├─ RegistrationView.tsx
         ├─ ThemeView.tsx
         ├─ DraftView.tsx
         ├─ BracketView.tsx  SeriesCard.tsx  PodiumPanel.tsx
         └─ StandingsView.tsx
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

export type SeriesId = 'QF1' | 'QF2' | 'SF1' | 'SF2' | 'F' | 'TP'; // TP = 3er puesto
export type Round = 'quarterfinal' | 'semifinal' | 'final' | 'third_place';
export type Side = 'a' | 'b';

/** Goals per side in one leg. null = not entered yet. */
export interface LegScore { a: number | null; b: number | null; }

export interface SlotTarget { seriesId: SeriesId; side: Side; }

export interface Series {
  id: SeriesId;
  round: Round;
  playerA: PlayerId | null;   // null = "Por definir"
  playerB: PlayerId | null;
  leg1: LegScore;             // Ida: A es local
  leg2: LegScore;             // Vuelta: B es local
  penaltyWinner: PlayerId | null; // solo si el global queda empatado
  confirmed: boolean;
  winnerTo: SlotTarget | null;    // a dónde avanza el ganador
  loserTo: SlotTarget | null;     // solo Semis -> TP
}

export type TournamentPhase = 'theme' | 'draft' | 'bracket';

export interface ActiveTournament {
  id: string;
  createdAt: string;            // ISO
  phase: TournamentPhase;
  participantIds: PlayerId[];   // 4..6
  theme: string | null;
  draftOrder: PlayerId[];       // vacío hasta entrar al Draft
  teams: Record<PlayerId, string>;
  byes: PlayerId[];             // 0 (4p), 3 (5p), 2 (6p)
  series: Series[];             // vacío hasta sortear llaves
}

export interface Podium {
  champion: PlayerId; runnerUp: PlayerId; third: PlayerId; fourth: PlayerId;
}

export interface TournamentSummary {
  id: string;
  finishedAt: string;
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

**JSON de ejemplo guardado en `localStorage["second-is-last:data"]`:**

```json
{
  "schemaVersion": 1,
  "players": [{ "id": "u1", "firstName": "Marco", "lastName": "Barzola", "createdAt": "2026-10-09T21:00:00.000Z" }],
  "stats": { "u1": { "playerId": "u1", "pts": 10, "pj": 3, "pg": 3, "pp": 0, "gf": 9, "gc": 4, "tj": 1 } },
  "activeTournament": {
    "id": "t2", "createdAt": "2026-10-09T23:00:00.000Z", "phase": "bracket",
    "participantIds": ["u1","u2","u3","u4","u5"], "theme": "Apertura 2006",
    "draftOrder": ["u3","u1","u5","u2","u4"],
    "teams": { "u1": "Boca", "u2": "River", "u3": "Vélez", "u4": "Racing", "u5": "Lanús" },
    "byes": ["u3","u4","u5"],
    "series": [
      { "id": "QF1", "round": "quarterfinal", "playerA": "u1", "playerB": "u2",
        "leg1": { "a": 2, "b": 1 }, "leg2": { "a": 0, "b": 1 }, "penaltyWinner": "u1",
        "confirmed": true, "winnerTo": { "seriesId": "SF1", "side": "a" }, "loserTo": null }
    ]
  },
  "history": []
}
```

### Reglas de cableado del bracket (`generateBracket`)

Siendo `P = shuffle(participants, rng)`:

| n | Cuartos | Byes | Semis | Final / TP |
|---|---|---|---|---|
| 4 | — | — | SF1 = P1 vs P2 · SF2 = P3 vs P4 | F = gan. SF1 (a) vs gan. SF2 (b) · TP = perd. SF1 (a) vs perd. SF2 (b) |
| 5 | QF1 = P1 vs P2 → SF1.a | P3, P4, P5 | SF1 = gan. QF1 vs P3 · SF2 = P4 vs P5 | ídem |
| 6 | QF1 = P1 vs P2 → SF1.a · QF2 = P3 vs P4 → SF2.a | P5, P6 | SF1 = gan. QF1 vs P5 · SF2 = gan. QF2 vs P6 | ídem |

### Semántica de las funciones de `series.ts`

- `getSeriesResult(s)` → `{ isComplete, globalA, globalB, isTied, winner: PlayerId|null, loser: PlayerId|null }`. Global A = `leg1.a + leg2.a` y Global B = `leg1.b + leg2.b`. Solo cuando el global está empatado se usa `penaltyWinner`.
- `isValidGoal(v)` → entero entre 0 y 99 (RF-22).
- `setLegScore(series[], id, leg, side, value)` → devuelve un array nuevo. Si el empate desaparece, limpia `penaltyWinner`.
- `confirmSeries(series[], id)` → exige `isComplete` y un ganador definido. Marca `confirmed` y escribe ganador y perdedor en `winnerTo`/`loserTo`, **reemplazando** si ya había alguien (para correcciones, RF-28).
- `canEditSeries(series[], id)` → `confirmed` y ninguna serie destino tiene goles cargados (RF-28). Editar pone `confirmed=false`.
- `isBracketComplete(series[])` → F y TP confirmadas (RF-30).

### Semántica de las funciones de `standings.ts`

- `getPodium(series[])` → Campeón = ganador de F, Subcampeón = perdedor de F, 3ro = ganador de TP, 4to = perdedor de TP.
- `computeTournamentStats(tournament)` → `Record<PlayerId, PlayerStats>` con los deltas del torneo: PTS (10/7/5/3 y +1 al perdedor de QF), PJ/PG/PP por llave (incluye TP), GF/GC por ambos partidos, TJ = 1.
- `applyStats(base, delta)` → suma campo a campo y crea entradas si no existen.
- `buildStandings(players, stats)` → filtra TJ ≥ 1, calcula DG y `displayName`, ordena por PTS ↓, DG ↓, GF ↓ y Apellido ↑ (`localeCompare('es')`), y asigna Rank.

## 4. Estado y Acciones (`src/state/`)

```ts
type Action =
  | { type: 'PLAYER_ADDED'; player: Player }                    // RF-1..4
  | { type: 'PARTICIPANTS_SET'; participantIds: PlayerId[]; tournamentId: string; now: string } // crea/actualiza torneo en phase 'theme'
  | { type: 'THEME_SET'; theme: string }                        // RF-8, RF-9
  | { type: 'DRAFT_STARTED'; order: PlayerId[] }                // RF-11 (phase -> 'draft')
  | { type: 'TEAM_ASSIGNED'; playerId: PlayerId; team: string } // RF-13..15
  | { type: 'BRACKET_GENERATED'; series: Series[]; byes: PlayerId[] } // RF-17..20 (phase -> 'bracket')
  | { type: 'LEG_SCORE_SET'; seriesId: SeriesId; leg: 'leg1'|'leg2'; side: Side; value: number|null }
  | { type: 'PENALTY_WINNER_SET'; seriesId: SeriesId; playerId: PlayerId }
  | { type: 'SERIES_CONFIRMED'; seriesId: SeriesId }
  | { type: 'SERIES_EDIT_REQUESTED'; seriesId: SeriesId }
  | { type: 'TOURNAMENT_FINISHED'; summaryId: string; now: string } // RF-31, RF-33
  | { type: 'TOURNAMENT_ABANDONED' };                           // RF-44
```

- El azar (`shuffle`, `pickRandomTheme`) se ejecuta en el handler del componente o en un helper de `state/` **antes** del dispatch. Así el reducer sigue siendo determinista.
- Guardas en el reducer: se ignoran (con `console.warn`) las acciones que no corresponden a la fase. Por ejemplo, `PARTICIPANTS_SET` se ignora si la fase es distinta de `'theme'` (RF-45) y `BRACKET_GENERATED` se ignora si ya hay series (RF-20).

## 5. Persistencia y Robustez

- `loadAppData()` hace `try { JSON.parse } catch`. Si no pasa `isAppData` o tiene un `schemaVersion !== 1`, devuelve `createEmptyAppData()` y hace `console.error` (RF-41).
- `saveAppData(data)` hace `try { setItem } catch` y deja `console.error`. El estado en memoria sigue intacto (RF-42).
- `ErrorBoundary` (componente de clase) muestra un panel "Algo se rompió" con el botón "Reintentar", que resetea el boundary (RF-43). Los datos persistidos no se tocan.

## 6. Estrategia de Tests (solo `src/domain/`)

- **Runner:** Vitest, `environment: 'node'`, `include: ['src/domain/**/*.test.ts']`. Script: `npm test` (`vitest run`).
- **Determinismo:** helper `seqRng([...])` o un PRNG con semilla (mulberry32) definido en `__tests__/helpers.ts`.
- **Casos mínimos:**
  - `random`: `shuffle` no muta el array original, conserva los elementos y es determinista con la misma semilla.
  - `players`: duplicados que difieren en acentos, mayúsculas o espacios; `formatPlayerName`.
  - `draft`: el orden es una permutación válida, el turno avanza y se rechazan equipos duplicados o vacíos.
  - `bracket`: para n = 4, 5 y 6, cantidad de series, byes, cableado `winnerTo`/`loserTo` y que no haya participantes repetidos. Error con n = 3 o n = 7.
  - `series`: global, empate que exige penales, validación 0–99, propagación a Semis/F/TP, corrección que reemplaza el slot y `canEditSeries`.
  - `standings`: torneo completo de 5 jugadores calculado a mano (PTS, PJ, PG, PP, GF, GC, TJ), suma acumulada de dos torneos y orden de desempate PTS → DG → GF → Apellido.
- La UI se verifica a mano con la checklist de la sección 5 de la spec.

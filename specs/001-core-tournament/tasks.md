# Tasks 001 — Core Tournament (MVP)

> Ejecutar de a UNA tarea por vez, en orden. Al terminar cada una: marcar `[x]`, indicar los RF cubiertos y frenar.
> Referencias: `spec.md` (RF) · `plan.md` (D = decisión técnica).

## Fase A — Base

- [x] **T1 · Scaffold del proyecto** — Vite + React 19 + TS `strict` en la raíz. Tailwind v4 (`@tailwindcss/vite`), `lucide-react`, `vitest`. Scripts `dev`, `build`, `test`. Excluir `pixel-perfect-screenshot-main/` de tsconfig y vitest. Portar los tokens de `styles.css` a `src/index.css` y las fuentes a `index.html`. Placeholder "Second is Last" renderizando con el estilo de la maqueta.
  - Cubre: Principio 1 · D1, D2, D10. *(sin RF)*

## Fase B — Lógica pura (`src/domain/` + Vitest)

- [x] **T2 · Tipos y azar** — `types.ts` completo según el plan §3. `random.ts` con `shuffle(arr, rng)` (Fisher-Yates, sin mutar) y helpers de test (`seqRng`/mulberry32).
  - Cubre: RF-11, RF-17 (base del sorteo).
- [x] **T3 · Jugadores** — `players.ts`: `normalizeName`, `validatePlayerInput`, `isDuplicatePlayer`, `formatPlayerName`. Con tests.
  - Cubre: RF-1, RF-2, RF-3, RF-35.
- [x] **T4 · Temática y Draft** — `theme.ts` (`THEMES`, `pickRandomTheme`) y `draft.ts` (`createDraftOrder`, `getCurrentDrafter`, `validateTeamName`, `isDraftComplete`). Con tests.
  - Cubre: RF-7, RF-8, RF-11, RF-13, RF-14, RF-15, RF-16.
- [x] **T5 · Generación del bracket** — `bracket.ts`: `generateBracket(participantIds, rng)` → `{ series, byes }`, con el cableado de la tabla del plan §3. Tests para n = 4, 5, 6 y error para n fuera de rango.
  - Cubre: RF-17, RF-18, RF-19.
- [x] **T6 · Llaves y resultados** — `series.ts`: `isValidGoal`, `getSeriesResult`, `setLegScore`, `setPenaltyWinner`, `confirmSeries` (propaga ganador y perdedor), `canEditSeries`, `reopenSeries`, `isBracketComplete`. Con tests.
  - Cubre: RF-21, RF-22, RF-23, RF-24, RF-25, RF-26, RF-27, RF-28, RF-29.
- [x] **T7 · Podio y tabla** — `standings.ts`: `getPodium`, `computeTournamentStats`, `applyStats`, `buildStandings`. Tests con un torneo de 5 jugadores calculado a mano y con acumulación de 2 torneos.
  - Cubre: RF-30, RF-31, RF-32, RF-34, RF-35, RF-36, RF-37.

## Fase C — Persistencia y estado

- [x] **T8 · Adaptador de storage** — `storage/schema.ts` (`AppData`, `SCHEMA_VERSION`, `createEmptyAppData`, `isAppData`) y `storage/storage.ts` (`loadAppData`, `saveAppData`) con `try/catch` y fallback.
  - Cubre: RF-4, RF-39, RF-41, RF-42 · Principio 6.
- [x] **T9 · Estado global** — `state/actions.ts`, `state/reducer.ts` (delegando en domain, con guardas de fase) y `state/AppContext.tsx` (Provider con `useReducer`, carga inicial y autosave).
  - Cubre: RF-20, RF-39, RF-40, RF-44, RF-45 · D3, D4, D5.

## Fase D — UI vista por vista (basada en la maqueta)

- [x] **T10 · Shell de la app** — `main.tsx`, `ErrorBoundary`, `App.tsx` (vista inicial derivada de la fase), `Header` con StepNav (pasos habilitados según la fase, Tabla siempre habilitada) y el botón "Abandonar torneo" con confirmación. Primitivas `ui/` (Panel, botones, input).
  - Cubre: RF-38, RF-40, RF-43, RF-44.
- [x] **T11 · Vista Registro** — formulario Nombre + Apellido con validaciones, lista de jugadores registrados con checkbox de participante, contador y mensaje de faltan/sobran. "Continuar" crea o actualiza el torneo (`PARTICIPANTS_SET`) y va a Temática. Bloqueo de cambios si la fase es Draft o Llaves.
  - Cubre: RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-45.
- [x] **T12 · Vista Temática** — ruleta animada de la maqueta (sin la pestaña manual). El resultado final sale de `pickRandomTheme` y se puede volver a girar. "Ir al Draft" queda deshabilitado sin temática y dispara `DRAFT_STARTED` con el orden sorteado.
  - Cubre: RF-7, RF-8, RF-9, RF-10, RF-11.
- [x] **T13 · Vista Draft** — orden de elección con el turno resaltado, input solo para quien tiene el turno, validación de equipo único y botón "Sortear llaves" al completar.
  - Cubre: RF-12, RF-13, RF-14, RF-15, RF-16, RF-17.
- [x] **T14 · Vista Llaves** — `BracketView` por rondas (Cuartos solo si existen, Semis, Final y 3er Puesto). `SeriesCard` con inputs de Ida (A local) y Vuelta (B local), validación 0–99, Global en vivo, selector de penales si hay empate, "Confirmar llave", "Corregir" cuando corresponde, "Por definir" y badge "Pase directo".
  - Cubre: RF-19, RF-21, RF-22, RF-23, RF-24, RF-25, RF-26, RF-27, RF-28, RF-29.
- [x] **T15 · Podio y cierre** — `PodiumPanel` visible al completar F y TP, con el botón "Finalizar torneo" (`TOURNAMENT_FINISHED`: aplica las estadísticas, guarda el resumen, borra el torneo activo y navega a Tabla).
  - Cubre: RF-30, RF-31, RF-33.
- [x] **T16 · Vista Tabla** — tabla con las columnas exactas Rank, JUGADORES, PTS, PJ, PG, PP, GF, GC, DG, TJ, desde `buildStandings`. Estado vacío ("Todavía no se jugó ningún torneo"). Estilos de la maqueta (1° resaltado).
  - Cubre: RF-34, RF-35, RF-36, RF-37, RF-38.

## Fase E — Cierre

- [x] **T17 · Verificación final (DoD)** — `npm test` y `npm run build` en verde. Recorrido manual con 4, 5 y 6 jugadores, recarga a mitad de torneo, `localStorage` corrupto a mano y revisión de textos en rioplatense. Actualizar el "Inicio Rápido" del README.
  - Cubre: Criterios de Finalización (spec §5) · RF-40, RF-41.

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

## Fase F — Ampliación de Funcionalidades

- [x] **T18 · Dominio y Tests: Borrado de jugadores y reseteo de tabla** — Funciones puras en `players.ts` (`removePlayer`) y `standings.ts` (`resetStandings`, `removePlayerStats`). Tests unitarios para eliminar jugador y limpiar estadísticas históricas acumuladas.
  - Cubre: RF-46, RF-47.
- [x] **T19 · Dominio y Tests: Modalidad de Partido Único en Llaves** — Soporte de `MatchFormat` en `types.ts` y actualización de `series.ts` (`getSeriesResult`, `computeTournamentStats`) para calcular ganador, penales y estadísticas cuando `matchFormat === 'single_match'`. Tests unitarios con partidos únicos y empates con penales.
  - Cubre: RF-21, RF-49.
- [x] **T20 · Dominio y Tests: Modalidad Liga (Round Robin, tabla interna y podio)** — Nuevo módulo puro `src/domain/league.ts` (`generateLeagueFixture`, `setLeagueMatchScore`, `confirmLeagueMatch`, `reopenLeagueMatch`, `computeLeagueTable`, `isLeagueComplete`, `getLeaguePodium`). Tests unitarios para 4, 5 y 6 participantes, cálculo de puntos (PG 3, PE 1, PP 0), orden de tabla y podio.
  - Cubre: RF-50, RF-51, RF-53, RF-54, RF-55.
- [x] **T21 · Dominio y Tests: Sorteo Automático de Equipos** — Función pura `assignTeamsAutomatically(participantIds, teamNames, rng)` en `draft.ts`. Validación de N nombres no vacíos y sin duplicados, shuffle con Fisher-Yates y asignación 1 a 1. Tests unitarios deterministas y casos de error.
  - Cubre: RF-11, RF-52.
- [x] **T22 · Estado y Reducer: Soporte transversal de las 5 funcionalidades** — Nuevas acciones en `actions.ts` (`PLAYER_REMOVED`, `STANDINGS_RESET`, `TEAMS_BATCH_ASSIGNED`, `LEAGUE_GENERATED`, etc.) y lógica en `reducer.ts` con guardas de fase, compatibilidad hacia atrás en storage/reducer y finalización de torneos de liga.
  - Cubre: RF-46, RF-47, RF-48, RF-49, RF-50, RF-52, RF-55 · Principio 3, 6 · D13, D14, D15, D16.
- [x] **T23 · UI: Eliminación de Jugadores y Reset de Historial** — Botón de borrado en `RegistrationView` por jugador con protección si es participante activo; botón "Resetear historial" en `StandingsView` con confirmación estricta (`window.confirm`).
  - Cubre: RF-46, RF-47.
- [x] **T24 · UI: Selectores de Modalidades en Registro** — Selector de Modalidad de Torneo ("Llaves" vs "Liga") y selector condicional de Modalidad de Partido ("Ida y Vuelta" vs "Partido Único", visible solo si el torneo es Llaves) en `RegistrationView`. Persistencia de la selección al iniciar torneo.
  - Cubre: RF-48, RF-49.
- [x] **T25 · UI: Sorteo Automático de Equipos en Draft** — Selector en `DraftView` ("Asignación Manual" vs "Sorteo Automático"). Formulario de N inputs para carga rápida de equipos con validación en vivo y botón "Sortear y asignar equipos".
  - Cubre: RF-11, RF-52.
- [x] **T26 · UI: Adaptación de Llaves a Partido Único** — Modificación de `SeriesCard` y `BracketView` para renderizar únicamente la fila de partido cuando `matchFormat === 'single_match'` (ocultando vuelta y mostrando directamente el resultado con selector de penales en caso de empate).
  - Cubre: RF-21, RF-49.
- [x] **T27 · UI: Vista de Liga (LeagueView)** — Componente `LeagueView` (junto con `LeagueMatchCard` y `LeagueTable`) con fechas del fixture Round Robin, inputs de goles, confirmación/edición de partidos, tabla interna en tiempo real y panel de podio con "Finalizar torneo". Integración en `App.tsx` y `Header.tsx`.
  - Cubre: RF-50, RF-51, RF-53, RF-54, RF-55, RF-30, RF-31.
- [x] **T28 · Verificación final y DoD de la ampliación** — Ejecución de suite de tests (`npm test`) y build (`npm run build`) en verde. Verificación manual de las 5 nuevas funcionalidades en el navegador (borrado de jugador, reset de tabla, bracket único, liga round robin completa, draft automático).
  - Cubre: Criterios de Finalización (DoD spec §5).

## Fase G — Temáticas Personalizadas

- [x] **T29 · Dominio y Estado: Temáticas personalizadas** — Soporte de `customThemes?: string[]` en `schema.ts` (con valor por defecto seguro `[]` y compatibilidad hacia atrás), funciones puras `validateCustomTheme(name, existingThemes)` y `getAllThemes(customThemes)` en `theme.ts`. Acción `CUSTOM_THEME_ADDED` en `actions.ts` y reducer en `reducer.ts`. Tests unitarios en `theme.test.ts` y `reducer.test.ts`.
  - Cubre: RF-56, RF-57, RF-58 · Principio 2, 3 · D17.
- [x] **T30 · UI: Gestión y visualización de Temáticas en ThemeView** — Renderizado de lista/badges con todas las temáticas disponibles actualmente en `ThemeView`, input de texto y botón "Agregar" con validación en vivo, y actualización de la ruleta para ciclar y sortear sobre `getAllThemes(customThemes)`.
  - Cubre: RF-56, RF-57, RF-58.

## Fase H — Liga a Ida y Vuelta (Doble Round Robin)

- [x] **T31 · Dominio y Tests: Doble Round Robin en Liga** — Actualizar `generateLeagueFixture(participantIds, matchFormat, rng)` en `league.ts` para admitir `matchFormat: MatchFormat`. Cuando `matchFormat === 'two_legged'`, generar dos ruedas completas invirtiendo localía (`playerA <-> playerB`). Tests unitarios en `league.test.ts` para 4, 5 y 6 participantes con `two_legged` (verificando cantidad de fechas, partidos e inversión de localía).
  - Cubre: RF-49, RF-50 · Principio 3 · D18.
- [x] **T32 · UI: Selector de formato universal en Registro, Draft y Liga** — En `RegistrationView`, mostrar el selector de Modalidad de Partido de forma permanente (tanto para Llaves como para Liga) con etiquetas contextuales. En `DraftView`, pasar `matchFormat` a `generateLeagueFixture`. En `LeagueView`, indicar en el subtítulo si la liga es a una rueda o doble rueda.
  - Cubre: RF-49, RF-50, RF-59.

## Fase I — Ampliación de Capacidad a 10 Participantes

- [x] **T33 · Dominio y Tests: Llaves Base 8 y Base 16 (7 a 10 participantes)** — Incorporar `'R16_1' | 'R16_2' | 'QF3' | 'QF4'` a `SeriesId` y `'round_of_16'` a `Round` en `types.ts`. Actualizar `generateBracket` en `bracket.ts` para soportar 7 participantes (3 QFs, 1 Bye a Semis), 8 participantes (4 QFs, 0 Byes), 9 participantes (1 Play-in Octavos `R16_1`, 7 Byes a Cuartos) y 10 participantes (2 Play-ins Octavos `R16_1` y `R16_2`, 6 Byes a Cuartos). Tests unitarios exhaustivos en `bracket.test.ts` para 7, 8, 9 y 10 participantes.
  - Cubre: RF-17, RF-18, RF-19 · Principio 3 · D19.
- [x] **T34 · Dominio y Tests: Liga para 7 a 10 participantes** — Actualizar validación de cantidad de participantes en `generateLeagueFixture` de `league.ts` (`count < 4 || count > 10`). Tests unitarios en `league.test.ts` para 7, 8, 9 y 10 participantes en modalidad a una y dos ruedas, verificando que los impares (7 y 9) tengan exactamente 1 jugador libre por fecha y el conteo exacto de partidos.
  - Cubre: RF-50 · Principio 3 · D19.
- [x] **T35 · Estado y Reducer: Soporte de hasta 10 participantes** — Actualizar validación en `reducer.ts` (`action.participantIds.length > 10` en `PARTICIPANTS_SET`). Tests en `reducer.test.ts` verificando la correcta inicialización y avance con 7 a 10 jugadores.
  - Cubre: RF-6 · Principio 2, 3 · D19.
- [x] **T36 · UI: Ampliación de Registro y Columna de Octavos en BracketView** — En `RegistrationView.tsx`, permitir seleccionar hasta 10 jugadores con contador `${count}/10` y mensajes acordes. En `BracketView.tsx`, renderizar condicionalmente la columna "Octavos de Final" (Play-in) cuando el torneo tenga series de ronda `round_of_16` (9 y 10 participantes) con ancho adecuado para scroll horizontal.
  - Cubre: RF-6, RF-60.



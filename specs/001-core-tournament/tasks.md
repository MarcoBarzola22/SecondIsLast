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

## Fase J — Fair Play y Criterios de Desempate (Tarjetas y H2H)

- [x] **T37 · Dominio y Tests: Tarjetas y nuevo orden de desempate en tablas (H2H, Fair Play)** — Soporte de `CardCounts` (`yellow`, `red`) en `LegScore` y `LeagueMatch`. Función pura `sortStandingsWithFairPlay` implementando: 1) PTS, 2) DG, 3) Duelo Directo (H2H entre los empatados), 4) PG, 5) Menos TR, 6) Menos TA, 7) Apellido alfabético. Tests exhaustivos en `src/domain/__tests__/fairPlay.test.ts`.
  - Cubre: RF-61, RF-62 · Principio 3 · D20.
- [x] **T38 · Estado y Reducer: Soporte de tarjetas en partidos/series** — Actualización de acciones `LEG_SCORE_SET`, `LEAGUE_MATCH_SCORE_SET` para aceptar `cards?: CardCounts`. Integración en `reducer.ts` asegurando persistencia de tarjetas y recálculo automático de la tabla con `sortStandingsWithFairPlay`. Tests en `reducer.test.ts`.
  - Cubre: RF-61, RF-62 · Principio 3 · D20.
- [x] **T39 · UI: Inputs de tarjetas y visualización en tablas** — Inputs numéricos para TA y TR (0-99) en `SeriesCard.tsx` y `LeagueMatchCard.tsx`. Renderizado de columnas/chips para TR y TA en `LeagueTable.tsx` y detalle en tablas.
  - Cubre: RF-61, RF-63.

## Fase K — Abandono de Torneo por Jugador (Walkover)

- [x] **T40 · Dominio y Tests: Lógica de Walkover (3-0 en contra en todos los partidos)** — Módulo puro `src/domain/walkover.ts` con función `applyWalkoverToTournament(tournament, playerId)`. Sobreescribe todos los partidos disputados y por disputar con resultado 0-3 en contra (rival 3 goles a favor, desertor 0 goles). En series de llaves, el rival avanza automáticamente. Recálculo automático de la tabla. Tests en `walkover.test.ts`.
  - Cubre: RF-64, RF-65, RF-66 · Principio 3 · D21.
- [x] **T41 · Estado y Reducer: Acción de abandono individual y recálculo** — Acción `PLAYER_WALKOVER_DECLARED` en `actions.ts`. En `reducer.ts`, delegación en `applyWalkoverToTournament` e incorporación de `playerId` a `walkoverPlayerIds: PlayerId[]`. Tests en `reducer.test.ts`.
  - Cubre: RF-64, RF-65, RF-66 · Principio 3, 5 · D21.
- [x] **T42 · UI: Botón "Abandonar Torneo" por jugador y feedback visual de W.O.** — Botón individual en filas de jugadores en `LeagueView` y `BracketView` con diálogo de confirmación estricta (`window.confirm`). Badges visuales "W.O." para los partidos afectados y bloqueo de edición en partidos con walkover.
  - Cubre: RF-64, RF-65, RF-66.

## Fase L — Nuevos Formatos: Fase de Grupos y Liga + Reducido

- [x] **T43 · Dominio y Tests: Fase de Grupos (6 y 9 participantes, Berger por grupo, desempates y playoffs)** — Módulo puro `src/domain/groupStage.ts` con `generateGroupsFixture`, `computeGroupStandings`, `getBestRunnerUp`, `generateGroupPlayoffs`. Tests exhaustivos en `groupStage.test.ts` para 6 participantes (2 grupos de 3 con clasificación 1° y 2° a Semis) y 9 participantes (3 grupos de 3 con clasificación de tres 1° y el mejor 2° comparativo por Fair Play). Soporte para partido único e ida/vuelta.
  - Cubre: RF-6, RF-48, RF-49, RF-67 · Principio 3 · D22.
- [x] **T44 · Dominio y Tests: Liga + Reducido (corte de clasificados según N y generación del bracket final)** — Módulo puro `src/domain/leaguePlayoffs.ts` con `generatePlayoffsBracketFromStandings`. Detección de conclusión de fase regular y corte de clasificados: 4 participantes (top 2 a Final), 6 u 8 participantes (top 4 a Semis), 10 participantes (top 8 a Cuartos). Tests en `leaguePlayoffs.test.ts`.
  - Cubre: RF-48, RF-68 · Principio 3 · D23.
- [x] **T45 · Estado y Reducer: Soporte de fases group_stage, group_playoffs y league_playoffs** — Nuevas acciones `GROUP_STAGE_GENERATED`, `GROUP_MATCH_SCORE_SET`, `GROUP_MATCH_CONFIRMED`, `GROUP_PLAYOFFS_STARTED`, `LEAGUE_PLAYOFFS_STARTED` en `actions.ts` y manejo en `reducer.ts`. Tests en `reducer.test.ts`.
  - Cubre: RF-48, RF-67, RF-68 · Principio 3 · D22, D23.
- [x] **T46 · UI: Selector de nuevos formatos en Registro y vista GroupStageView** — Opciones "Fase de Grupos + Playoffs" y "Liga + Reducido" en `RegistrationView.tsx`. Creación de `GroupStageView.tsx` mostrando los grupos paralelos (Grupo A, B, C) con sus fechas, tablas y botón de avance a playoffs.
  - Cubre: RF-6, RF-48, RF-67.
- [x] **T47 · UI: Transición de fase en Liga + Reducido y Bracket de Playoffs** — En `LeagueView`, al completar la fase regular, renderizado del botón "Comenzar Reducido" y visualización del cuadro de playoffs con avance de llaves y podio final.
  - Cubre: RF-68, RF-30, RF-31.

## Fase M — Nuevo Formato: Doble Eliminación (Winner/Loser Bracket)

- [x] **T48 · Dominio y Tests: Generación y progresión de Doble Eliminación** — Módulo puro `src/domain/doubleElimination.ts` con `generateDoubleEliminationBracket`, `advanceDoubleEliminationSeries`, `evaluateGrandFinal`. Soporte para 4 a 10 participantes con Byes asimétricos, caída de perdedores de WB a LB y evaluación de Grand Final Reset si el finalista de LB vence al de WB en la serie 1. Tests en `doubleElimination.test.ts`.
  - Cubre: RF-48, RF-69 · Principio 3 · D24.
- [x] **T49 · Estado y Reducer: Soporte de Doble Eliminación en activeTournament y reducer** — Acciones `DOUBLE_ELIMINATION_GENERATED`, `DOUBLE_ELIMINATION_MATCH_CONFIRMED`, `DOUBLE_ELIMINATION_RESET_TRIGGERED`. Integración en `reducer.ts` y persistencia. Tests en `reducer.test.ts`.
  - Cubre: RF-48, RF-69 · Principio 3 · D24.
- [x] **T50 · UI: Componente y vista DoubleEliminationView** — Creación de `DoubleEliminationView.tsx` renderizando columnas para Winner Bracket, Loser Bracket y la Gran Final con indicador de "Bracket Reset" en caso de empate global o victoria del LB. Integración en `App.tsx` y `Header.tsx`.
  - Cubre: RF-48, RF-69.

## Fase N — Calculadora de Escenarios (Smart UI)

- [x] **T51 · Dominio y Tests: Algoritmo de clasificación matemática y cálculo de escenarios** — Módulo puro `src/domain/scenarios.ts` con `calculateMathematicalQualification(standings, remainingMatches, qualifyingSpots)` y `getMatchScenarioGuidance(match, standings, remainingMatches)`. Tests en `scenarios.test.ts` evaluando clasificados prematuros y mensajes de requerimientos (triunfo por diferencia de gol, empate, etc.).
  - Cubre: RF-73, RF-74, RF-75 · Principio 3 · D25.
- [x] **T52 · UI: Indicadores visuales en tablas y badges en cruces** — En `LeagueTable.tsx` y tablas de grupos, estilo verde brillante en filas en puestos de clasificación y badge "Clasificado" con check verde. En `LeagueMatchCard.tsx` y tarjetas de fase de grupos en las últimas 2 o 3 fechas, banner con el escenario sugerido ("Ganando clasificás", "Empate te asegura podio", etc.).
  - Cubre: RF-73, RF-74, RF-75.

## Fase O — Historial Global, Head-to-Head y Ranking Anual Ponderado

- [x] **T53 · Dominio y Tests: Registro H2H, cálculo de distinciones y Ranking Anual escalado** — Módulo puro `src/domain/awardsAndRankings.ts` con funciones puras: `updateHeadToHead(currentH2H, matches)`, `computePlayerAwards(players, matches, history)` (Bota de Oro, Madera, Valla Invicta), y `computeAnnualRanking(history, year)` con ponderación por participantes ($10 \times N/4$, $7 \times N/4$, etc.). Tests en `awardsAndRankings.test.ts`.
  - Cubre: RF-76, RF-77, RF-78 · Principio 3 · D26.
- [x] **T54 · Persistencia y Estado: Migración de schema (versión 2) y acumulación en TOURNAMENT_FINISHED** — Actualizar `SCHEMA_VERSION = 2` en `schema.ts`. En `storage.ts`, migrador automático de datos v1 a v2 asegurando valores por defecto seguros. En `reducer.ts`, acumulación de H2H y Ranking Anual al despachar `TOURNAMENT_FINISHED`. Tests en `storage.test.ts` y `reducer.test.ts`.
  - Cubre: RF-76, RF-78, RF-80 · Principio 6 · D26, D27.
- [x] **T55 · UI: Pestañas de estadísticas en StandingsView** — Selector de pestañas en `StandingsView.tsx`: "Tabla General", "Ranking Anual Ponderado", "Duelos Directos (H2H)" con selector de 2 jugadores cara a cara, y vitrina de "Premios y Récords" (Bota de Oro, Premio de Madera, Valla Invicta).
  - Cubre: RF-76, RF-77, RF-78, RF-79.

## Fase P — Verificación Integral v2.0 (DoD)

- [x] **T56 · Verificación Integral y DoD v2.0** — Ejecución completa de la suite de pruebas unitarias (`npm test`), verificación de build de producción (`npm run build`), prueba de compatibilidad de almacenamiento con migraciones y revisión de textos en español rioplatense.
  - Cubre: Criterios de Finalización (DoD v2.0 spec §5).

## Fase Q — Pulido de Experiencia (UI/UX)

- [x] **T57 · Dominio y Tests: Distribución de puntos del torneo y cálculo de participantes matemáticamente eliminados ("Sin chances")** — En `src/domain/awardsAndRankings.ts`, implementar la función pura `getTournamentPointsDistribution(participantCount: number)` que calcula los puntos de Campeón ($10 \times N/4$), Subcampeón ($7 \times N/4$), 3° ($5 \times N/4$), 4° ($3 \times N/4$) y participación (+1). En `src/domain/scenarios.ts`, implementar y exportar `calculateMathematicalElimination(standings, remainingMatches, qualifyingSpots)` que determina para cada participante si sus puntos máximos teóricos son insuficientes para alcanzar la zona de clasificación frente a los puntos ya consolidados de los rivales. Tests en `awardsAndRankings.test.ts` y `scenarios.test.ts` evaluando torneos de 4, 6, 8, 9 y 10 jugadores.
  - Cubre: RF-83 (lógica matemática), RF-84 (lógica matemática) · Principio 3 · D30, D31.
- [x] **T58 · UI: Selección de Temática Manual en ThemeView** — En `ThemeView.tsx`, agregar un selector desplegable o interactivo con todas las temáticas disponibles (`getAllThemes`) y un botón de confirmación ("Elegir temática") que dispare `THEME_SET` directamente sin animación de ruleta, actualizando la temática activa y permitiendo avanzar de inmediato al Draft.
  - Cubre: RF-81 · D28.
- [x] **T59 · UI: Animación secuencial de revelado en Sorteo Automático de DraftView** — En `DraftView.tsx`, ante el sorteo automático (`handleAutoAssign`), añadir una animación secuencial de revelado paso a paso con intervalo/delay que descubra el equipo asignado a cada participante con suspenso progresivo antes de confirmar las asignaciones en el estado y habilitar el avance a la competencia.
  - Cubre: RF-82 · D29.
- [x] **T60 · UI: Indicador de "Sin chances / Eliminado" y leyenda contextual en tablas de posiciones** — En `LeagueTable.tsx` (y su integración en `LeagueView.tsx` y `GroupStageView.tsx`), recibir y evaluar el mapa de eliminados matemáticos, renderizando un badge "Sin chances" (estilo rojo/gris apagado) junto al nombre del jugador para quienes ya no puedan alcanzar los puestos de corte. Agregar sobre la tabla un banner/leyenda contextual clara indicando el cupo de clasificación según la modalidad y cantidad de jugadores (ej. "Los primeros 4 clasifican al Reducido", "1° y 2° de cada grupo clasifican a Semifinales", "Los primeros 2 clasifican a la Final").
  - Cubre: RF-83 · D30.
- [x] **T61 · UI: Banner informativo de Puntos del Torneo Activo en Header** — En `Header.tsx` (o sub-cabecera del torneo activo), si hay un torneo en curso (`activeTournament`), calcular la distribución de puntos con `getTournamentPointsDistribution` y exhibir un banner deportivo retro con icono de trofeo informando los puntos en juego para el Ranking Anual (ej: "🏆 Torneo de 8 participantes — Campeón: 20 pts | Subcampeón: 14 pts | 3°: 10 pts | 4°: 6 pts").
  - Cubre: RF-84 · D31.
- [x] **T62 · Verificación Integral y DoD de Fase Q** — Ejecución de la suite completa de tests de Vitest (`npm test`), verificación de build de producción (`npm run build`) y validación de flujo completo en navegador de las nuevas características de UI/UX sin advertencias de consola.
  - Cubre: Criterios de Finalización (DoD Pulido UI/UX spec §5).

## Fase R — Hotfixes de Torneo

- [x] **T63 · Dominio, Persistencia y Tests: Puntos enteros, mensaje estricto de eliminación, acumulación de TR/TA y Podios** — En `src/domain/awardsAndRankings.ts`, actualizar `getTournamentPointsDistribution` y `computeAnnualRanking` aplicando `Math.round` a todos los puestos ($10 \times N/4$, etc.) para garantizar enteros estrictos sin decimales. En `src/domain/scenarios.ts`, verificar al inicio de `derivePlayerGuidance` si el jugador está matemáticamente eliminado devolviendo estrictamente `"Eliminado matemáticamente"` o `"Sin chances"`. En `src/domain/types.ts`, `schema.ts`, `storage.ts` y `reducer.ts`, registrar y acumular tarjetas rojas (`redCards`), amarillas (`yellowCards`) y `podiums` (1°, 2° y 3° puesto) en `PlayerStats` y `AnnualRankingEntry` al despachar `TOURNAMENT_FINISHED`. En `StandingsView.tsx`, añadir columnas para TR, TA y Podios. Tests unitarios en `awardsAndRankings.test.ts`, `scenarios.test.ts` y `storage.test.ts`.
  - Cubre: RF-85 · Principio 3, Principio 6 · D32, D33, D34.
- [x] **T64 · UI: Selector de clasificados en Liga + Reducido y botón de Sortear Formato en RegistrationView** — En `RegistrationView.tsx`, cuando la modalidad seleccionada sea "Liga + Reducido", mostrar un control numérico/selector interactivo de cantidad de clasificados a playoffs (2, 4 u 8 según $N$), propagando `qualifyingSpots` al estado y creación del torneo. Junto a los botones de modalidad, incorporar el botón "Sortear Formato" con icono de dados/azar para elegir aleatoriamente una modalidad compatible con los jugadores seleccionados (o entre todas las modalidades disponibles).
  - Cubre: RF-86 · D35.
- [x] **T65 · Dominio y UI: Armado manual de cruces y asignación de Byes en Llaves y Doble Eliminación** — En `src/domain/bracket.ts` y `src/domain/doubleElimination.ts`, admitir la configuración/ordenamiento manual de participantes respetando las asignaciones de cruces iniciales y Byes. En `src/state/actions.ts` y `reducer.ts`, soportar acciones `BRACKET_MATCHUPS_MANUALLY_SET` y `DOUBLE_ELIMINATION_MATCHUPS_MANUALLY_SET` permitidas antes de confirmar cualquier partido de la serie. En `BracketView.tsx` y `DoubleEliminationView.tsx`, renderizar un panel/modal interactivo de "Armado Manual de Cruces" cuando no haya partidos disputados, permitiendo al Admin seleccionar a dedo qué jugador enfrenta a quién y a quién se le asigna el Bye mediante selectores que evitan participantes duplicados.
  - Cubre: RF-87 · D36.
- [x] **T66 · Hotfix UI y Dominio: Selector desplegable de clasificados y Playoffs asimétricos con Byes en Liga + Reducido** — En `RegistrationView.tsx`, reemplazar el input numérico de `qualifyingSpots` por un `<select>` con opciones desde 2 hasta el total de participantes seleccionados ($N$). En `src/domain/leaguePlayoffs.ts`, asegurar que `generatePlayoffsBracketFromStandings` respete exactamente el número de `qualifyingSpots` elegido por el usuario sin redondear a potencias de 2, delegando en `generateBracket` para generar brackets asimétricos con Byes para los mejores clasificados de la fase regular.
  - Cubre: RF-86, RF-68.
- [x] **T67 · Hotfix Visual: Indicador dinámico de cupos y resaltado verde de clasificados en Liga + Reducido** — En `LeagueView.tsx` y `LeagueTable.tsx`, leer el valor real de `qualifyingSpots` desde `activeTournament.qualifyingSpots` sin redondeos ni fallbacks estáticos. Mostrar los textos dinámicos "Los primeros {qualifyingSpots} clasifican al Reducido" y "Cupos: {qualifyingSpots}". Pintar exactamente las primeras `qualifyingSpots` filas con el estilo verde de clasificación y badge "Reducido".
  - Cubre: RF-83, RF-86.







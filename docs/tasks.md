# Tasks 002 — Cloud Multiplayer & Sincronización en Tiempo Real

> Ejecutar de a UNA tarea por vez, en orden estricto de dependencias. Al terminar cada tarea: marcar con checkbox `[x]`, indicar los RF cubiertos y **PARARSE**.
> Referencias: `specs/002-cloud-multiplayer/spec.md` (RF-88 a RF-120) · `specs/002-cloud-multiplayer/plan.md` (Arquitectura técnica, DB y contratos).

---

## Fase 1: Setup de Backend & Base de Datos Relacional

- [x] **T1 · Scaffold del Backend y Configuración Base (Node/Express/TS)**  
  Crear directorio `server/` con Express, TypeScript estricto, CORS, helmet, dotenv y scripts unificados en `package.json` (`server:dev`, `server:build`, `server:test`). Endpoint inicial `/api/health`.  
  - Cubre: Principio 1 de la Constitución.  
  - Hecho cuando: `npm run server:build` compila sin errores y `GET /api/health` responde `{ "status": "ok" }`.

- [x] **T2 · Modelado y Migración Prisma con PostgreSQL**  
  Configurar Prisma en `server/prisma/schema.prisma` con los modelos relacionales completos (`User`, `WhitelistEntry`, `Player`, `Tournament`, `TournamentParticipant`, `Match` con campo `version`, `TournamentVote`, `HistoricalStats`, `HeadToHeadRecord`, `AnnualRankingEntry`).  
  - Cubre: RNF-2, RNF-5.  
  - Hecho cuando: `npx prisma migrate dev` crea exitosamente las tablas en PostgreSQL y `npx prisma generate` genera el cliente tipado sin errores.

- [x] **T3 · Seed Inicial y Configuración de Administrador por Entorno**  
  Crear `server/src/config/seed.ts` para sembrar el usuario y correo del Admin inicial desde variables de entorno (`INITIAL_ADMIN_EMAIL`), garantizando idempotencia.  
  - Cubre: RF-92.  
  - Hecho cuando: Al ejecutar el script de seed, el Admin inicial queda registrado en la tabla `User` y `WhitelistEntry` sin duplicarse en ejecuciones sucesivas.

---

## Fase 2: Autenticación, Whitelist y Perfiles

- [x] **T4 · Servicio de Whitelist y Middlewares de Seguridad**  
  Implementar `whitelistService.ts`, rutas `/api/whitelist` (GET, POST, DELETE) y middlewares de autorización `authMiddleware` y `whitelistMiddleware` con respuestas en español rioplatense.  
  - Cubre: RF-89, RF-91, RNF-4.  
  - Hecho cuando: Peticiones con un email no autorizado reciben HTTP 403 con el mensaje rioplatense reglamentario, y las rutas de administración están restringidas exclusivamente al rol `ADMIN`.

- [x] **T5 · Integración Google OAuth 2.0 y Sesión JWT**  
  Configurar flujo de autenticación con Google OAuth 2.0 (`/api/auth/google`, `/api/auth/google/callback`) emitiendo una cookie `httpOnly` con JWT firmado y endpoint `/api/auth/me`.  
  - Cubre: RF-88, RNF-4.  
  - Hecho cuando: Un usuario autorizado en la whitelist se loguea exitosamente con Google, recibe su cookie de sesión y `/api/auth/me` devuelve su perfil y rol.

- [x] **T6 · Vinculación de Perfil Histórico y AuthContext en Frontend**  
  Asociar la cuenta de Google con el perfil preexistente en `Player` (o crear nuevo). Crear `AuthContext` en React 19 para gestionar sesión, datos de usuario y rol.  
  - Cubre: RF-90.  
  - Hecho cuando: Al iniciar sesión por primera vez con un email vinculado a un jugador histórico, el frontend reconoce su historial y muestra su nombre en la cabecera.

- [x] **T7 · Panel de Administración de Whitelist en Frontend**  
  Crear vista/modal de gestión de Whitelist accesible únicamente para el rol `ADMIN` para agregar emails, asignarlos a jugadores existentes y revocar accesos.  
  - Cubre: RF-91, RF-119.  
  - Hecho cuando: El Admin agrega un nuevo correo desde la interfaz, este se visualiza en la lista y los usuarios ordinarios no tienen acceso a la vista ni a los controles.

---

## Fase 3: Dominio Puro de Torneo Multiplayer (TDD en `src/domain/`)

- [x] **T8 · Dominio y Tests: Lógica de Votación y Filtro de Formatos Válidos**  
  Crear `src/domain/voting.ts` con funciones puras: `getValidFormatsForParticipants(n)`, `computeVoteResults(votes, validOptions, rng)` con desempate aleatorio uniforme y descarte estricto de Fase de Grupos si $N \neq 6, 9$.  
  - Cubre: RF-99, RF-101, RF-102.  
  - Hecho cuando: Suite de tests en `src/domain/__tests__/voting.test.ts` valida que para $N=5$ Grupos queda descartado y que los empates se resuelven de forma determinista con el generador de azar.

- [x] **T9 · Dominio y Tests: Máquina de Estados del Handshake y Concurrencia (OCC)**  
  Crear `src/domain/handshake.ts` con `transitionMatchSubmit`, `transitionMatchConfirm`, `transitionMatchReject`, validando actores estrictos (Local vs Visitante) y coincidencia de `expectedVersion`.  
  - Cubre: RF-105, RF-106, RF-107, RF-108, RF-109, RF-110, RF-111, RF-112.  
  - Hecho cuando: Suite de tests en `src/domain/__tests__/handshake.test.ts` comprueba transiciones válidas y lanza error si el Visitante intenta confirmar con una versión desfasada o si un jugador no asignado intenta cargar.

- [x] **T10 · Dominio y Tests: Bloqueo Secuencial por Jugador y Auto-liquidación de Byes**  
  Crear `src/domain/sequentialLock.ts` con `canPlayerPlayMatch(playerMatches, targetMatch)` y actualizar `bracket.ts` para que los cruces con Bye se generen con estado `CLOSED` de forma inmediata.  
  - Cubre: RF-113, RF-114, RF-115.  
  - Hecho cuando: Tests unitarios comprueban que un jugador no puede jugar ronda 2 si su ronda 1 no está `CLOSED`, que parejas libres sí pueden avanzar, y que partidos con Bye inician cerrados sin bloquear a nadie.

- [x] **T11 · Dominio y Tests: Aplicación Atómica de Walkover**  
  Crear `src/domain/walkover.ts` con `applyWalkoverToTournament(tournament, participantId)` sobreescribiendo todos sus partidos a 0-3, marcándolos `CLOSED` y recalculando tablas.  
  - Cubre: RF-116, RF-117.  
  - Hecho cuando: Tests unitarios verifican que un walkover transforma todos los partidos en 0-3 en contra sin tarjetas adicionales, los autoconfirma y libera a los rivales.

---

## Fase 4: Servidor WebSocket, Lobby en Tiempo Real y Votación

- [x] **T12 · Setup de Socket.io y Autenticación de Sockets**  
  Configurar servidor Socket.io en `server/src/sockets/index.ts` con middleware de autenticación por JWT y validación de Whitelist para aceptar conexiones de WebSocket.  
  - Cubre: RNF-1, RNF-4.  
  - Hecho cuando: Un cliente con cookie/token válido establece conexión WebSocket exitosamente y un cliente sin token es rechazado con error de autenticación.

- [x] **T13 · API y Eventos de Lobby, Presencia y Quórum**  
  Implementar endpoints REST `/api/tournaments/lobby`, `/api/tournaments/lobby/presence` y socket handler `lobbyHandler.ts` emitiendo `lobby:updated`. Control de unicidad de torneo activo.  
  - Cubre: RF-93, RF-94, RF-95, RF-96, RF-97, RF-98.  
  - Hecho cuando: Varios clientes confirman presencia, la lista se actualiza en tiempo real en todos los dispositivos sin caerse por desconexiones breves, y el inicio se bloquea si $N < 4$.

- [x] **T14 · Componente UI de Lobby y Quórum Responsive**  
  Desarrollar `LobbyView.tsx` adaptado para celular y PC con lista de confirmados en tiempo real, indicador de quórum ($\ge 4$), botón "Confirmar presencia", "Cancelar presencia" y botón de expulsión para el Admin.  
  - Cubre: RF-93, RF-94, RF-95, RF-119.  
  - Hecho cuando: Un usuario confirma presencia desde su móvil y el navegador en la PC de la juntada refleja el nuevo presente de inmediato.

- [x] **T15 · Votación en Vivo con Temporizador y Desempate**  
  Implementar `/api/tournaments/vote`, temporizador regresivo de 120s en servidor (`votingHandler.ts`), emisión de `vote:started`, `vote:updated`, `vote:ended` y componente `VotingView.tsx`.  
  - Cubre: RF-99, RF-100, RF-101, RF-102.  
  - Hecho cuando: Al abrirse la votación corre la cuenta regresiva visible de 120s para todos los clientes, y al votar el 100% o llegar a 0 se cierra y desempata automáticamente si hay paridad.

- [x] **T16 · Precarga de Equipos, Previsualización y Sorteos Sincronizados**  
  Implementar precarga de equipos por temática para el Admin, componente de previsualización para participantes y emisión del evento `draw:animated` para animación cuadro por cuadro sincronizada.  
  - Cubre: RF-103, RF-104.  
  - Hecho cuando: Al ejecutarse el sorteo de equipos, todos los dispositivos conectados reproducen la animación simultáneamente mostrando qué equipo le tocó a cada participante.

---

## Fase 5: Persistencia de Torneos, Handshake y Concurrencia

- [x] **T17 · Generación de Fixture Relacional con Auto-liquidación de Byes**  
  Servicio `tournamentService.ts`: Al culminar el draft, persiste el torneo en DB, genera los registros `Match` con sus participantes y marca inmediatamente los Byes como `CLOSED`.  
  - Cubre: RF-113, RNF-2.  
  - Hecho cuando: Al iniciar la competencia, los registros en PostgreSQL tienen sus partidos creados y los Byes ya figuran cerrados con avance de participante.

- [x] **T18 · Carga de Partidos por el Local con soporte de Penales**  
  Endpoint `POST /api/matches/:id/submit` con validación de rol Local y carga de `penaltiesWinnerId`. Emisión de `match:submitted`.  
  - Cubre: RF-105, RF-106, RF-107.  
  - Hecho cuando: El jugador Local envía el resultado y el partido pasa a `PENDING_CONFIRMATION` notificando en tiempo real al Visitante.

- [x] **T19 · Confirmación y Rechazo por el Visitante con Versionado Optimista (OCC)**  
  Endpoints `POST /api/matches/:id/confirm` y `POST /api/matches/:id/reject` con validación de `expectedVersion`. Retorno de 409 ante versión desfasada y recálculo atómico ante confirmación.  
  - Cubre: RF-108, RF-109, RF-110, RF-111, RNF-2.  
  - Hecho cuando: Si el Local modificó el partido previamente, el intento de confirmación del Visitante retorna 409; si coincide versión, el partido queda `CLOSED` e inmutable.

- [x] **T20 · Componentes UI de Handshake Modal y Notificaciones en Vivo**  
  Desarrollar `HandshakeModal.tsx` y tarjetas de partido en `MatchCard.tsx` que distinguen si el usuario es Local (input habilitado) o Visitante (botones Confirmar/Rechazar visibles al recibir propuesta).  
  - Cubre: RF-105, RF-106, RF-108, RF-119.  
  - Hecho cuando: El Local envía un resultado desde su celular, en la pantalla del Visitante se abre inmediatamente el diálogo de confirmación con los datos para aceptar o rechazar.

- [x] **T21 · Bloqueo Secuencial y Desacoplamiento de Fecha Global en UI**  
  Integrar `sequentialLock.ts` en la interfaz: deshabilitar partidos de fecha $N+1$ si la fecha $N$ del jugador está abierta; habilitar de inmediato partidos si ambos rivales están libres.  
  - Cubre: RF-114, RF-115.  
  - Hecho cuando: Un jugador con su partido anterior abierto ve bloqueado el siguiente partido, mientras que otra pareja libre ya puede cargar su partido siguiente sin esperar.

- [x] **T22 · Flujo y UI de Walkovers (Auto-declaración y Admin)**  
  Implementar `/api/tournaments/participants/:id/walkover` y modal de confirmación estricta para auto-walkover y acción de Admin. Emisión de `walkover:applied`.  
  - Cubre: RF-116, RF-117.  
  - Hecho cuando: Al aplicarse un Walkover, todos los partidos del jugador se sobreescriben a 0-3, se cierran automáticamente y sus rivales quedan liberados en la UI sin requerir handshake.

- [x] **T23 · Cierre de Torneo, Podio y Actualización de Tablas Históricas**  
  Al completarse el último partido, transición de torneo a `COMPLETED`, cálculo del podio, actualización transaccional en Prisma de `HistoricalStats`, `HeadToHeadRecord` y `AnnualRankingEntry`.  
  - Cubre: RF-110, Principio 5.  
  - Hecho cuando: Se cierra el torneo y las estadísticas acumuladas, registros H2H y ranking anual se reflejan de inmediato en la base de datos sin duplicaciones.

---

## Fase 6: Resiliencia Offline, Reglamento, Migración y Cierre

- [x] **T24 · Estrategia de Caché Local y Banner "Modo Offline"**  
  Crear hook `useNetworkStatus`, servicio `offlineStore.ts` y banner en `Header.tsx`. Bloquear mutaciones y mantener navegación de solo lectura en Tablas/Llaves ante corte de red.  
  - Cubre: RF-120, RNF-3.  
  - Hecho cuando: Al desconectar internet o simular offline en DevTools, aparece el banner, los botones de acción se deshabilitan y las tablas y cruces se visualizan normalmente desde la caché local.

- [x] **T25 · Sección de Reglamento Oficial de la Casa**  
  Endpoint `GET /api/rules` y componente de solo lectura `RulesView.tsx` con las reglas de la casa consensuadas por el grupo.  
  - Cubre: RF-118.  
  - Hecho cuando: Cualquier usuario autenticado navega a la sección de Reglamento y visualiza el texto oficial formateado en español rioplatense.

- [x] **T26 · Endpoint y Flujo de Migración de Datos Locales a PostgreSQL**  
  Endpoint `POST /api/admin/migrate-local-data` y botón en panel de Admin para importar el backup de `localStorage` (`schemaVersion: 2`) a PostgreSQL de forma idempotente.  
  - Cubre: Plan §6.  
  - Hecho cuando: Al ejecutar la migración con un JSON exportado de la v2.0 local, todos los jugadores, historial, H2H y rankings anuales quedan persistidos en la base de datos.

- [x] **T27 · Verificación Final de Épica (Definition of Done)**  
  Ejecutar suite completa de tests de dominio (`npm test`) y tests de integración backend (`npm run server:test`). Auditoría de responsive en celular y desktop, y validación de textos en español rioplatense.  
  - Cubre: Criterios de Finalización (spec §8), RF-119, Principio 4, Principio 6.  
  - Hecho cuando: 100% de los tests pasan en verde, build de frontend y backend sin advertencias, y flujo de prueba simulando 4 clientes concurrentes completa un torneo de punta a punta.

---

## Fase 7: Estabilización de Votación y Navegación en Tiempo Real

- [x] **T28 · Corrección Integral de Votación, Navegación y Transición Automática**  
  Solucionar bugs críticos de votación: (1) Inhabilitar paso 'votacion' en `Header.tsx` si no está en fase de votación y botón Abandonar/Reiniciar Torneo; (2) Botón explícito "Confirmar Voto" en `VotingView.tsx` con selección previa de formato y modalidad; (3) Eliminar 400 Bad Request en `/api/tournaments/vote`, auto-transición de LOBBY a VOTING_FORMAT, resolución robusta de participantes y opción random; (4) Transición automática de vistas en `App.tsx` ('VOTING_THEME' -> 'equipos') y manejo silencioso de 401 en `/api/auth/me` y `/api/tournaments/active`.  
  - Cubre: RF-94, RF-97, RF-99, RF-100, RF-101, RF-102.  
  - Hecho cuando: Flujo completo `Lobby -> Votar con 4 usuarios -> Transición automática a la siguiente vista` pasa los tests de integración, no hay 400s ni 401s ruidosos, y pasan `npm test` y `npm run server:test`.

- [x] **T31 · Hotfix Integral: Fixture en DB, Control Admin de Votación/Sorteo, Método de Asignación y Nombres Reales**  
  Corregir crash de Foreign Key en Prisma (`P2003`), visibilidad estricta de resultados de votación con avance manual por Admin, selección de método de asignación (Sorteo Directo vs Orden de Draft) y nombres reales en animación de ruleta sincronizada.  
  - Cubre: RF-99, RF-100, RF-103, RF-104, RF-113, RNF-2.  
  - Hecho cuando: Fixture relacional persiste UUIDs reales y nulls para Byes/cruces pendientes sin errores de FK, la pantalla de votación no auto-avanza por timers y sólo el Admin puede avanzar a la fase de equipos mediante `POST /api/tournaments/advance-phase`, el sorteo de orden de draft ordena participantes sin asignarles equipos, la ruleta muestra los nombres reales de los jugadores y el botón de sorteo está restringido al Admin. Suite completa en verde (`npm test` y `npm run server:test`).
- [x] **T32 · Hotfix Integral: Autonomía Total, Seguridad Anti-Trolls, Flujo Draft Manual y Fix de Memoria React ("Sin Torneo Activo")**  
  Implementar autonomía en el flujo de torneo eliminando dependencia de Admin en `VotingView`, `TeamsPreviewView`, `/advance-phase`, `/draw-teams` y `/fixture` para participantes confirmados; restringir botón global de abandono/reinicio en `Header.tsx` y `POST /api/tournaments/abandon` exclusivamente a `isAdmin`; bloquear desconfirmación de presencia en `DELETE /api/tournaments/lobby/presence` fuera de `LOBBY`; desacoplar sorteo de "Orden de Elección" (Draft Manual) de la generación de fixture navegando a `DraftView` y generando fixture solo al finalizar la selección; e hidratar el contexto global de React (`HYDRATE_TOURNAMENT`) al recibir el socket `fixture:ready` en `App.tsx` para evitar que la vista quede en estado "Sin Torneo Activo".  
  - Cubre: RF-95, RF-103, RF-104, RF-113, RNF-2.  
  - Hecho cuando: Cualquier participante confirmado puede avanzar de fase y ejecutar el sorteo de equipos, el botón global de abandono en el Header es exclusivo de Admin, salir del lobby se bloquea fuera de la fase LOBBY, el draft manual navega a la selección y solo genera fixture al concluir, y el evento `fixture:ready` hidrata de inmediato el estado global de React mostrando los partidos y cruces en vivo. Suite completa en verde (`npm test` y `npm run server:test`).
- [x] **T33 · Hotfix Integral: Votación Formal de Método de Asignación (60s), Turno Sincronizado de 30s en Draft Manual y Validación de Equipos Disponibles**  
  Formalizar la elección del método de asignación ("Sorteo Directo" vs "Sorteo de Orden de Elección / Draft") como fase de votación de 60 segundos (`ASSIGNMENT_METHOD`) con desempate aleatorio uniforme en caso de paridad y ejecución de sorteo accesible a cualquier participante. Implementar temporizador sincronizado de 30 segundos por turno en `DraftView.tsx` y `draftHandler.ts` vía WebSockets (`draft:sync`, `draft:turn_updated`, `draft:completed`), auto-asignación aleatoria al expirar el tiempo en 00:00 con avance automático de turno, exclusión visual inmediata de equipos ya elegidos de la lista de "Equipos Disponibles", y transición limpia a la generación del fixture relacional en PostgreSQL tanto al completar el Draft como inmediatamente después de la animación del Sorteo Directo.  
  - Cubre: RF-99, RF-100, RF-103, RF-104, RF-113.  
- [x] **T34 · Hotfix Crítico: UI de Votación 60s en TeamsPreviewView, Animación Ruleta 1200ms, Turnos Draft de 20s y Handshake Invisible**  
  Implementar la UI de votación en vivo de 60 segundos para el método de asignación en `TeamsPreviewView.tsx` (idéntica a `VotingView.tsx`), desempate aleatorio con alerta visual y habilitación del botón "Ejecutar Asignación" únicamente una vez finalizada la votación. Ajustar la cadencia de la ruleta de sorteo a 1200ms en `drawHandler.ts` y `tournamentService.ts` para maximizar el suspenso visual. Reducir los turnos del Draft Manual a 20 segundos exactos en `draftHandler.ts` y `DraftView.tsx`. Reparar el Handshake Modal en `App.tsx` y `matchService.ts` mediante validación cruzada exhaustiva (`awayPlayerId`, `user.player?.id`, `email`, endpoint `/api/auth/me`), enriquecimiento del payload en `match:submitted`, y soporte multi-campo para el Visitante al confirmar o rechazar el partido volviendo a `PENDING_SUBMISSION`.  
  - Cubre: RF-99, RF-100, RF-103, RF-104, RF-105, RF-108, RF-111, RF-112.  
- [x] **T35 · Hotfix Crítico: UI React y WebSockets en TeamsPreviewView, DraftView y Handshake Centralizado**  
  Reescribir la UI de frontend para responder fielmente a los eventos de WebSockets: (1) En `TeamsPreviewView.tsx`, reemplazar las tarjetas estáticas por botones interactivos de votación de 60 segundos con reloj digital gigante `useCountdown(expiresAt, 60)`, cartel de anuncio del método ganador durante 3 segundos al finalizar y auto-avance a sorteo directo o draft; (2) En `DraftView.tsx`, banner superior gigante de turno sincronizado con el backend (`draft:turn_updated`), reloj de 20s con barra de progreso reactiva, candados y bloqueo de interacción para jugadores fuera de turno, y deshabilitación visual de equipos ya seleccionados; (3) En `App.tsx`, centralizar el modal de Handshake escuchando `match:submitted` y eventos locales `open-handshake-modal`, abriendo de inmediato el modal al Visitante y eliminando modales locales redundantes e invisibles de `LeagueMatchCard.tsx` y `SeriesCard.tsx`.  
  - Cubre: RF-99, RF-100, RF-103, RF-104, RF-105, RF-108, RF-111, RF-112.  
- [x] **T36 · Hotfix Crítico Final: Votación de Método en VOTING_THEME, Hidratación de Fases en Reducer y Handshake Directo al Visitante**  
  Solucionar las 4 causas raíz de los fallos en vivo: (1) Permitir en `tournamentService.ts` y `tournaments.ts` iniciar la votación de `ASSIGNMENT_METHOD` cuando el torneo está en estado `VOTING_THEME`, unificando el endpoint `/api/tournaments/start-voting`; (2) Validar que `expiresAt` en `TeamsPreviewView.tsx` sea una cadena de fecha válida antes de asignarlo o disparar el auto-cierre para evitar el salto automático al instante; (3) Actualizar `buildActiveTournamentFromPayload` en `reducer.ts` para mapear fielmente las fases (`draft`, `theme`, `bracket`, etc.) junto con `teams` y `draftOrder`, y sincronizar `rehydrateActiveTournament()` en `App.tsx` al recibir `draft:turn_updated`, `tournament:status` ('DRAFT'), `vote:ended` y `fixture:ready`; (4) Relajar las validaciones de `TEAM_ASSIGNED` y `TEAMS_BATCH_ASSIGNED` en `reducer.ts` para que no crasheen si el estado está temporalmente desfasado; y (5) Simplificar la detección del Visitante en `handleMatchSubmitted` en `App.tsx` usando directamente el payload crudo sin fetch bloqueante.  
  - Cubre: RF-99, RF-100, RF-103, RF-104, RF-105, RF-108, RF-111, RF-112.  
  - Hecho cuando: La votación de método en `TeamsPreviewView.tsx` no se salta automáticamente y corre el reloj de 60s; las acciones de asignación de equipos no crashean el Reducer; y el Handshake modal salta al instante al usuario logueado como Visitante. 100% de tests green (`npm test` y `npm run server:test`).
- [x] **T37 · Cirugía Integral Definitiva: Fix 500/400/404, Refresco de Lobby, Draft Roulette & Handshake Sincronizado**  
  Solución integral a las 6 causas raíz detectadas en auditoría forense:  
  1. **Fix Error 500 en `start-voting`:** Eliminado `TournamentStatus.DRAFT` inexistente en Prisma dentro de `startFormatVoting` (`tournamentService.ts`) e idempotencia de sesiones activas en `tournaments.ts` para evitar pisotón de temporizador en cargas concurrentes.  
  2. **Refresco automático de Lobby:** Emisión global de `lobby:created` y `lobby:updated` (`tournaments.ts`, `lobbyHandler.ts`), y listeners reactivos en `LobbyView.tsx` para clientes sin torneo activo.  
  3. **Votación -> Sorteo de Ruleta -> Entrada a Draft:** Banner de método ganador durante 3s en `TeamsPreviewView.tsx`, disparo de sorteo en backend con temporizador de 3s e idempotencia en `executeTeamDraw`, animación de ruleta a 1200ms (`draw:animated`) tanto para equipos como para orden de draft (1º, 2º, 3º, 4º) con visualización de resultado por 3s antes de navegar.  
  4. **Protección contra expulsión de Draft & Fix 400 en Selección:** Inclusión de `draftSession` en `GET /api/tournaments/active` y protección en `App.tsx` para no regresar a `'equipos'`. Unificación de `playerId` y `participantId` en `DraftOrderEntry`, aceptación flexible de pick en `draftHandler.ts` y sincronización de `chosenTeamsByPlayerId` / `chosenTeamsByParticipantName` para mostrar `🔒 Elegido por [Nombre]` en `DraftView.tsx`.  
  5. **Fix Definitivo de Handshake en Liga y Llaves:** Uso de UUID real de PostgreSQL `m.id` en `reducer.ts` para evitar 404 en `/api/matches/:id/submit`, formato canónico `{ a, b, cardsA, cardsB }` con `matchIdLeg1`/`matchIdLeg2` para llaves, eliminación del bypass 404 silencioso, evento `tournament-rehydrate` al confirmar el envío, resolución flexible de identidad y emisión global en `matchService.ts`, y apertura reactiva del HandshakeModal con "Confirmar Resultado" y "Rechazar (Mal cargado)".  
  - Cubre: RF-94, RF-95, RF-99, RF-100, RF-103, RF-104, RF-108, RF-111, RF-112.  
- [x] **T38 · Micro-Hotfix: TypeMismatch de Prisma en startFormatVoting**  
  Incorporar `include: { participants: { where: { isPresent: true }, include: { player: true } } }` en el `tournament.update` de `startFormatVoting` (`tournamentService.ts`), resolviendo la falta de la propiedad `participants` en el tipo inferido de `updatedTournament`.  
  - Cubre: RF-99, RF-100.  
  - Hecho cuando: `npx tsc -p server/tsconfig.json` y `npx tsc --noEmit` compilan con 0 errores y `npm run server:test` pasa 100% en verde.

- [x] **T39 · Encadenamiento Automático de Votaciones 60s, Fix de Cuenta Regresiva Sincrónica y Cierre con Podio Oficial**  
  1. **Fix de Cierre Instantáneo en `useCountdown`:** Cálculo sincrónico por render de `secondsLeft` e `isExpired` a partir de `expiresAt` con guardas estrictas en `VotingView.tsx` y `TeamsPreviewView.tsx` evitando llamadas prematuras a `close-voting` si `Date.parse(expiresAt) > Date.now()`.  
  2. **Tres Votaciones Encadenadas de 60s por el Servidor:**  
     - **Votación 1 (`phase: 'FORMAT'`, 60s):** Opciones según N participantes + opción `"random"` ("🎲 Sortear Formato al Azar") + Single Match vs Two-Legged con desempate aleatorio uniforme. Tras 4s mostrando ganador, encadena automáticamente a Votación 2.  
     - **Votación 2 (`phase: 'THEME'`, 60s):** Opciones con temáticas precargadas por Admin + temáticas reglamentarias por defecto (Champions Europa, Mundial / Selecciones, Libertadores Sudamérica, Apertura 2006, Clásicos PES 6) + opción `"random"`. Tras 4s mostrando temática ganadora, encadena automáticamente a Votación 3.  
     - **Votación 3 (`phase: 'ASSIGNMENT_METHOD'`, 60s):** 'DIRECT_DRAW' ("🎲 Sorteo Directo de Equipos") vs 'DRAFT_ORDER' ("📋 Sorteo de Orden para Elegir"). Tras 3s mostrando cartel ganador, dispara automáticamente la ruleta sincronizada (1200ms) y avanza a fixture o `DraftView` (20s por turno).  
  3. **Cierre de Torneo y Creación de Nuevo Torneo:** En `historyService.ts`, enriquecimiento del evento `tournament:finished` con podio completo (`championName`, `runnerUpName`, `thirdName`, `fourthName`). En `App.tsx`, modal de Podio Oficial con botones "Ver Tabla Histórica" y "Abrir Nuevo Torneo en Lobby" con reseteo total del estado activo. En `StandingsView.tsx`, botón directo para volver al Lobby a crear un torneo nuevo.  
  4. **Tipado Estricto de Prisma:** Inclusión de `{ participants: { include: { player: true } } }` en todas las consultas de `tournamentService.ts` (`advancePhase`, `confirmPresence`, `removeParticipant`, `abandonTournament`).  
  - Cubre: RF-99, RF-100, RF-101, RF-102, RF-103, RF-104, RF-110.  
  - Hecho cuando: `npx tsc --noEmit` y `npx tsc -p server/tsconfig.json` compilan con 0 errores, y suites completas de frontend (382 tests) y server (145 tests) pasan 100% en verde.

- [x] **T40 · Hotfix Quirúrgico: Fix 400 en Votación de Temática y Orden Estricto 1°->2°->3°->4° en Draft**  
  1. **Fix 400 Bad Request en Votación de Temática (`phase: 'THEME'`):**  
     - En `votingHandler.ts`, actualización en PostgreSQL a `status: TournamentStatus.VOTING_THEME` al finalizar `FORMAT` y antes de iniciar la sesión `THEME`.  
     - En `tournamentService.ts`, `castVote` y `startFormatVoting` aceptan `VOTING_FORMAT` para `phase === 'THEME'` auto-actualizándolo a `VOTING_THEME`.  
     - En `teams.ts` y `tournamentService.ts`, unificación en `getThemeVotingOptions()` y `matchThemeName()` para aceptar temáticas reales con comparación insensible a mayúsculas, espacios y acentos.  
     - En `App.tsx`, protección para conservar la vista `'votacion'` durante `FORMAT` y `THEME`, y prevención de sobreescritura de fase en `start-voting`.  
  2. **Orden Estricto 1° -> 2° -> 3° -> 4° en Draft de Equipos:**  
     - En `draftHandler.ts`, ordenamiento estricto por `order: 1, 2, 3, 4` con `{ order, participantId, playerId, participantName }` y avance secuencial de turno en `advanceDraftTurn` y `getOrRecoverDraftSession`, incluyendo `draftOrder`, `currentTurnIndex` y `currentPlayerId` en todos los payloads.  
     - En `reducer.ts`, captura de `serverDraftOrder` y ordenamiento de `draftOrder` priorizando `playerId` sobre `participantId` para resolver correctamente `playersMap`.  
     - En `DraftView.tsx`, renderizado de la lista `<ol>` usando directamente el orden exacto de `serverDraftOrder`, determinación precisa del turno mediante `serverCurrentTurnIndex` y emparejamiento dual (`playerId` y `participantId`) para que el turno avance en orden estricto `1° -> 2° -> 3° -> 4°` sin saltear jugadores.  
  - Cubre: RF-99, RF-100, RF-101, RF-103, RF-104.  
  - Hecho cuando: `npx tsc --noEmit` y `npx tsc -p server/tsconfig.json` compilan con 0 errores, y suites completas de frontend (382 tests) y server (145 tests) pasan 100% en verde.

- [x] **T41 · Hotfix Desglose sin 0 Votos, Ruleta de Desempate y Sorteo Directo vs Draft**  
  1. **Filtrado de opciones no votadas y Ruleta en Desempate (`VotingView.tsx` y `TeamsPreviewView.tsx`):**  
     - En el bloque "Desglose de Votos", filtrado para mostrar únicamente opciones con `votes > 0`. Si nadie vota (`0 votos totales`), visualización limpia: `"Sin votos emitidos — Definido por sorteo automático al azar"`.  
     - Animación interactiva de ruleta de desempate en vivo durante 2.5 segundos (ciclando cada 120ms entre las opciones empatadas o disponibles) cuando `wasDraw === true`, gana la opción `'random'` o nadie vota, revelando la opción ganadora recién al finalizar los 2.5s.  
  2. **Reparación de la 3ra Votación (`ASSIGNMENT_METHOD`: Sorteo Directo vs Orden de Draft) y su Animación:**  
     - Comparación 100% case-insensitive en `computeVoteResults` (`src/domain/voting.ts` y `server/src/domain/voting.ts`), devolviendo siempre la clave canónica en mayúsculas (`'DIRECT_DRAW'` o `'DRAFT_ORDER'`). Ante 0 votos o empate, selección aleatoria uniforme (50%/50%) con `wasDraw: true` y `tiedOptions: ['DIRECT_DRAW', 'DRAFT_ORDER']`.  
     - Un solo disparador del sorteo por parte del servidor (`votingHandler.ts`), eliminando invocaciones redundantes y prematuras en cliente `TeamsPreviewView.tsx`.  
     - En `App.tsx`, prohibido navegar a `'tematica'` y protección estricta para permanecer en `'equipos'` (`TeamsPreviewView.tsx`) durante `status === 'VOTING_THEME'` y la animación `draw:animated`. Navegación a `'draft'` permitida única y exclusivamente cuando el método ganador fue `'DRAFT_ORDER'` y finalizó la animación de turnos (`isFinal: true`).  
     - Flujo visual según método: `DIRECT_DRAW` muestra animación de 1200ms por jugador y panel `"¡Equipos Sorteados!"` durante 4 segundos (espera de 4000ms en `onComplete` de `tournamentService.ts` antes de `generateRelationalFixture`) avanzando directo a fixture; `DRAFT_ORDER` muestra animación de orden de turnos, tabla de orden durante 3 segundos y transición automática a `DraftView.tsx`.  
  - Cubre: RF-99, RF-100, RF-101, RF-103, RF-104.  
- [x] **T42 · Hotfix Unificado: Eliminación de Parpadeo en Transición a Temática, Ruletas de Desempate 3.5s con Desaceleración, Carteles de Ganador 5s/5.5s y Sorteos Pausados (1.8s)**  
  1. **Eliminación del parpadeo de `TeamsPreviewView` antes de Votación de Temática (`App.tsx`, `votingHandler.ts`, `VotingView.tsx`):**  
     - En `App.tsx` (`handleVoteStarted`, `rehydrateActiveTournament`, `getActiveTournamentView`, `handleTournamentStatus`), mantenimiento estricto de la vista en `'votacion'` (`VotingView.tsx`) durante `phase === 'FORMAT'` y `phase === 'THEME'` mientras `!tournament.theme`. Transición a `'equipos'` (`TeamsPreviewView.tsx`) únicamente cuando `tournament.theme` ya está definido y arranca la fase `ASSIGNMENT_METHOD`.  
     - En `VotingView.tsx`, títulos dinámicos con indicador de pasos: "Votación de Formato (Paso 1 de 3)" vs "Votación de Temática (Paso 2 de 3)", selector de modalidad (Partido Único / Ida y Vuelta) visible solo en `FORMAT`, eliminación del botón manual "Continuar a Equipos" y reemplazo por indicador visual sutil con cuenta/pulso `"Avanzando automáticamente a la siguiente etapa..."`.  
  2. **Ruleta de Desempate + Cartel del Ganador en Votación de Temática (`VotingView.tsx`, `votingHandler.ts`):**  
     - Todos los clientes permanecen en `VotingView.tsx` al terminar `THEME`. Si hubo empate (`wasDraw === true`), 0 votos o ganó `'random'`: animación interactiva de ruleta de desempate en vivo durante 3.5 segundos ciclando entre temáticas cada 140ms desacelerando en los últimos 1100ms, seguida de 5.0 segundos fijos mostrando la tarjeta "¡Temática Electa: [Nombre]!" con desglose de votos (solo `votes > 0` o cartel limpio de desempate al azar). Total 8.5 segundos.  
     - Si hubo ganador directo sin empate: 5.5 segundos fijos del cartel de ganador y desglose de votos.  
  3. **Pausas Claras y Tiempos Cómodos en las 3 Votaciones (`votingHandler.ts`, `VotingView.tsx`, `TeamsPreviewView.tsx`):**  
     - Ritmo sincronizado de 8500ms (en empate/random/0 votos: 3.5s ruleta + 5.0s cartel) o 5500ms (en ganador directo) en `FORMAT`, `THEME` y `ASSIGNMENT_METHOD`.  
     - Indicador sutil de avance automático `"Avanzando automáticamente a la siguiente etapa..."` presente en las tarjetas de resultado de `VotingView.tsx` y `TeamsPreviewView.tsx`.  
  4. **Ritmo Pausado en Sorteo de Equipos y Orden de Turnos (`drawHandler.ts`, `tournamentService.ts`, `TeamsPreviewView.tsx`):**  
     - Cadencia de animación `draw:animated` incrementada a 1800ms (1.8 segundos) por paso para mayor suspenso en sorteos de equipos y turnos de draft.  
     - `DIRECT_DRAW`: visualización del panel final "¡Equipos Sorteados!" durante 7 segundos completos (`7000ms` en `onComplete` de `tournamentService.ts` antes de `generateRelationalFixture`).  
     - `DRAFT_ORDER`: visualización de la tabla del orden de turnos sorteado (`1º, 2º, 3º, 4º`) durante 6 segundos completos (`6000ms` en `TeamsPreviewView.tsx`) antes de transicionar a la vista `'draft'` (`DraftView.tsx`).  
  - Cubre: RF-99, RF-100, RF-101, RF-103, RF-104.  
- [x] **T43 · Hotfix Quirúrgico: Protección contra Desmontaje Prematuro de VotingView y Ruleta Real de Temática**  
  1. **En `App.tsx` (`handleVoteEnded`, `handleVoteStarted`, `rehydrateActiveTournament`, `getActiveTournamentView`):**  
     - En `handleVoteEnded`: si `payload?.phase === 'FORMAT'` o `payload?.phase === 'THEME'`, prohibido llamar a `rehydrateActiveTournament()`. La vista se conserva estrictamente en `'votacion'` para permitir la visualización ininterrumpida de la ruleta de desempate (3.5s) y el cartel de temática ganadora (5.0s).  
     - En `rehydrateActiveTournament` y `getActiveTournamentView`: se eliminó el salto condicional basado en `Boolean(tournament.theme)`. Mientras el torneo esté en `VOTING_THEME`, la vista solo conmuta a `'equipos'` si `votingSession?.phase === 'ASSIGNMENT_METHOD'`, `tournament.settings.assignmentMethod` ya existe, o hay `drawSession` activa. En cualquier otro caso, permanece en `'votacion'`.  
     - En `handleVoteStarted`: el cambio a `'equipos'` y la rehidratación solo se disparan cuando el servidor emite `payload.phase === 'ASSIGNMENT_METHOD'` tras finalizar el intervalo de espera en `votingHandler.ts`.  
  2. **En `votingHandler.ts` (`closeVotingSession` en `THEME`):**  
     - Resolución de temática ganadora real sorteando entre las opciones válidas (excluyendo `'random'`) cuando ganó `'random'` o hubo empate / 0 votos.  
     - `VoteEndedPayload` emite en `winner` el nombre real de la temática sorteada, `wasDraw: true` y `tiedOptions` con el pool de temáticas candidatas.  
  3. **En `VotingView.tsx`:**  
     - Títulos dinámicos de resultado: "¡Temática Electa para la Juntada!" y visualización de la temática ganadora real con desglose de votos filtrado (`votes > 0`).  
  - Cubre: RF-99, RF-100, RF-101, RF-103.  
  - Hecho cuando: `npx tsc --noEmit` y `npx tsc -p server/tsconfig.json` compilan con 0 errores, y suites completas de frontend (385 tests) y server (148 tests) pasan 100% en verde.

- [x] **T44 · Pulido Final Bloque 1: Simplificación del Header, Notificación No Intrusiva y Gestión Persistente de Temáticas y Equipos por Admin**  
  1. **Simplificación del Header y Notificación No Intrusiva (`Header.tsx`, `App.tsx`):**  
     - Reemplazo de navegación repetida por 3 pestañas principales: `Torneo`, `Tabla y Perfiles`, `Reglamento`, más botón `Admin` exclusivo para administradores.  
     - Prohibición de sacar automáticamente al usuario de `tabla` o `reglamento` en eventos de socket, alertando en su lugar con titileo luminoso (`animate-pulse`) y badge de torneo activo en la pestaña `Torneo`.  
  2. **Panel de Admin: Gestión Persistente de Temáticas y Equipos (`WhitelistModal.tsx`, `schema.prisma`, `tournaments.ts`, `tournamentService.ts`):**  
     - Pestaña de `Temáticas y Equipos` en el modal de administración, permitiendo crear, editar y eliminar temáticas personalizadas con sus respectivos equipos en PostgreSQL.  
  - Cubre: RF-57, RF-58, RF-59, RF-60, RF-88, RF-91, RF-94, RF-118, RF-119.  
  - Hecho cuando: `npx prisma db push` actualiza PostgreSQL, `npx tsc --noEmit` y `npx tsc -p server/tsconfig.json` compilan con 0 errores, y suites de tests pasan 100% en verde.

- [x] **T44.1 · Hotfix UI: Layout de 3 Secciones en Header, Modal Admin con Temáticas/Equipos y Recarga Limpia de Lobby**  
  1. **Reestructuración y Compactación del Header (`Header.tsx`):**  
     - Separación del Header en 3 zonas nítidas: Izquierda (Logo y Título), Centro (Navegación principal `Torneo`, `Tabla y Perfiles`, `Reglamento`) y Derecha (Controles: Dev Login, Perfil/Auth, Admin y botón de Abandonar).  
     - Uso de `shrink-0`, contenedor estricto sin envoltura de fila (`flex items-center gap-1.5 sm:gap-2 shrink-0`) y textos responsive (`hidden md:inline`).  
     - Badge compacto en pestaña Torneo (`🔴 Lobby` o `🔴 Activo`) y reducción de paddings/márgenes excesivos para evitar deformación o ensanchamiento.  
  2. **Pestaña "Temáticas y Equipos" y Contenedor Robusto de Modal Admin (`WhitelistModal.tsx`):**  
     - Overlay seguro `fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-hidden`.  
     - Modal `relative w-full max-w-4xl flex flex-col bg-card rounded-xl shadow-2xl border border-border max-h-full sm:max-h-[90vh]`.  
     - Cabecera, pestañas (`Whitelist` | `Migración a PostgreSQL` | `Temáticas y Equipos`) y footer con `shrink-0`.  
     - Contenedor del cuerpo con `flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 space-y-5`, eliminando desbordamientos de flexbox.  
     - Pestaña `themes` completamente funcional conectada a `GET /api/tournaments/themes`, con formulario de alta (`POST /api/tournaments/teams`) y baja (`DELETE /api/tournaments/themes/:name`).  
  3. **Recarga y Limpieza Visual Inmediata al Abandonar Torneo (`LobbyView.tsx`, `App.tsx`):**  
     - En `LobbyView.tsx`, listener directo a `tournament:abandoned` para resetear al instante `tournament`, `participants`, `count` y disparar `fetchActiveTournament()`.  
     - En `App.tsx`, forzado de remontado limpio de `<LobbyView key={cloudTournament?.id || activeTournamentId || 'clean-lobby'} />` y rehidratación inmediata eliminando cualquier vestigio o estado sucio en los clientes.  
  - Cubre: RF-44, RF-57, RF-58, RF-59, RF-60, RF-91, RF-94, RF-95, RF-118, RF-119, RNF-3.  
  - Hecho cuando: `npx tsc --noEmit` y `npx tsc -p server/tsconfig.json` compilan con 0 errores, y suites de tests de frontend (391 tests) y backend (153 tests) pasan 100% en verde.

- [x] **T45 · Pulido Final Bloque 2: Votaciones Especiales por Formato y Eliminación de Armado Manual Libre**  
  1. **Eliminar `ManualMatchupsPanel` de Todas las Vistas (`BracketView.tsx` y `DoubleEliminationView.tsx`):**  
     - Eliminación completa de la importación y renderizado de `ManualMatchupsPanel`. Los cruces no pueden modificarse fuera del flujo deportivo/sorteo oficial.  
  2. **Formato `Liga + Reducido` (`LEAGUE_PLAYOFFS`): Votación de Clasificados y Cruces Disparejos (`schema.prisma`, `votingHandler.ts`, `VotingView.tsx`, `fixture.ts`, `matchService.ts`):**  
     - Nueva fase en enum `VotePhase.PLAYOFF_SPOTS` (60s) tras ganar `league_playoffs`: votación dinámica de cuántos clasifican al Reducido Final (`2` hasta `N - 1` más opción `'random'`), persistiendo `qualifyingSpots` en `tournament.settings` y encadenando con `THEME`.  
     - En `fixture.ts` (`buildPlayoffMatchesFromQualified`) y `matchService.ts`: generación automática de llaves del Reducido al cerrar la fase regular de liga. Si $K$ es impar o no potencia de 2, los últimos clasificados juegan los partidos extra preliminares ($K=3$: $2^\circ$ vs $3^\circ$ esperando $1^\circ$ en Final; $K=5$: $4^\circ$ vs $5^\circ$ y $2^\circ$ vs $3^\circ$; $K=6$: repechajes $4^\circ$ vs $5^\circ$ y $3^\circ$ vs $6^\circ$).  
  3. **Votación de Armado de Llaves (`BRACKET_METHOD`) y Selector de Casilleros (`bracketSlotHandler.ts`, `BracketSlotPickerView.tsx`, `fixture.ts`):**  
     - Nueva fase en enum `VotePhase.BRACKET_METHOD` (60s) para `BRACKET` y `DOUBLE_ELIMINATION` una vez asignados todos los equipos: `'DIRECT_MATCHUP_DRAW'` ("🎲 Sorteo de Enfrentamientos") vs `'PICK_BRACKET_SLOT'` ("📋 Elegir Ubicación en la Llave por Orden").  
     - Vista interactiva `BracketSlotPickerView.tsx` y handler de sockets `bracketSlotHandler.ts`: ruleta sorteando orden de turnos, banner sincronizado con timer de 20s por jugador, selección de casilleros de 1ra ronda ("cuadraditos") y auto-pick por timeout.  
     - En `fixture.ts`: soporte para `isPreSeeded: true` en `buildBracketSeries` y `buildDoubleEliminationSeries` para respetar exactamente el orden de casilleros elegido por los participantes antes de emitir `fixture:ready`.  
  - Cubre: RF-86, RF-87, RF-99, RF-100, RF-101, RF-103, RF-104, RF-113, RF-118, RF-119.  
  - Hecho cuando: `npx prisma db push` actualiza PostgreSQL con `PLAYOFF_SPOTS` y `BRACKET_METHOD`, `npx tsc --noEmit` y `npx tsc -p server/tsconfig.json` compilan con 0 errores, y suites de tests de frontend (385 tests) y backend (148 tests) pasan 100% en verde.

- [x] **T46 · Pulido Final Bloque 3: Sistema de Sanciones Disciplinarias Acumulativas por Tarjetas Amarillas y Rojas**  
  1. **Persistencia en Base de Datos (`schema.prisma`):**  
     - Agregados campos de disciplina activa en el modelo `Player`: `pendingYellowCards Int @default(0)` y `pendingRedCards Int @default(0)`. Sincronizado en PostgreSQL con `npx prisma db push`.  
  2. **Reglas de Negocio Estrictas y Purga Automática al Confirmar Partido (`matchService.ts`, `tournamentService.ts`):**  
     - Acumulación permanente intra e inter-torneo: las tarjetas amarillas y rojas no se borran al terminar un torneo.  
     - Al confirmar y cerrar un partido no-bye en `matchService.confirmMatch`: se descuenta la sanción cumplida en ese partido (`pendingYellowCards % 4`, `pendingRedCards = 0`) y se suman inmediatamente las nuevas tarjetas recibidas en el partido recién cerrado (`nextPendingYellows = remainingYellows + matchYellows`, `nextPendingReds = remainingReds + matchReds`), actualizando PostgreSQL.  
     - En `tournamentService.getActiveTournament`, `fixture:ready` y `match:closed`: propagación de los campos disciplinarios del jugador y mapa `suspensions` con `suspendedCount = Math.floor(pendingYellowCards / 4) + pendingRedCards`.  
  3. **Alerta Visual en Tarjetas de Partido (`SeriesCard.tsx`, `LeagueMatchCard.tsx`, `fairPlay.ts`, `reducer.ts`):**  
     - En `SeriesCard.tsx` y `LeagueMatchCard.tsx`: para partidos no cerrados (`!confirmed`), visualización de badge de amarillas acumuladas al lado del nombre (ej. `🟨 3/4` o `🟨 4/4`).  
     - Si `suspendedCount >= 1`: visualización de banner/badge de alerta rojo y amarillo muy visible (`animate-pulse`) indicando "🚨 SANCIONADO: Su MEJOR JUGADOR no puede jugar este partido" (o "Sus N MEJORES JUGADORES") especificando el motivo exacto (ej. "4 Amarillas acumuladas" o "1 Tarjeta Roja").  
  - Cubre: RF-61, RF-62, RF-88, RF-105, RF-107, RF-108, RF-110, RF-112, RF-118, RF-Sanciones.  
  - Hecho cuando: `npx prisma db push` actualiza PostgreSQL, `npx tsc --noEmit` y `npx tsc -p server/tsconfig.json` compilan con 0 errores, y suites de tests de frontend (391 tests) y backend (149 tests) pasan 100% en verde.

- [x] **T47 · Pulido Final Bloque 4: Renovación Completa de Tabla y Perfiles, Duelos Directos y Ficha del Jugador**  
  1. **Limpieza de Pestañas y Reset Administrador (`StandingsView.tsx`, `history.ts`):**  
     - Eliminada pestaña redundante "Tabla General" y botón de lobby. Pestaña principal por defecto `Tabla Anual` con selector de año (`all` / todos los años e históricos).  
     - Botón "Resetear Historial" exclusivo para `isAdmin` con confirmación, conectado al endpoint seguro `DELETE /api/history/reset` que limpia `HistoricalStats`, `HeadToHeadRecord`, `AnnualRankingEntry` y torneos completados en PostgreSQL.  
  2. **Duelos Directos (Mano a Mano / H2H) Conectados a PostgreSQL (`historyService.ts`, `routes/history.ts`, `StandingsView.tsx`):**  
     - Endpoints `GET /api/history/players` y `GET /api/history/h2h`, alimentando los selectores con jugadores persistidos y seleccionando automáticamente los primeros dos jugadores.  
     - Cálculo y comparativa visual doble: partidos individuales totales (PJ, PG, PE, PP, GF, GC) y "Paternidad en Mano a Mano" (series eliminatorias jugadas/ganadas/perdidas y definiciones por penales).  
     - Desglose cronológico completo de cruces históricos (`encountersHistory`) con nombre del torneo, fecha, instancia (Final 🏆, SF, etc.), equipos utilizados y resultado.  
  3. **Nueva Pestaña "Perfiles de Jugadores" (`StandingsView.tsx`, `historyService.ts`):**  
     - Ficha de carrera completa accesible por selector o haciendo clic directo sobre el nombre de cualquier jugador en la Tabla Anual.  
     - Resumen de carrera (torneos jugados, títulos 🏆, subcampeonatos 🥈, 3° puestos 🥉, % efectividad y de campeonatos), especialista en Mano a Mano (% efectividad en series y en penales), estadísticas de partidos (PJ, PG, PE, PP, GF, GC, DG, TA, TR), estado disciplinario actual (amarillas y rojas pendientes, suspensión activa) y lista histórica de equipos utilizados y posiciones obtenidas.  
  - Cubre: RF-34, RF-76, RF-77, RF-78, RF-79, RF-88, RF-110, RF-118, RF-Sanciones.  
  - Hecho cuando: `npx tsc --noEmit` y `npx tsc -p server/tsconfig.json` compilan con 0 errores, y suites de tests de frontend (391 tests) y backend (153 tests) pasan 100% en verde.








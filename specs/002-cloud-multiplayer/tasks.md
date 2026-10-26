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

- [x] **T28 · Hotfix Integral: Sincronización Multi-usuario, Cronómetros y Resiliencia en Vivo**  
  Solución de carrera en `SocketContext` para unión a salas, temporizador de 120s en Lobby al llegar a quórum de 4 con transición automática a votación, persistencia de `cloudTournament` y sincronización garantizada de cronómetro en `VotingView`, soporte de formato al azar (`random`) y modalidad de cruces (`SINGLE_MATCH` vs `TWO_LEGGED`), y blindaje del proceso Node.js ante caídas por `ECONNRESET`.  
  - Cubre: RF-96, RF-97, RF-99, RF-100, RF-105, RF-119, RNF-1.  
  - Hecho cuando: 4 o más clientes conectados en simultáneo transicionan juntos de Lobby a Votación de Formato, el cronómetro de 120s se ve en vivo en todos los navegadores, y el servidor no colapsa ante reconexiones.

- [x] **T29 · Hotfix: Cronómetros de 60s, Auto-Recuperación de Sesión en Voto, Cierre con Abstenciones y Navegación Inteligente**  
  Eliminación de la pestaña legacy Registro en Header y App (vista inicial por defecto siempre en Lobby), navegación inteligente que redirige al paso activo del torneo al volver de Reglamento o Tabla, reducción de todos los cronómetros de 120s a 60 segundos, auto-reconstrucción de sesiones de votación en memoria ante reinicios de `tsx watch` evitando errores 400 Bad Request, rehidratación de `myVote` en VotingView, y cierre garantizado e idempotente a los 60s contabilizando votos con abstenciones y avanzando el torneo a `VOTING_THEME`.  
  - Cubre: RF-96, RF-97, RF-98, RF-99, RF-100, RF-101, RF-102, RF-119.  
  - Hecho cuando: Todos los cronómetros cuentan 60s, los votos se emiten y recuperan sin error 400, la votación se cierra al llegar a cero avanzando automáticamente a todos los clientes, y navegar por el Header siempre devuelve al torneo activo.

- [x] **T30 · Hotfix Rápido: Endpoint /api/tournaments/abandon, Limpieza en DB y Botón Global en Header**  
  Creación del endpoint `POST /api/tournaments/abandon` en `tournaments.ts` y `tournamentService.ts` accesible para el Administrador o participantes confirmados, pasando el torneo activo a estado `ABANDONED` en PostgreSQL, limpiando sesiones y cronómetros de memoria (`cancelLobbyTimer`, `cancelVotingSession`), y emitiendo el evento WebSocket `tournament:abandoned` y `tournament:status` (`ABANDONED`) a todos los clientes. Actualización de `Header.tsx` para mostrar el botón rojo "Abandonar / Reiniciar" ante cualquier torneo activo en la nube o local (incluso en `LOBBY` o `VOTING_FORMAT`), limpiando la caché offline (`saveOfflineTournament(null)`), y sincronizando a todos los clientes en `App.tsx` para regresar al Lobby limpio. Limpieza directa ejecutada sobre torneos trabados en la base de datos PostgreSQL.  
  - Cubre: RF-97, RF-98, RF-119, RF-120.  
  - Hecho cuando: El torneo trabado pasa a `ABANDONED`, el botón de reiniciar está visible y operativo en cualquier fase, el endpoint cancela timers y sesiones, y todos los navegadores regresan instantáneamente al Lobby sin datos residuales.




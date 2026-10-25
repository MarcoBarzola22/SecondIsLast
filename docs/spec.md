# Spec 002 — Cloud Multiplayer & Sincronización en Tiempo Real

> Cumple con `docs/constitution.md`. Estado: **Versión Cloud Multi-jugador — Especificación Aprobada**.
> Referencia histórica: Las reglas de torneo base, algoritmos de cruces y métricas matemáticas están definidas en `specs/001-core-tournament/spec.md`.

---

## 1. Contexto y Objetivo

**Second is Last** evoluciona de una SPA offline monousuario a una aplicación web Full-Stack multi-usuario en tiempo real, alojada en la nube y optimizada tanto para celulares como para computadoras de escritorio.

El objetivo de esta épica es permitir que en una juntada física cada participante interactúe desde su propio dispositivo: confirmando su presencia en un lobby, votando el formato y la temática en vivo, observando animaciones sincronizadas de sorteo, y cargando y validando los resultados de sus partidos mediante un mecanismo de doble confirmación (**Handshake Local-Visitante**), sin depender de un administrador para operar y garantizando transparencia e inviolabilidad de los marcadores.

Se mantienen intactas todas las reglas matemáticas de torneos, formatos (Llaves, Liga, Grupos, Liga + Reducido, Doble Eliminación), cálculo de tarjetas (Fair Play), Walkover (0-3), calculadora de escenarios, historial acumulado, distinciones y Ranking Anual ponderado definidos en `specs/001-core-tournament/spec.md`.

---

## 2. Usuarios y Roles

| Rol | Descripción | Permisos Principales |
|---|---|---|
| **Jugador (Player)** | Participante de la juntada autenticado con Google y habilitado en la Whitelist. | Confirmar/cancelar presencia en Lobby, votar formato/temática, presenciar sorteos sincronizados, cargar partidos como Local, confirmar/rechazar partidos como Visitante, declarar auto-walkover, consultar tablas/escenarios/reglamento en vivo o en modo offline. |
| **Administrador (Admin)** | Jugador con privilegios de gestión de grupo e infraestructura básica. | Todas las capacidades de Jugador, más: gestionar la Whitelist de emails, vincular emails a perfiles históricos, remover jugadores ausentes del Lobby antes de iniciar, declarar Walkover administrativo/disciplinario de un jugador ausente físicamente, precargar equipos por temática. **Restricción estricta:** Tiene prohibido editar el tanteador de partidos disputados. |

---

## 3. Historias de Usuario

- **HU-CL-1 Autenticación y Whitelist:** Como jugador autorizado del grupo, quiero ingresar con mi cuenta de Google para acceder a la app de la juntada vinculada a mi perfil histórico de estadísticas, impidiendo el acceso a desconocidos.
- **HU-CL-2 Gestión de Whitelist y Perfiles (Admin):** Como Administrador, quiero agregar o dar de baja correos en la lista blanca y asociarlos a los perfiles de jugadores existentes para mantener la coherencia del historial acumulado.
- **HU-CL-3 Lobby de Asistencia y Quórum Autónomo:** Como participante en la juntada, quiero confirmar mi presencia desde mi celular o PC para formar quórum ($\ge 4$ jugadores) e iniciar la votación sin depender obligatoriamente de que el Admin esté presente.
- **HU-CL-4 Votación y Sorteos en Tiempo Real con Filtro de Validez:** Como participante en el lobby, quiero votar el formato y temática con un temporizador visible, descartando automáticamente formatos no válidos para la cantidad de jugadores presentes, y ver los sorteos sincronizados al unísono con todos los dispositivos.
- **HU-CL-5 Carga y Handshake de Partidos Atómico con Penales:** Como jugador Local, quiero cargar el resultado, tarjetas y eventual ganador de penales de mi partido, y como jugador Visitante, quiero confirmar o rechazar dicho resultado en mi pantalla con protección contra condiciones de carrera.
- **HU-CL-6 Avance Secuencial Ágil y Auto-liquidación de Byes:** Como competidor, quiero poder avanzar y jugar mi partido de la siguiente fecha apenas termine y confirme el anterior (si mi próximo rival ya está libre), asegurando que los pases directos (Byes) se liquiden de inmediato para no quedar bloqueado.
- **HU-CL-7 Gestión de Walkovers:** Como participante o administrador, si un jugador se retira de la juntada o abandona, quiero que se aplique el Walkover reglamentario (por auto-declaración o por decisión administrativa) autoconfirmando sus partidos en 0-3 y liberando a sus rivales de inmediato.
- **HU-CL-8 Consulta del Reglamento Oficial y Resiliencia Offline:** Como jugador, quiero disponer de una sección con el reglamento oficial de la casa acordado por el grupo y poder consultar llaves y tablas aun si la conexión a internet sufre una caída temporal en plena juntada.

---

## 4. Requisitos Funcionales (EARS)

### 4.1 Autenticación y Control de Acceso (HU-CL-1, HU-CL-2)

- **RF-88 (Autenticación Google OAuth):** El sistema deberá permitir la autenticación de usuarios exclusivamente mediante el proveedor de identidad Google OAuth 2.0.
- **RF-89 (Validación de Whitelist Estricta):** Al autenticarse un usuario, si su dirección de correo electrónico no se encuentra registrada en la lista blanca (`whitelist`), el sistema deberá denegar el acceso a la aplicación y mostrar un mensaje explicativo en español rioplatense ("No estás en la lista blanca de la juntada. Pedile al admin que te habilite").
- **RF-90 (Vinculación de Perfil Histórico):** Cuando un usuario autorizado inicia sesión por primera vez, el sistema deberá asociar su cuenta de Google a su perfil de jugador histórico persistente, preservando su historial de partidos, H2H, podios y Ranking Anual.
- **RF-91 (Panel de Administración de Whitelist):** Mientras el usuario autenticado posea rol de Administrador, el sistema deberá proveer un panel de configuración para registrar nuevos correos autorizados, desactivar correos y vincular cada correo al perfil de jugador correspondiente.
- **RF-92 (Configuración Inicial de Administrador):** El sistema deberá establecer al Administrador inicial mediante la configuración base del servidor (variable de entorno/seed).

### 4.2 Lobby de Asistencia y Quórum (HU-CL-3)

- **RF-93 (Lobby de Asistencia):** Al ingresar al Lobby de una nueva juntada, el sistema deberá permitir a cada jugador marcar su asistencia mediante la acción "Confirmar presencia".
- **RF-94 (Persistencia de Presencia ante Desconexión):** Mientras el torneo no haya comenzado, el estado de presencia confirmada de un jugador permanecerá activo e inalterado en el servidor aunque el dispositivo se desconecte, cierre la pestaña o bloquee la pantalla.
- **RF-95 (Cancelación y Expulsión del Lobby):** Antes de iniciarse el torneo:
  - El sistema deberá permitir al jugador revocar voluntariamente su asistencia mediante "Cancelar presencia".
  - El sistema deberá permitir al Administrador remover del Lobby a cualquier jugador confirmado.
- **RF-96 (Regla de Quórum Mínimo):** Mientras la cantidad de jugadores confirmados en el Lobby sea menor a 4 ($N < 4$), el sistema mantendrá deshabilitado el inicio de la competencia.
- **RF-97 (Unicidad de Torneo Activo):** El sistema permitirá crear un nuevo Lobby únicamente si no existe ningún torneo activo en curso. Mientras haya un torneo activo en disputa, el sistema bloqueará la creación de un nuevo torneo o lobby.
- **RF-98 (Autonomía de Apertura e Inicio):** Si no hay un torneo activo, cualquier jugador habilitado podrá abrir el Lobby. Al alcanzarse el quórum ($N \ge 4$), cualquier participante confirmado podrá iniciar la fase de votación sin requerir la presencia ni acción del Administrador.

### 4.3 Votaciones, Sorteos y Filtro de Formatos Válidos (HU-CL-4)

- **RF-99 (Votación de Formato de Torneo y Filtrado de Opciones):** Al iniciarse la selección de formato, el sistema abrirá un período de votación con un temporizador visible de 120 segundos. Las opciones presentadas y admitidas dependerán estrictamente de la cantidad de confirmados $N$:
  - Si $N \neq 6$ y $N \neq 9$, la opción "Fase de Grupos" quedará excluida de la votación y del sorteo aleatorio.
  - Si por empate o sorteo resultara electo un formato matemáticamente incompatible con $N$, el sistema descartará automáticamente la opción y desempatará al azar entre los formatos válidos para dicha cantidad de participantes.
- **RF-100 (Cierre de Votación de Formato):** El sistema cerrará la votación de formato inmediatamente cuando ocurra la primera de estas dos condiciones:
  1. Haya transcurrido el tiempo límite de 120 segundos.
  2. El 100% de los participantes confirmados haya emitido su voto.
- **RF-101 (Desempate Aleatorio en Votación):** Si al cerrarse la votación existe un empate en votos entre dos o más formatos con mayor puntuación, el sistema seleccionará automáticamente y al azar con distribución uniforme uno de los formatos empatados válidos.
- **RF-102 (Definición de Temática):** Concluido el formato, el sistema someterá a votación la temática (o la opción de sorteo de temática) bajo las mismas reglas del temporizador de 120 segundos o votación unánime, desempatando al azar en caso de paridad.
- **RF-103 (Precarga y Previsualización de Equipos):** El sistema permitirá al Administrador precargar los listados de equipos para cada temática. Antes de ejecutarse el sorteo o asignación de equipos, el sistema exhibirá en las pantallas de todos los participantes una previsualización de los equipos disponibles para la temática elegida.
- **RF-104 (Animaciones Sincronizadas en Tiempo Real):** Al ejecutarse un sorteo (desempate de votación, ruleta de temática, armado de cruces o asignación/draft de equipos), el servidor emitirá un evento en tiempo real vía WebSockets para que todos los dispositivos conectados (móviles y PC) reproduzcan la animación de forma simultánea.

### 4.4 Handshake de Partidos, Penales y Versionado Anti-Carreras (HU-CL-5)

- **RF-105 (Handshake Atómico por Partido y Series Ida/Vuelta):** En cualquier formato (incluyendo series de Ida y Vuelta), el handshake se realizará de manera atómica e independiente por cada partido individual:
  - En el partido de Ida, el Jugador A es Local y el Jugador B es Visitante.
  - En el partido de Vuelta, el Jugador B es Local y el Jugador A es Visitante.
- **RF-106 (Exclusividad de Carga para el Local):** Para cualquier partido en estado "Pendiente de carga", el sistema habilitará únicamente al jugador asignado como Local (Home) la interfaz para registrar el marcador (goles enteros de 0 a 99), las tarjetas amarillas y rojas (enteros $\ge 0$), y el ganador de penales (`penaltiesWinner`) si el partido requiriese desempate directo por penales.
- **RF-107 (Envío y Estado de Handshake):** Al presionar el Local "Enviar resultado", el partido pasará inmediatamente a estado "Pendiente de confirmación", notificando al rival en tiempo real e incrementando la versión del estado del partido (`version`).
- **RF-108 (Validación Completa del Visitante):** Mientras un partido se encuentre en estado "Pendiente de confirmación", el sistema habilitará en la pantalla del jugador Visitante (Away) el detalle completo de goles, tarjetas y eventual ganador de penales, junto a los botones "Confirmar" y "Rechazar".
- **RF-109 (Protección contra Condiciones de Carrera por Versionado):** Toda petición de confirmación o rechazo enviada por el Visitante deberá incluir el número de versión (`expectedVersion`) del partido. Si el Local modificó el resultado milisegundos antes provocando un cambio de versión, el servidor rechazará la confirmación del Visitante con un error de estado obsoleto (409 Conflict), obligando al cliente del Visitante a rehidratar los datos actualizados.
- **RF-110 (Cierre Definitivo de Partido):** Al presionar el Visitante "Confirmar" con versión válida:
  - El sistema marcará el partido como "Cerrado" (definitivo e inmutable).
  - El sistema actualizará de inmediato la tabla de posiciones, el cuadro de llaves y las estadísticas acumuladas.
  - El sistema emitirá el estado actualizado en tiempo real a todos los clientes conectados.
- **RF-111 (Rechazo de Handshake):** Si el Visitante presiona "Rechazar" con versión válida, el sistema revertirá el partido a estado "Pendiente de carga", incrementará la versión y permitirá que el Local vuelva a editar y reenviar el resultado luego del diálogo presencial.
- **RF-112 (Inviolabilidad de Resultados por Admin):** El Administrador tiene estrictamente prohibido alterar, editar o sobreescribir el tanteador o estadísticas de partidos disputados.

### 4.5 Bloqueo Secuencial por Jugador y Auto-liquidación de Byes (HU-CL-6)

- **RF-113 (Auto-liquidación de Pases Directos - Byes):** Al generar el fixture o cuadro de llaves (Llaves o Doble Eliminación), cualquier serie donde un participante tenga un "Pase directo" (Bye) se marcará automáticamente en el servidor como "Cerrada" de inmediato, avanzando al participante a la siguiente ronda sin esperar acción manual y evitando bloqueos de avance.
- **RF-114 (Bloqueo Secuencial Individual):** El sistema bloqueará la carga y confirmación de cualquier partido correspondiente a la Fecha o Ronda $N+1$ para un jugador determinado (sea como local o como visitante) mientras dicho jugador tenga su partido de la Fecha o Ronda $N$ en estado distinto de "Cerrado".
- **RF-115 (Desacoplamiento de Fecha Global):** Si dos jugadores ya cerraron sus respectivos partidos de la Fecha $N$ y deben enfrentarse en la Fecha $N+1$, el sistema habilitará de inmediato la carga de dicho partido, con independencia de que otros participantes de la mesa sigan disputando la Fecha $N$.

### 4.6 Gestión de Walkovers y Desconexión (HU-CL-7)

- **RF-116 (Vías de Declaración de Walkover):** El sistema permitirá declarar el Walkover de un participante activo únicamente mediante dos vías reglamentarias:
  1. **Auto-declaración:** El propio jugador pulsa "Abandonar torneo" desde su dispositivo con diálogo de confirmación estricta.
  2. **Acción de Administrador:** El Administrador declara el abandono administrativo o disciplinario de un jugador ausente físicamente.
- **RF-117 (Autoconfirmación y Desbloqueo por Walkover):** Al ejecutarse el Walkover de un jugador:
  - Todos sus partidos en el torneo activo (previos, en curso y futuros) se registrarán como derrotas 0-3 (con 3 goles a favor y 0 en contra para el rival, sin tarjetas).
  - Todos dichos partidos pasarán a estado "Cerrado" de forma automática sin requerir confirmación de handshake por parte de los rivales.
  - Los rivales de dichos partidos quedarán desbloqueados de inmediato para avanzar en sus siguientes fechas o rondas.
  - Las tablas de posiciones y cuadros se recalcularán de forma inmediata.

### 4.7 Reglamento, Soporte Multiplataforma y Modo Offline (HU-CL-8, Transversal)

- **RF-118 (Sección de Reglamento Oficial):** El sistema proveerá una vista de acceso público para todos los usuarios autenticados que exhibirá el reglamento oficial de la casa acordado por el grupo (documento estático de solo lectura).
- **RF-119 (Paridad Responsive Móvil y Desktop):** La interfaz deberá ofrecer paridad funcional total y adaptación de diseño en smartphones (vistas optimizadas para carga táctil rápida) y en computadoras de escritorio/laptops (pantallas anchas de la juntada).
- **RF-120 (Tolerancia a Caídas de Red y Modo Offline en Cliente):** El cliente frontend mantendrá en caché local una réplica del estado más reciente del torneo. Ante un corte de internet o caída de AWS:
  - La interfaz exhibirá un banner destacado de "Modo Offline (Sin conexión)".
  - Se inhabilitarán temporalmente todas las mutaciones (carga de resultados, votos y confirmaciones).
  - Se garantizará la navegación y lectura fluida de llaves, tablas de posiciones, escenarios y estadísticas acumuladas sin crashear.
  - Al restablecerse la conectividad, el cliente rehidratará automáticamente el estado del servidor.

---

## 5. Requisitos No Funcionales (RNF)

- **RNF-1 (Sincronización en Tiempo Real):** La latencia de distribución de eventos WebSocket (votos, sorteos, envíos de handshake y actualizaciones de tabla) deberá ser inferior a 300 ms en condiciones normales de red.
- **RNF-2 (Consistencia Transaccional y Control de Concurrencia):** Toda confirmación de partido o aplicación de Walkover deberá procesarse en transacciones atómicas relacionales en la base de datos (PostgreSQL vía Prisma), implementando versionado optimista (`version`) para impedir escrituras concurrentes conflictivas.
- **RNF-3 (Resiliencia ante Desconexión en Juntada):** Si un cliente pierde la conexión WebSocket por bloqueo de pantalla o baja cobertura de red, el cliente intentará reconectarse automáticamente con backoff exponencial. Al reconectar, rehidratará el estado más reciente del torneo desde el servidor sin reiniciar la app ni perder datos en pantalla.
- **RNF-4 (Seguridad de API y WebSockets):** Toda petición HTTP y conexión WebSocket deberá validar el token de sesión autenticado y verificar que el usuario pertenezca a la Whitelist activa.
- **RNF-5 (Tipado Estricto de Punta a Punta):** El 100% de los modelos de dominio, contratos de mensajes WebSocket y esquemas de persistencia deberán estar definidos en TypeScript estricto, compartiendo la lógica pura de `src/domain/` entre cliente y servidor.

---

## 6. Casos Límite (Edge Cases)

1. **Visitante rechaza el partido repetidamente:** El partido vuelve a "Pendiente de carga". Si los jugadores no logran ponerse de acuerdo presencialmente, el partido permanece bloqueado para ambos, impidiéndoles avanzar a la fecha siguiente según la regla de bloqueo secuencial (RF-114) hasta que consensúen y confirmen el resultado real.
2. **Local se queda sin batería o sin conexión justo antes de cargar:** Dado que la carga inicial está restringida al Local (RF-106):
   - El jugador Local puede iniciar sesión desde la computadora de la juntada u otro dispositivo prestado para cargar el marcador.
   - Si el jugador se retiró de la juntada o no tiene intenciones de cargar, el Admin puede aplicar el Walkover administrativo (RF-116 vía 2), cerrando el partido 0-3 y liberando al Visitante.
3. **Cierre de votación con 0 votos emitidos en 120 segundos:** Si transcurren los 120 segundos sin que nadie vote, el sistema aplicará un sorteo aleatorio con distribución uniforme entre todos los formatos matemáticamente válidos para $N$.
4. **Desconexión durante una animación de sorteo:** Si un jugador pierde conexión mientras se ejecuta la animación de sorteo, al reconectarse recibirá el estado resuelto del servidor, visualizando directamente el resultado definitivo sin quedar atrapado en la animación.
5. **Intento de inicio de torneo simultáneo:** Si dos usuarios intentan abrir o iniciar un torneo al mismo tiempo, el servidor serializará las peticiones y rechazará la segunda con un mensaje informando que ya existe un torneo en curso.

---

## 7. Fuera de Alcance (Out of Scope)

- Chat, comentarios o mensajería de texto interna dentro de la aplicación (los usuarios comparten el mismo espacio físico en la juntada).
- Notificaciones Push nativas del sistema operativo del celular (la sincronización y avisos operan mediante WebSockets en la pestaña de la aplicación).
- Múltiples torneos activos en paralelo (solo existe un torneo en curso a nivel global para preservar la integridad del Ranking Anual).
- Edición o alteración arbitraria de resultados de partidos por parte del Administrador.
- Registro público abierto o inicio de sesión anónimo (acceso limitado exclusivamente a cuentas verificadas en Whitelist).

---

## 8. Criterios de Finalización (Definition of Done)

- [x] Autenticación Google OAuth integrada con validación estricta de Whitelist.
- [x] Panel de administración de Whitelist operativo con vinculación a perfiles de jugadores históricos.
- [x] Lobby de asistencia con persistencia de presencia ante desconexiones y regla de quórum ($\ge 4$).
- [x] Votación de formato y temática en tiempo real con temporizador de 120 segundos, descarte de formatos inválidos para $N$ y desempate aleatorio.
- [x] Visualización sincronizada de animaciones de sorteo en todos los clientes conectados.
- [x] Precarga y previsualización de equipos asociados a cada temática.
- [x] Handshake atómico por partido con registro de `penaltiesWinner` y control de concurrencia optimista por `version`.
- [x] Auto-liquidación inmediata de Byes y bloqueo secuencial por jugador funcionando.
- [x] Dos vías de Walkover operativas (auto-declaración y admin) con autoconfirmación en 0-3 y liberación de rivales.
- [x] Modo Offline en frontend con banner visual y bloqueo seguro de mutaciones ante caídas de red.
- [x] Sección de Reglamento oficial disponible para consulta de solo lectura.
- [x] Interfaz completamente adaptada para navegación en celular y en computadora.
- [x] Suite de pruebas unitarias sobre lógica de dominio y pruebas de integración sobre endpoints y eventos de WebSocket.

---

## 9. Dudas Abiertas

- **Ninguna.** Todos los hallazgos del reporte de QA fueron resueltos mediante las 5 decisiones de negocio vinculantes.

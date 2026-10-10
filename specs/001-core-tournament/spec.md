# Spec 001 — Core Tournament (MVP)

> Cumple con `docs/constitution.md`. Estado: **Borrador para aprobación**.

## 1. Contexto y Objetivo

**Second is Last** es una SPA offline para organizar torneos de PES 6 entre amigos en una sola juntada. La maqueta (`pixel-perfect-screenshot-main`) es solo la base visual. Toda la lógica se reescribe según esta spec.

**Objetivo:** que esta noche funcione de punta a punta el flujo **Registro → Temática → Draft → Llaves → Tabla**, guardado en `localStorage` y aguantando recargas de página sin perder datos.

**Fuera de alcance:** backend, cuentas de usuario, más de 10 o menos de 4 jugadores, regla del gol de visitante, cargar goles de penales en el resultado global, ver torneos pasados en detalle.

## 2. Glosario

| Término | Definición |
|---|---|
| Jugador | Persona registrada con Nombre y Apellido. Se guarda entre torneos. |
| Participante | Jugador elegido para el torneo activo. |
| Modalidad de Torneo | Formato de competencia: "Llaves (Bracket asimétrico)" o "Liga (Todos contra todos)". |
| Modalidad de Partido | Formato de serie en Llaves: "Ida y Vuelta" (2 partidos) o "Partido Único" (1 partido). |
| Llave (serie) | Cruce entre 2 participantes en modalidad Llaves (a Ida y Vuelta o Partido Único). |
| Liga (Round Robin) | Todos contra todos a una o dos ruedas. Cada participante juega contra cada uno de los demás. |
| Global | Suma de los goles de ambos partidos (en Ida y Vuelta) o resultado directo (en Partido Único). |
| Bye | Pase directo a la siguiente ronda (Semis o Cuartos) sin jugar la fase previa. |
| Sorteo Automático de Equipos | Asignación aleatoria de N equipos ingresados manualmente por el organizador a los N participantes. |
| Torneo activo | El único torneo en curso. Puede no haber ninguno. |

## 3. Historias de Usuario

- **HU-1 Registro y Gestión de Jugadores:** Como organizador, quiero cargar jugadores (Nombre y Apellido), borrar jugadores obsoletos y elegir entre 4 y 10 participantes y las modalidades del torneo, para armar la competencia de la juntada.
- **HU-2 Temática y Asignación de Equipos:** Como organizador, quiero sortear una temática y definir los equipos de los participantes ya sea por elección por turnos (Draft manual) o mediante sorteo automático de equipos ingresados manualmente.
- **HU-3 Jugar Torneo (Llaves o Liga):** Como participante, quiero ver el fixture/cuadro según la modalidad elegida (Llaves a Ida y Vuelta o Partido Único, o Liga Todos contra Todos), cargar los resultados y que el sistema calcule posiciones y avance automáticamente.
- **HU-4 Ver y Gestionar Tabla Histórica:** Como grupo, queremos ver la tabla histórica acumulada y poder resetearla con confirmación estricta cuando queramos empezar una temporada desde cero.

## 4. Requisitos Funcionales (EARS)

### 4.1 Registro y Configuración de Jugadores (HU-1)

- **RF-1:** El sistema deberá permitir registrar un jugador con **Nombre** y **Apellido**, ambos obligatorios.
- **RF-2:** Si el Nombre o el Apellido están vacíos o tienen solo espacios, entonces el sistema deberá bloquear el registro y mostrar un mensaje de validación.
- **RF-3:** Si ya existe un jugador con el mismo Nombre y Apellido (sin distinguir mayúsculas, acentos ni espacios de más), entonces el sistema deberá rechazar el duplicado y avisar.
- **RF-4:** El sistema deberá guardar el registro de jugadores en `localStorage` para que esté disponible en torneos futuros.
- **RF-5:** El sistema deberá permitir marcar y desmarcar jugadores registrados como participantes del torneo.
- **RF-6:** Mientras la cantidad de participantes no esté entre 4 y 10 inclusive, el sistema deberá deshabilitar el botón para avanzar a Temática e indicar cuántos faltan o sobran.
- **RF-46:** El sistema deberá permitir eliminar un jugador registrado mediante un botón de borrado en la lista. Si el jugador está seleccionado como participante o existe un torneo activo en curso con dicho participante, el borrado deberá bloquearse o deseleccionarlo antes de confirmar. Al eliminar un jugador, sus estadísticas acumuladas deberán limpiarse.
- **RF-48:** Al configurar el torneo en Registro, el sistema deberá permitir elegir la **Modalidad de Torneo**: "Llaves (Bracket)" o "Liga (Todos contra todos)".
- **RF-49:** Al configurar el torneo en Registro, el sistema deberá permitir elegir la **Modalidad de Partido**: "Ida y Vuelta" o "Partido Único", disponible tanto para la modalidad Llaves como para Liga.
- **RF-59:** El selector de Modalidad de Partido en Registro deberá permanecer siempre visible sin importar si se eligió Llaves o Liga, adaptando su descripción explicativa a cada formato.

### 4.2 Temática (HU-2)

- **RF-7:** El sistema deberá ofrecer una lista fija de temáticas base: "Clásicos PES 6", "Apertura 2006", "Europa Actual", "Selecciones Mundial 06", "Solo Sudamérica".
- **RF-8:** Cuando el organizador toque "Girar ruleta", el sistema deberá elegir una temática al azar con distribución uniforme sobre el repertorio completo de temáticas disponibles.
- **RF-9:** El sistema deberá permitir volver a girar la ruleta todas las veces que se quiera antes de confirmar.
- **RF-10:** Mientras no haya una temática elegida, el sistema deberá deshabilitar el avance a la fase de Equipos/Draft.
- **RF-56:** En la fase de Temática, el sistema deberá mostrar de forma visible la lista de todas las temáticas disponibles actualmente (base y personalizadas) en forma de badges o chips.
- **RF-57:** El sistema deberá proveer un campo de texto y un botón "Agregar" para que el organizador pueda incorporar nuevas temáticas personalizadas. No se permitirán nombres vacíos ni duplicados (sin distinguir mayúsculas ni espacios redundantes).
- **RF-58:** Al agregar una temática personalizada, el sistema deberá guardarla en el estado y persistirla en `localStorage` (`customThemes`), incluyéndola inmediatamente en el sorteo de la ruleta.

### 4.3 Asignación de Equipos / Draft (HU-2)

- **RF-11:** Cuando se entra a la fase de Equipos por primera vez, el sistema deberá ofrecer dos métodos de asignación: "Asignación Manual (por turnos)" y "Sorteo Automático".
- **RF-12:** En Asignación Manual, el sistema deberá sortear el orden de elección con Fisher-Yates, mostrar el turno activo y permitir escribir el nombre del equipo (texto libre obligatorio, único por torneo).
- **RF-13:** Cuando un participante confirma su equipo en Asignación Manual, el turno pasa al siguiente.
- **RF-14:** Si el nombre del equipo está vacío o ya lo eligió otro participante del mismo torneo (sin distinguir mayúsculas), entonces el sistema deberá rechazarlo y avisar.
- **RF-15:** Cuando todos los participantes tienen equipo, el sistema deberá habilitar el avance a la fase de competencia ("Iniciar Llaves" o "Iniciar Liga").
- **RF-52:** En Sorteo Automático, el sistema deberá mostrar un formulario rápido para que el organizador ingrese exactamente N nombres de equipos (donde N = cantidad de participantes). Ningún nombre puede estar vacío ni repetirse. Al confirmar ("Sortear y asignar"), el sistema mezclará los equipos con Fisher-Yates y los asignará aleatoriamente a los participantes, completando la fase de asignación de equipos.

### 4.4 Generación y Desarrollo de Llaves (HU-3 - Modo Llaves)

- **RF-17:** Cuando el organizador avance a Llaves, el sistema deberá mezclar a los participantes con Fisher-Yates y armar el cuadro según la cantidad de participantes (4 a 10) con Byes, Octavos y Cuartos según corresponda:
  - **4 participantes (Base 4):** 0 Byes, 0 Cuartos, 2 Semifinales (SF1: P0 vs P1, SF2: P2 vs P3), Final y 3er Puesto.
  - **5 participantes (Base 8):** 3 Byes a Semis (P2, P3, P4), 1 Cuartos (QF1: P0 vs P1 -> SF1.a), SF1: QF1.win vs P2, SF2: P3 vs P4.
  - **6 participantes (Base 8):** 2 Byes a Semis (P4, P5), 2 Cuartos (QF1: P0 vs P1 -> SF1.a, QF2: P2 vs P3 -> SF2.a), SF1: QF1.win vs P4, SF2: QF2.win vs P5.
  - **7 participantes (Base 8):** 1 Bye a Semis (P6 -> SF2.b), 3 Cuartos (QF1: P0 vs P1 -> SF1.a, QF2: P2 vs P3 -> SF1.b, QF3: P4 vs P5 -> SF2.a), SF1: QF1.win vs QF2.win, SF2: QF3.win vs P6.
  - **8 participantes (Base 8):** 0 Byes, 4 Cuartos (QF1: P0 vs P1 -> SF1.a, QF2: P2 vs P3 -> SF1.b, QF3: P4 vs P5 -> SF2.a, QF4: P6 vs P7 -> SF2.b), SF1: QF1.win vs QF2.win, SF2: QF3.win vs QF4.win.
  - **9 participantes (Base 16):** 7 Byes a Cuartos (P2..P8), 1 Octavos (R16_1: P0 vs P1 -> QF1.a), QF1: R16_1.win vs P2 -> SF1.a, QF2: P3 vs P4 -> SF1.b, QF3: P5 vs P6 -> SF2.a, QF4: P7 vs P8 -> SF2.b.
  - **10 participantes (Base 16):** 6 Byes a Cuartos (P4..P9), 2 Octavos (R16_1: P0 vs P1 -> QF1.a, R16_2: P2 vs P3 -> QF3.a), QF1: R16_1.win vs P4 -> SF1.a, QF2: P5 vs P6 -> SF1.b, QF3: R16_2.win vs P7 -> SF2.a, QF4: P8 vs P9 -> SF2.b.
- **RF-18:** El sistema deberá crear siempre una Final (ganadores de Semis) y un partido por el 3er Puesto (perdedores de Semis).
- **RF-19:** El sistema deberá mostrar en el cuadro a los participantes con Bye marcados como "Pase directo".
- **RF-20:** Una vez sorteadas las llaves, el sistema no deberá permitir volver a sortearlas en el torneo activo.
- **RF-21:** En modalidad "Ida y Vuelta", el sistema deberá tratar cada llave con campos de goles para Ida y Vuelta. En modalidad "Partido Único", la UI del bracket solo renderizará los inputs de un único partido por llave.
- **RF-22:** El sistema deberá aceptar solo goles enteros entre 0 y 99. Si se ingresa otro valor, deberá marcar el campo como inválido y no confirmar.
- **RF-23:** Mientras falten goles de la serie (sea 1 partido o 2 según la modalidad), el sistema deberá deshabilitar "Confirmar llave".
- **RF-24:** El sistema deberá calcular y mostrar el Global en tiempo real (suma de Ida y Vuelta, o resultado de Partido Único).
- **RF-25:** Cuando la serie quede empatada, el sistema deberá mostrar un selector obligatorio para marcar quién ganó por penales y no dejar confirmar hasta elegir.
- **RF-26:** Cuando se confirma una llave, el sistema deberá pasar al ganador (y en Semis al perdedor) a la serie correspondiente.
- **RF-27:** Una llave solo se podrá habilitar para cargar resultados cuando sus dos participantes estén definidos.
- **RF-28:** Mientras la serie a la que alimenta una serie confirmada no tenga goles cargados, el sistema deberá permitir corregirla y recalcular quién avanza.
- **RF-29:** Los goles de penales no deberán sumarse al Global ni a GF/GC.
- **RF-60:** En `BracketView`, cuando el torneo tenga 9 o 10 participantes, el sistema deberá renderizar una columna previa para los "Octavos de Final" (Play-in) antes de la columna de Cuartos de Final, adaptando el ancho del contenedor para un scroll horizontal fluido.

### 4.5 Generación y Desarrollo de Liga (HU-3 - Modo Liga)

- **RF-50:** Cuando el torneo sea en modalidad Liga, el sistema deberá generar el fixture Round Robin mediante algoritmo Berger para 4 a 10 participantes según la Modalidad de Partido elegida:
  - **A Partido Único (Una Rueda):**
    - 4 participantes: 3 fechas, 2 partidos por fecha (6 partidos).
    - 5 participantes: 5 fechas, 2 partidos por fecha, 1 libre por fecha (10 partidos).
    - 6 participantes: 5 fechas, 3 partidos por fecha (15 partidos).
    - 7 participantes: 7 fechas, 3 partidos por fecha, 1 libre por fecha (21 partidos).
    - 8 participantes: 7 fechas, 4 partidos por fecha (28 partidos).
    - 9 participantes: 9 fechas, 4 partidos por fecha, 1 libre por fecha (36 partidos).
    - 10 participantes: 9 fechas, 5 partidos por fecha (45 partidos).
  - **A Ida y Vuelta (Doble Round Robin):**
    - Se disputan todas las fechas de ida y luego se repiten las mismas fechas en una segunda rueda invirtiendo la localía (el local pasa a visitante):
    - 4 participantes: 6 fechas, 2 partidos por fecha (12 partidos).
    - 5 participantes: 10 fechas, 2 partidos por fecha, 1 libre por fecha (20 partidos).
    - 6 participantes: 10 fechas, 3 partidos por fecha (30 partidos).
    - 7 participantes: 14 fechas, 3 partidos por fecha, 1 libre por fecha (42 partidos).
    - 8 participantes: 14 fechas, 4 partidos por fecha (56 partidos).
    - 9 participantes: 18 fechas, 4 partidos por fecha, 1 libre por fecha (72 partidos).
    - 10 participantes: 18 fechas, 5 partidos por fecha (90 partidos).
- **RF-51:** Cada partido de liga se jugará a partido único con carga de goles (0-99). Los partidos de liga admiten empate (no hay definición por penales en fase regular de liga).
- **RF-53:** El sistema deberá calcular en tiempo real una Tabla de Posiciones interna del torneo con las columnas: Pos, Participante (con equipo), PTS, PJ, PG, PE, PP, GF, GC, DG.
  - Reglas de puntaje en liga: PG = 3 pts, PE = 1 pt, PP = 0 pts.
  - Criterio de ordenamiento: PTS ↓, DG ↓, GF ↓, nombre alfabético.
- **RF-54:** Mientras no haya partidos posteriores que dependan de un resultado o hasta finalizar el torneo, el organizador podrá corregir o editar el resultado de un partido confirmado de la liga.
- **RF-55:** Cuando todos los partidos de la liga estén confirmados, el sistema definirá el Podio a partir de las posiciones de la tabla de la liga: 1° Campeón, 2° Subcampeón, 3° Tercer Puesto, 4° Cuarto Puesto, y habilitará el botón "Finalizar torneo".

### 4.6 Cierre del torneo y Tabla Histórica (HU-4)

- **RF-30:** Cuando concluya la competencia (Final y 3er Puesto en Llaves, o todas las fechas en Liga), el sistema deberá mostrar el podio (Campeón, Subcampeón, 3er y 4to Puesto) y un botón "Finalizar torneo".
- **RF-31:** Cuando el organizador toque "Finalizar torneo", el sistema deberá sumar a la tabla histórica acumulada las estadísticas de todos los participantes:
  - **PTS:** Campeón +10, Subcampeón +7, 3er Puesto +5, 4to Puesto +3, eliminados en Cuartos o 5to a 10mo puesto de Liga +1. Eliminados en Octavos (Play-in de 9 o 10 participantes) reciben 0 PTS por posición (+1 TJ por participar).
  - **PJ:** Partidos/series jugadas (+1 por cada llave en modo Llaves; +1 por cada partido jugado en modo Liga).
  - **PG / PP:** +1 PG al ganador y +1 PP al perdedor. En modo Liga, los partidos empatados suman en PJ pero no suman ni PG ni PP en la tabla histórica (manteniendo el formato exacto de columnas de RF-34).
  - **GF / GC:** goles a favor y en contra acumulados en todos los partidos disputados.
  - **DG:** GF − GC.
  - **TJ:** +1 a cada participante del torneo.
- **RF-32:** El sistema deberá contar el partido por el 3er Puesto como una llave más para estadísticas.
- **RF-33:** El sistema deberá guardar un resumen del torneo finalizado (fecha, modalidad de torneo, modalidad de partido, temática, participantes, equipos, podio) en el historial de `localStorage` y borrar el torneo activo.
- **RF-34:** El sistema deberá mostrar la tabla con estas columnas exactas: **Rank, JUGADORES, PTS, PJ, PG, PP, GF, GC, DG, TJ**.
- **RF-35:** El sistema deberá mostrar la columna JUGADORES con el formato "Apellido, Nombre".
- **RF-36:** El sistema deberá ordenar la tabla por PTS (de mayor a menor), luego DG, luego GF, y por último Apellido alfabéticamente. Rank va de 1 a N.
- **RF-37:** El sistema deberá mostrar en la tabla solo a los jugadores con TJ ≥ 1.
- **RF-38:** El sistema deberá dejar ver la Tabla en cualquier momento, aunque haya un torneo activo.
- **RF-47:** En la vista Tabla, el sistema deberá proveer un botón "Resetear historial" con confirmación estricta (`window.confirm`). Al confirmar, se eliminarán todos los registros históricos (`stats` e `history`), dejando la tabla en cero. Los jugadores registrados se mantienen intactos.

### 4.7 Persistencia y Robustez (transversal)

- **RF-39:** Cuando cambie el estado del torneo activo, del registro o de la tabla, el sistema deberá guardarlo en `localStorage` a través del adaptador de `src/storage/`.
- **RF-40:** Cuando se cargue la app y haya un torneo activo guardado, el sistema deberá retomarlo en el paso donde quedó (Temática, Draft/Equipos, Llaves o Liga).
- **RF-41:** Si los datos de `localStorage` faltan, están corruptos o tienen un `schemaVersion` desconocido, entonces el sistema deberá usar valores por defecto vacíos, dejar el error en consola y seguir andando.
- **RF-42:** Si falla una escritura en `localStorage`, el sistema deberá mantener el estado en memoria, dejar el error en consola y no interrumpir a la UI.
- **RF-43:** Si se produce un error de render no controlado, el sistema deberá mostrar una pantalla de recuperación (Error Boundary) con un botón "Reintentar".
- **RF-44:** Mientras haya un torneo activo, el sistema deberá ofrecer "Abandonar torneo" con confirmación. Al aceptar, deberá borrar el torneo activo sin tocar la tabla histórica.
- **RF-45:** Mientras haya un torneo activo en Draft, Llaves o Liga, el sistema no deberá permitir cambiar los participantes, las modalidades ni la temática.

## 5. Criterios de Finalización (Definition of Done)

- [ ] Se pueden registrar y eliminar jugadores registrados; no se puede eliminar a un participante de un torneo activo en curso.
- [ ] Se puede elegir Modalidad de Torneo (Llaves vs Liga) y Modalidad de Partido (Ida y Vuelta vs Partido Único para Llaves).
- [ ] En Draft/Equipos, se puede optar entre Asignación Manual y Sorteo Automático con carga rápida de N equipos.
- [ ] En Llaves con Partido Único, solo se muestra y carga un partido por serie.
- [ ] En Liga, se genera el fixture Round Robin completo (4, 5 y 6 jugadores) con fechas, tabla de posiciones interna en vivo y podio al finalizar todos los partidos.
- [ ] El botón "Resetear historial" en Tabla limpia acumulados tras confirmación estricta sin borrar la lista de jugadores.
- [ ] Al finalizar tanto en Llaves como en Liga, la tabla histórica acumula correctamente PTS, PJ, PG, PP, GF, GC, DG y TJ.
- [ ] Persistencia y recarga funcionan sin problemas en cualquier fase (incluyendo Liga).
- [ ] Tests unitarios en `src/domain/` cubren las nuevas funciones puras (league, sorteo automático, partido único, borrado/reseteo).
- [ ] Textos de la UI en español rioplatense y código en inglés.

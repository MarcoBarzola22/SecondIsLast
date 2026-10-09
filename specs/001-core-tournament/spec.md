# Spec 001 — Core Tournament (MVP)

> Cumple con `docs/constitution.md`. Estado: **Borrador para aprobación**.

## 1. Contexto y Objetivo

**Second is Last** es una SPA offline para organizar torneos de PES 6 entre amigos en una sola juntada. La maqueta (`pixel-perfect-screenshot-main`) es solo la base visual. Toda la lógica se reescribe según esta spec.

**Objetivo:** que esta noche funcione de punta a punta el flujo **Registro → Temática → Draft → Llaves → Tabla**, guardado en `localStorage` y aguantando recargas de página sin perder datos.

**Fuera de alcance (MVP):** backend, cuentas de usuario, más de 6 o menos de 4 jugadores, ida única, regla del gol de visitante, cargar goles de penales, editar o borrar jugadores del registro, resetear la tabla histórica, ver torneos pasados en detalle.

## 2. Glosario

| Término | Definición |
|---|---|
| Jugador | Persona registrada con Nombre y Apellido. Se guarda entre torneos. |
| Participante | Jugador elegido para el torneo activo. |
| Llave (serie) | Cruce entre 2 participantes a Ida y Vuelta. |
| Global | Suma de los goles de ambos partidos para cada participante. |
| Bye | Pase directo a Semifinales sin jugar Cuartos. |
| Torneo activo | El único torneo en curso. Puede no haber ninguno. |

## 3. Historias de Usuario

- **HU-1 Registro:** Como organizador, quiero cargar jugadores (Nombre y Apellido) y elegir entre 4 y 6 participantes, para armar el torneo de esta noche.
- **HU-2 Temática y Draft:** Como organizador, quiero sortear una temática y un orden de elección, para que cada participante elija su equipo de forma justa.
- **HU-3 Jugar Llaves:** Como participante, quiero ver el cuadro, cargar los goles de ida y vuelta y que el sistema avance al ganador solo, para no hacer cuentas a mano.
- **HU-4 Ver Tabla:** Como grupo, queremos ver la tabla histórica acumulada de todos los torneos, para saber quién es el mejor.

## 4. Requisitos Funcionales (EARS)

### 4.1 Registro de jugadores (HU-1)

- **RF-1:** El sistema deberá permitir registrar un jugador con **Nombre** y **Apellido**, ambos obligatorios.
- **RF-2:** Si el Nombre o el Apellido están vacíos o tienen solo espacios, entonces el sistema deberá bloquear el registro y mostrar un mensaje de validación.
- **RF-3:** Si ya existe un jugador con el mismo Nombre y Apellido (sin distinguir mayúsculas, acentos ni espacios de más), entonces el sistema deberá rechazar el duplicado y avisar.
- **RF-4:** El sistema deberá guardar el registro de jugadores en `localStorage` para que esté disponible en torneos futuros.
- **RF-5:** El sistema deberá permitir marcar y desmarcar jugadores registrados como participantes del torneo.
- **RF-6:** Mientras la cantidad de participantes no esté entre 4 y 6 inclusive, el sistema deberá deshabilitar el botón para avanzar a Temática e indicar cuántos faltan o sobran.

### 4.2 Temática (HU-2)

- **RF-7:** El sistema deberá ofrecer una lista fija de temáticas: "Clásicos PES 6", "Apertura 2006", "Europa Actual", "Selecciones Mundial 06", "Solo Sudamérica".
- **RF-8:** Cuando el organizador toque "Girar ruleta", el sistema deberá elegir una temática al azar con distribución uniforme.
- **RF-9:** El sistema deberá permitir volver a girar la ruleta todas las veces que se quiera antes de confirmar.
- **RF-10:** Mientras no haya una temática elegida, el sistema deberá deshabilitar el avance al Draft.

### 4.3 Draft (HU-2)

- **RF-11:** Cuando se entra al Draft por primera vez en el torneo activo, el sistema deberá sortear el orden de elección de los participantes con Fisher-Yates.
- **RF-12:** El sistema deberá mostrar el orden de elección y resaltar al participante que tiene el turno.
- **RF-13:** El sistema deberá permitir que el participante en turno escriba el nombre de su equipo (texto libre, obligatorio).
- **RF-14:** Si el nombre del equipo está vacío o ya lo eligió otro participante del mismo torneo (sin distinguir mayúsculas), entonces el sistema deberá rechazarlo y avisar.
- **RF-15:** Cuando un participante confirma su equipo, el sistema deberá pasar el turno al siguiente del orden.
- **RF-16:** Cuando todos los participantes tienen equipo, el sistema deberá habilitar "Sortear llaves".

### 4.4 Generación del Bracket (HU-3)

- **RF-17:** Cuando el organizador toque "Sortear llaves", el sistema deberá mezclar a los participantes con Fisher-Yates y armar el cuadro según la cantidad:
  - **4 participantes:** Semi 1 = P1 vs P2; Semi 2 = P3 vs P4.
  - **5 participantes:** Cuartos 1 = P1 vs P2. Byes = P3, P4, P5. Semi 1 = Ganador C1 vs P3; Semi 2 = P4 vs P5.
  - **6 participantes:** Cuartos 1 = P1 vs P2; Cuartos 2 = P3 vs P4. Byes = P5, P6. Semi 1 = Ganador C1 vs P5; Semi 2 = Ganador C2 vs P6.
  - (P1…Pn = orden que resulta de la mezcla.)
- **RF-18:** El sistema deberá crear siempre una **Final** (ganadores de las Semis) y un partido por el **3er Puesto** (perdedores de las Semis).
- **RF-19:** El sistema deberá mostrar en el cuadro a los participantes con Bye marcados como "Pase directo".
- **RF-20:** Una vez sorteadas las llaves, el sistema no deberá permitir volver a sortearlas en el torneo activo.

### 4.5 Partidos y Resultados (HU-3)

- **RF-21:** El sistema deberá tratar cada llave como Ida y Vuelta, con campos de goles para los dos participantes en cada partido.
- **RF-22:** El sistema deberá aceptar solo goles enteros entre 0 y 99. Si se ingresa otro valor, entonces deberá marcar el campo como inválido y no confirmar.
- **RF-23:** Mientras falten goles de alguno de los dos partidos, el sistema deberá deshabilitar "Confirmar llave".
- **RF-24:** El sistema deberá calcular y mostrar el Global en tiempo real a medida que se cargan los goles.
- **RF-25:** Cuando el Global quede empatado, el sistema deberá mostrar un selector obligatorio para marcar quién ganó por penales y no dejar confirmar hasta elegir.
- **RF-26:** Cuando se confirma una llave, el sistema deberá pasar al ganador (y, en Semis, al perdedor) a la llave que le toca según RF-17 y RF-18.
- **RF-27:** Una llave solo se podrá habilitar para cargar resultados cuando sus dos participantes estén definidos.
- **RF-28:** Mientras la llave a la que alimenta una llave confirmada no tenga goles cargados, el sistema deberá permitir corregir la llave confirmada y volver a calcular quién avanza.
- **RF-29:** Los goles de penales no deberán sumarse al Global ni a GF/GC.

### 4.6 Cierre del torneo y Tabla Histórica (HU-4)

- **RF-30:** Cuando se confirmen la Final y el 3er Puesto, el sistema deberá mostrar el podio (Campeón, Subcampeón, 3er y 4to Puesto) y un botón "Finalizar torneo".
- **RF-31:** Cuando el organizador toque "Finalizar torneo", el sistema deberá sumar a la tabla histórica, una sola vez y de golpe, las estadísticas de todos los participantes:
  - **PTS:** Campeón +10, Subcampeón +7, 3er Puesto +5, 4to Puesto +3, eliminado en Cuartos +1.
  - **PJ:** +1 por cada llave jugada (una llave = 1 PJ, sin importar que sean 2 partidos).
  - **PG / PP:** +1 PG al que gana la llave y +1 PP al que la pierde. No existen empates (PE).
  - **GF / GC:** goles a favor y en contra sumando todos los partidos de ida y vuelta.
  - **DG:** GF − GC.
  - **TJ:** +1 a cada participante.
- **RF-32:** El sistema deberá contar el partido por el 3er Puesto como una llave más para PJ, PG, PP, GF y GC.
- **RF-33:** El sistema deberá guardar un resumen del torneo finalizado (fecha, temática, participantes, equipos, podio) en el historial de `localStorage` y luego borrar el torneo activo.
- **RF-34:** El sistema deberá mostrar la tabla con estas columnas exactas: **Rank, JUGADORES, PTS, PJ, PG, PP, GF, GC, DG, TJ**.
- **RF-35:** El sistema deberá mostrar la columna JUGADORES con el formato "Apellido, Nombre".
- **RF-36:** El sistema deberá ordenar la tabla por PTS (de mayor a menor), luego DG, luego GF, y por último Apellido alfabéticamente. Rank va de 1 a N según ese orden.
- **RF-37:** El sistema deberá mostrar en la tabla solo a los jugadores con TJ ≥ 1.
- **RF-38:** El sistema deberá dejar ver la Tabla en cualquier momento, aunque haya un torneo activo.

### 4.7 Persistencia y Robustez (transversal)

- **RF-39:** Cuando cambie el estado del torneo activo, del registro o de la tabla, el sistema deberá guardarlo en `localStorage` a través del adaptador de `src/storage/`.
- **RF-40:** Cuando se cargue la app y haya un torneo activo guardado, el sistema deberá retomarlo en el paso donde quedó (Temática, Draft o Llaves).
- **RF-41:** Si los datos de `localStorage` faltan, están corruptos o tienen un `schemaVersion` desconocido, entonces el sistema deberá usar valores por defecto vacíos, dejar el error en consola y seguir andando.
- **RF-42:** Si falla una escritura en `localStorage` (por ejemplo, cuota llena), entonces el sistema deberá mantener el estado en memoria, dejar el error en consola y no interrumpir a la UI.
- **RF-43:** Si se produce un error de render no controlado, entonces el sistema deberá mostrar una pantalla de recuperación (Error Boundary) con un botón "Reintentar" en lugar de la pantalla en blanco.
- **RF-44:** Mientras haya un torneo activo, el sistema deberá ofrecer "Abandonar torneo" con confirmación. Al aceptar, deberá borrar el torneo activo sin tocar la tabla histórica.
- **RF-45:** Mientras haya un torneo activo en Draft o Llaves, el sistema no deberá permitir cambiar los participantes ni la temática.

## 5. Criterios de Finalización (Definition of Done para esta noche)

- [ ] Se pueden registrar jugadores y queda bloqueado avanzar con menos de 4 o más de 6 participantes.
- [ ] La ruleta asigna una temática y se puede volver a girar antes de confirmar.
- [ ] El Draft sortea el orden y cada participante carga un equipo único.
- [ ] El bracket se arma bien para **4, 5 y 6** participantes, con Byes y Cuartos según RF-17.
- [ ] Se cargan ida y vuelta, el Global se ve en vivo y el empate obliga a elegir quién ganó por penales.
- [ ] Ganadores y perdedores avanzan solos hasta la Final y el 3er Puesto.
- [ ] Al finalizar, la tabla suma bien PTS, PJ, PG, PP, GF, GC, DG y TJ (verificado a mano con un torneo de 5 participantes).
- [ ] Al recargar la página a mitad del torneo, se retoma exactamente donde quedó.
- [ ] Con `localStorage` corrupto a mano, la app arranca limpia sin crashear.
- [ ] Las funciones de `src/domain/` (bracket, global, puntos, tabla) tienen tests unitarios para 4, 5 y 6 participantes.
- [ ] Todos los textos de la UI están en español rioplatense y el código está en inglés.

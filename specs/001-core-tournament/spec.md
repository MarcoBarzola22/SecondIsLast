# Spec 001 — Core Tournament & Versión 2.0 Local

> Cumple con `docs/constitution.md`. Estado: **Versión 2.0 Local — Planificación Aprobada**.

## 1. Contexto y Objetivo

**Second is Last** es una SPA offline para organizar torneos de PES 6 entre amigos en una sola juntada. La maqueta (`pixel-perfect-screenshot-main`) es la base visual. Toda la lógica de negocio vive en `src/domain/` como funciones puras y testeables.

**Objetivo v1.0 (MVP):** Flujo completo **Registro → Temática → Draft → Llaves/Liga → Tabla**, guardado en `localStorage` y resistente a recargas.
**Objetivo v2.0 Local:** Incorporar criterios de Fair Play (tarjetas) y desempate jerárquico (H2H), abandono individual de torneo (Walkover 3-0), nuevos formatos (Fase de Grupos, Liga + Reducido, Doble Eliminación con Winner/Loser bracket y reset), calculadora inteligente de escenarios matemáticos en la UI, e Historial Avanzado con Duelo Directo (H2H), premios honoríficos (Bota de Oro, Madera, Valla Invicta) y Ranking Anual Ponderado por cantidad de participantes.

**Fuera de alcance:** backend, cuentas de usuario remotas, sincronización en la nube, regla de gol de visitante en llaves.

## 2. Glosario

| Término | Definición |
|---|---|
| Jugador | Persona registrada con Nombre y Apellido. Persiste entre torneos. |
| Participante | Jugador seleccionado para competir en el torneo activo. |
| Modalidad de Torneo | Formato de competencia: `bracket` (Llaves), `league` (Liga Round Robin), `group_stage` (Fase de Grupos), `league_playoffs` (Liga + Reducido), `double_elimination` (Doble Eliminación). |
| Modalidad de Partido | Formato de serie: "Ida y Vuelta" (2 partidos) o "Partido Único" (1 partido). |
| Fair Play (Tarjetas) | Conteo de Tarjetas Amarillas (TA) y Rojas (TR) por equipo en cada partido/serie como criterio de desempate. |
| Duelo Directo (H2H) | Head-to-Head: puntos y goles entre equipos empatados como criterio prioritario de desempate. Históricamente, balance cara a cara acumulado. |
| Walkover (Abandono) | Retiro de un jugador durante el torneo: todos sus partidos (pasados y futuros) se computan como derrota 0-3 en contra. |
| Fase de Grupos | División en 2 grupos (6 jugadores) o 3 grupos (9 jugadores) con clasificación a Semifinales y Playoffs. |
| Liga + Reducido | Liga regular Round Robin seguida de un cuadro de eliminación directa para los mejores clasificados. |
| Doble Eliminación | Cuadro con Winner Bracket (WB) y Loser Bracket (LB), donde la Gran Final exige al ganador de LB vencer dos veces (Bracket Reset). |
| Calculadora de Escenarios | Módulo de UI que resalta zonas de clasificación, clasificados matemáticos y combinaciones de resultados necesarias en las fechas finales. |
| Ranking Anual Ponderado | Sistema de puntuación por año donde los puntos otorgados escalan según el número de participantes ($N$) del torneo. |
| Torneo activo | El único torneo en curso en el estado global. |

## 3. Historias de Usuario

- **HU-1 Registro y Gestión de Jugadores:** Como organizador, quiero cargar jugadores, borrar obsoletos y seleccionar entre 4 y 10 participantes junto a las modalidades del torneo.
- **HU-2 Temática y Asignación de Equipos:** Como organizador, quiero sortear o crear temáticas y definir los equipos de los participantes por Draft manual o por Sorteo Automático.
- **HU-3 Jugar Torneo (Llaves o Liga):** Como participante, quiero ver el cuadro/fixture, registrar goles y resolver clasificaciones.
- **HU-4 Ver y Gestionar Tabla Histórica:** Como grupo, queremos ver la tabla histórica acumulada con opción de reseteo con confirmación estricta.
- **HU-5 Tarjetas y Desempate Fair Play:** Como organizador y participante, quiero registrar tarjetas amarillas y rojas y que las tablas desempaten según el orden reglamentario (Puntos, DG, H2H, PG, Menos TR, Menos TA).
- **HU-6 Abandono de Torneo (Walkover):** Como organizador, si un jugador debe retirarse de la juntada, quiero declarar su abandono para que todos sus partidos pasen a 0-3 en contra y la tabla se reajuste de forma justa.
- **HU-7 Nuevos Formatos de Torneo:** Como grupo, queremos disputar torneos con Fase de Grupos (6 o 9 participantes), Liga con Reducido final o Doble Eliminación completa.
- **HU-8 Calculadora de Escenarios:** Como participante en las fechas decisivas, quiero saber en vivo qué puestos clasifican, quién ya está clasificado y qué resultados necesito para pasar de ronda.
- **HU-9 Historial Avanzado, Premios y Ranking Anual:** Como grupo, queremos consultar nuestro historial directo mano a mano, ver quién se lleva la Bota de Oro o el Premio de Madera y competir por un Ranking Anual ponderado.

## 4. Requisitos Funcionales (EARS)

### 4.1 Registro y Configuración de Jugadores (HU-1)

- **RF-1:** El sistema deberá permitir registrar un jugador con **Nombre** y **Apellido**, ambos obligatorios.
- **RF-2:** Si el Nombre o el Apellido están vacíos o tienen solo espacios, el sistema deberá bloquear el registro y mostrar un mensaje de validación.
- **RF-3:** Si ya existe un jugador con el mismo Nombre y Apellido (sin distinguir mayúsculas, acentos ni espacios redundantes), el sistema deberá rechazar el duplicado.
- **RF-4:** El sistema deberá guardar el registro de jugadores en `localStorage` para persistencia entre torneos.
- **RF-5:** El sistema deberá permitir marcar y desmarcar jugadores registrados como participantes del torneo.
- **RF-6:** La cantidad de participantes permitida deberá validar las restricciones de cada formato:
  - Formato Llaves, Liga, Doble Eliminación: entre 4 y 10 participantes inclusive.
  - Formato Fase de Grupos: exactamente 6 o 9 participantes.
  - Formato Liga + Reducido: entre 4 y 10 participantes inclusive.
- **RF-46:** El sistema deberá permitir eliminar un jugador registrado. No se permitirá eliminar a un participante si existe un torneo activo en curso. Al eliminarlo, sus estadísticas acumuladas deberán limpiarse.
- **RF-48:** Al configurar el torneo en Registro, el sistema deberá permitir elegir la **Modalidad de Torneo**:
  1. "Llaves (Bracket)"
  2. "Liga (Todos contra todos)"
  3. "Fase de Grupos + Playoffs" (6 o 9 participantes)
  4. "Liga + Reducido" (Playoffs finales)
  5. "Doble Eliminación (Winner/Loser)"
- **RF-49:** Al configurar el torneo en Registro, el sistema deberá permitir elegir la **Modalidad de Partido**: "Ida y Vuelta" o "Partido Único".
- **RF-59:** El selector de Modalidad de Partido en Registro deberá permanecer siempre visible, adaptando su descripción explicativa a cada formato.

### 4.2 Temática (HU-2)

- **RF-7:** El sistema deberá ofrecer una lista fija de temáticas base: "Clásicos PES 6", "Apertura 2006", "Europa Actual", "Selecciones Mundial 06", "Solo Sudamérica".
- **RF-8:** Al presionar "Girar ruleta", el sistema elegirá una temática al azar con distribución uniforme sobre las temáticas disponibles.
- **RF-9:** El sistema deberá permitir volver a girar la ruleta antes de confirmar.
- **RF-10:** Mientras no haya una temática elegida, el sistema bloqueará el avance a la fase de Equipos/Draft.
- **RF-56:** En Temática, el sistema mostrará visiblemente la lista de temáticas disponibles en chips o badges.
- **RF-57:** El sistema proveerá un campo de texto y botón "Agregar" para incorporar temáticas personalizadas (sin vacíos ni duplicados).
- **RF-58:** Las temáticas personalizadas se guardarán en `localStorage` (`customThemes`) e ingresarán de inmediato a la ruleta.

### 4.3 Asignación de Equipos / Draft (HU-2)

- **RF-11:** En la fase de Equipos, el sistema ofrecerá dos métodos: "Asignación Manual (por turnos)" y "Sorteo Automático".
- **RF-12:** En Asignación Manual, el sistema sorteará el orden con Fisher-Yates, resaltará el turno activo y permitirá ingresar el nombre del equipo (único y obligatorio).
- **RF-13:** Al confirmar un equipo en Asignación Manual, el turno pasa al siguiente.
- **RF-14:** Si el nombre está vacío o ya fue elegido en el mismo torneo, el sistema lo rechazará.
- **RF-15:** Cuando todos los participantes tienen equipo asignado, se habilitará el inicio de la competencia.
- **RF-52:** En Sorteo Automático, se solicitarán N nombres de equipos (N = participantes). Al confirmar, el sistema mezclará los equipos con Fisher-Yates y los asignará aleatoriamente a los participantes.

### 4.4 Formato Llaves (HU-3 - Modo Llaves)

- **RF-17:** Al iniciar Llaves, se sortearán los cruces mediante Fisher-Yates respetando el árbol de llaves asimétrico para 4 a 10 participantes (con Byes en Octavos o Cuartos según corresponda).
- **RF-18:** El sistema creará siempre una Final y un partido por el 3er Puesto.
- **RF-19:** Los participantes con Bye figurarán como "Pase directo".
- **RF-20:** Una vez sorteadas las llaves, no se permitirá re-sortear en el torneo activo.
- **RF-21:** En "Ida y Vuelta", se registran dos partidos con tanteador global en vivo. En "Partido Único", la UI muestra solo un partido por serie.
- **RF-22:** Goles enteros entre 0 y 99.
- **RF-23:** Mientras falten goles, "Confirmar llave" estará deshabilitado.
- **RF-24:** Cálculo en vivo del resultado global.
- **RF-25:** En caso de empate global, selector obligatorio de ganador por penales.
- **RF-26:** Al confirmar llave, el ganador (y perdedor en Semis) avanza a la siguiente serie.
- **RF-27:** Carga habilitada solo cuando ambos rivales están definidos.
- **RF-28:** Edición permitida mientras la serie destino no tenga goles cargados.
- **RF-29:** Goles de penales no suman al marcador global ni a GF/GC.
- **RF-60:** Para 9 o 10 participantes, columna previa de Play-in (Octavos) con scroll horizontal.

### 4.5 Formato Liga (HU-3 - Modo Liga)

- **RF-50:** Fixture Round Robin generado por algoritmo Berger (4 a 10 participantes) en Partido Único (1 rueda) o Ida y Vuelta (2 ruedas con localía invertida).
- **RF-51:** Cada partido de liga admite victoria, empate o derrota (sin penales).
- **RF-53:** Tabla de posiciones con Pos, Participante, Equipo, PTS, PJ, PG, PE, PP, GF, GC, DG, TR, TA. Puntaje: PG=3, PE=1, PP=0.
- **RF-54:** Edición de partidos de liga habilitada hasta finalizar el torneo.
- **RF-55:** Podio definido al completar todas las fechas: 1° Campeón, 2° Subcampeón, 3° Tercer Puesto, 4° Cuarto Puesto.

### 4.6 Tarjetas y Criterios de Desempate Fair Play (HU-5)

- **RF-61:** Al cargar resultados de cualquier partido o serie (Llaves, Liga, Grupos, Doble Eliminación), el sistema deberá permitir ingresar la cantidad de Tarjetas Amarillas (TA) y Tarjetas Rojas (TR) por equipo/jugador (enteros $\ge 0$, valor por defecto 0).
- **RF-62:** El orden de desempate en todas las tablas de posiciones (Liga regular y Fase de Grupos) deberá regirse estrictamente por la siguiente jerarquía:
  1. Puntos (`PTS` ↓)
  2. Diferencia de Goles (`DG` ↓)
  3. Duelo Directo (`H2H` ↓): ante igualdad entre dos o más equipos, mini-tabla considerando únicamente los enfrentamientos directos disputados entre sí (puntos entre sí y luego DG entre sí).
  4. Mayor cantidad de Partidos Ganados (`PG` ↓)
  5. Menor cantidad de Tarjetas Rojas recibidas (`TR` ↑)
  6. Menor cantidad de Tarjetas Amarillas recibidas (`TA` ↑)
  7. Orden alfabético por Apellido/Nombre como criterio de desempate determinista final.
- **RF-63:** Las tablas de posiciones deberán incluir visualmente los valores acumulados de TR y TA.

### 4.7 Abandono de Torneo / Walkover (HU-6)

- **RF-64:** El sistema proveerá una acción por participante para "Abandonar Torneo" en las vistas activas, requiriendo confirmación estricta con modal o diálogo nativo.
- **RF-65:** Cuando un participante declara abandono (Walkover), todos sus partidos en el torneo activo (los ya jugados previamente y los pendientes por jugar) se sobreescriben automáticamente como derrotas por 3-0 en contra (el rival recibe 3 goles a favor y 0 en contra; el desertor recibe 0 a favor y 3 en contra; sin tarjetas adicionales).
- **RF-66:** El sistema recalculará de inmediato la tabla de posiciones con los resultados 0-3, marcará al participante desertor con estado visual de Walkover ("W.O.") e inhabilitará cualquier edición o juego posterior de sus partidos. En cruces directos o llaves, el rival avanzará de inmediato.

### 4.8 Nuevos Formatos de Torneo (HU-7)

- **RF-67 (Fase de Grupos + Playoffs):**
  - **6 participantes:** 2 grupos de 3 (Grupo A y Grupo B) sorteados aleatoriamente. Clasifican a Semifinales el 1° y 2° de cada grupo. Semifinales cruzadas: 1°A vs 2°B, 1°B vs 2°A. Ganadores a la Final, perdedores al 3er Puesto.
  - **9 participantes:** 3 grupos de 3 (Grupo A, Grupo B y Grupo C). Clasifican a Semifinales los 1° de cada grupo (3 participantes) más el mejor 2° entre los 3 grupos (1 participante) comparado según: 1) PTS, 2) DG, 3) PG, 4) Menos TR, 5) Menos TA. Semifinales: Mejor 1° vs Mejor 2°, 2° Mejor 1° vs 3° Mejor 1°. Ganadores a la Final, perdedores al 3er Puesto.
  - Configuración de formato de grupos: configurable en "Partido Único" o "Ida y Vuelta". La fase de playoffs (Semis/Final) sigue la `matchFormat` del torneo.
- **RF-68 (Liga + Reducido):**
  - Se disputará una fase regular completa Round Robin (a una o dos ruedas según `matchFormat`).
  - Al completar todas las fechas de la fase regular, los mejores clasificados avanzan a un cuadro final de eliminación directa:
    - 4 o 5 participantes: avanzan los 2 mejores a la Final (3° y 4° juegan por el tercer puesto).
    - 6 u 8 participantes: avanzan los 4 mejores a Semifinales (1° vs 4°, 2° vs 3°), Final y 3er Puesto.
    - 10 participantes: avanzan los 8 mejores a Cuartos de Final (1° vs 8°, 2° vs 7°, 3° vs 6°, 4° vs 5°), Semis, Final y 3er Puesto.
- **RF-69 (Doble Eliminación / Winner & Loser Bracket):**
  - El sistema armará un bracket de doble eliminación con Winner Bracket (WB) y Loser Bracket (LB) para 4 a 10 participantes con Byes equilibrados cuando $N$ no es potencia de 2.
  - Al perder en WB, el participante desciende a la ronda correspondiente de LB.
  - Al perder en LB, el participante queda eliminado definitivamente.
  - Grand Final: Campeón de WB vs Campeón de LB. Si el participante de WB gana la primera serie, se corona Campeón. Si el participante de LB gana la primera serie, se disputa una serie de desempate obligatoria (Grand Final Reset); quien gane la segunda serie se corona Campeón.

### 4.9 Calculadora de Escenarios / Smart UI (HU-8)

- **RF-73:** En modalidades con tabla clasificatoria (Liga, Fase de Grupos, Liga + Reducido), el sistema resaltará en verde las filas que ocupan puestos de clasificación a la siguiente fase o podio.
- **RF-74:** El sistema calculará en tiempo real si un participante se encuentra **matemáticamente clasificado** (ningún resultado posible de los rivales restantes puede desplazarlo fuera de la zona de clasificación) y lo distinguirá con un badge visual "Clasificado".
- **RF-75:** En las últimas fechas de la fase regular (últimas 2 o 3 fechas según la longitud del torneo), las tarjetas de partidos mostrarán información contextual de escenarios para cada jugador (ej. "Con un triunfo asegura el 1° puesto", "Necesita ganar por 2 goles para superar a su rival en DG", "Un empate le asegura clasificar").

### 4.10 Historial Global, Head to Head y Ranking Anual (HU-9)

- **RF-76:** El sistema mantendrá en `localStorage` un registro acumulativo de enfrentamientos cara a cara **Head to Head (H2H)** entre todos los pares de jugadores registrados (partidos jugados entre sí, victorias de cada uno, empates, goles de cada uno).
- **RF-77:** El sistema calculará y exhibirá en la vista de estadísticas las siguientes distinciones y récords:
  - **Bota de Oro:** Máximo anotador absoluto histórico y por torneo.
  - **Premio de Madera:** Participante con mayor cantidad de derrotas o peor balance de partidos.
  - **Valla Invicta:** Participante con mayor cantidad de partidos sin recibir goles o menor promedio de GC por partido.
- **RF-78:** El sistema implementará un **Ranking Anual de Puntos** agrupado por año calendario (`annualRankings`), con puntuación escalada según la cantidad de participantes ($N$) del torneo:
  - Campeón: $10 \times \frac{N}{4}$ pts.
  - Subcampeón: $7 \times \frac{N}{4}$ pts.
  - 3er Puesto: $5 \times \frac{N}{4}$ pts.
  - 4to Puesto: $3 \times \frac{N}{4}$ pts.
  - Resto de participantes: $+1$ pt de participación.
- **RF-79:** La vista de Tabla/Estadísticas permitirá alternar entre: "Tabla Histórica General", "Ranking Anual Ponderado", "Duelo Directo (H2H)" y "Vitrina de Premios".
- **RF-80:** Compatibilidad hacia atrás: los estados guardados bajo versiones previas migrarán transparentemente a `schemaVersion: 2`, inicializando contadores y estructuras nuevas en cero o valores por defecto seguros sin alterar los datos existentes.

### 4.11 Cierre del Torneo y Persistencia (HU-4, Transversal)

- **RF-30:** Al finalizar la competencia de cualquier modalidad, el sistema mostrará el podio (Campeón, Subcampeón, 3er y 4to Puesto) y el botón "Finalizar torneo".
- **RF-31:** Al finalizar torneo, se sumarán las estadísticas a la tabla acumulada, al Ranking Anual y al registro H2H.
- **RF-33:** Guardar resumen del torneo finalizado en historial y limpiar el torneo activo.
- **RF-34:** Formato de tabla histórica general con columnas Rank, JUGADORES, PTS, PJ, PG, PP, GF, GC, DG, TJ.
- **RF-37:** En tabla histórica se muestran solo jugadores con TJ $\ge$ 1.
- **RF-47:** Botón "Resetear historial" con confirmación estricta para vaciar estadísticas y torneos finalizados sin borrar jugadores.
- **RF-39 / RF-40 / RF-41 / RF-42 / RF-43:** Persistencia en `localStorage`, autosave, recuperación tolerante ante errores y Error Boundary global.

### 4.12 Pulido de Experiencia de Usuario y UI/UX (HU-10)

- **RF-81 (Selección de Temática Manual):** En `ThemeView`, además de la ruleta de sorteo aleatorio, se proveerá un selector desplegable o botón de selección manual que permita elegir directamente cualquier temática disponible (predeterminada o personalizada) e iniciar el torneo saltando la animación de la ruleta si el grupo ya consensuó qué jugar.
- **RF-82 (Animación de Sorteo de Equipos):** En la modalidad de Sorteo Automático de `DraftView`, el sorteo de equipos no se mostrará de golpe; el sistema ejecutará una animación secuencial (revelado progresivo con delay o efecto de ruleta por participante) para generar suspenso al descubrir qué equipo le toca a cada jugador.
- **RF-83 (Claridad de Clasificación y Eliminación):** En las tablas de posiciones (Liga, Grupos, Liga + Reducido), el sistema calculará en tiempo real si un participante está matemáticamente eliminado (sin chances teóricas de alcanzar la zona de clasificación) y lo distinguirá con un badge visual "Sin chances / Eliminado" (estilo rojo/gris). Asimismo, sobre la tabla se exhibirá una leyenda explicativa del criterio de corte (ej. "Los primeros 4 clasifican al Reducido", "Los primeros 2 clasifican a la Final", "1° y 2° de cada grupo clasifican a Semifinales").
- **RF-84 (Cartel de Puntos del Torneo):** En la cabecera del torneo activo (`Header` o vista principal), se exhibirá un banner o indicador destacado que informe cuántos puntos para el Ranking Anual reparte este torneo en particular basándose en su cantidad de jugadores $N$ (ej: "🏆 Torneo de 8 participantes — Campeón: 20 pts | Subcampeón: 14 pts | 3°: 10 pts | 4°: 6 pts").

### 4.13 Hotfixes y Ajustes de Competición v2.0 (HU-11)

- **RF-85 (Hotfix: Dominio de Puntos Enteros, Escenarios de Eliminación y Métricas de Fair Play / Podios):**
  - Los puntos del Ranking Anual en `getTournamentPointsDistribution` y `computeAnnualRanking` deben redondearse al entero más cercano con `Math.round`, evitando valores decimales.
  - En la guía de escenarios de partidos (`scenarios.ts`), si un participante está matemáticamente eliminado de la zona de clasificación, el mensaje textual debe indicar estrictamente "Eliminado matemáticamente" o "Sin chances".
  - En el historial global acumulado de jugadores (`PlayerStats`) y en el ranking anual (`AnnualRankingEntry`), se deben registrar y exhibir las Tarjetas Rojas (TR) y Amarillas (TA) totales acumuladas, y contabilizar la cantidad de "Podios" obtenidos (haber finalizado en 1º, 2º o 3º puesto).
- **RF-86 (Hotfix UI: Selector de Clasificados al Reducido y Sorteo Aleatorio de Formato):**
  - En `RegistrationView`, al seleccionar la modalidad "Liga + Reducido", se habilitará un selector/input numérico interactivo que permita al usuario definir la cantidad de clasificados al bracket final (2, 4 u 8 clasificados, acorde a la cantidad de jugadores).
  - En el panel de selección de modalidad de `RegistrationView`, se incorporará el botón "Sortear Formato" con icono temático de dados/azar para escoger aleatoriamente una modalidad válida de torneo según los participantes registrados.
- **RF-87 (Hotfix Dominio y UI: Armado Manual de Llaves y Doble Eliminación):**
  - En las modalidades de "Llaves" (`bracket`) y "Doble Eliminación" (`double_elimination`), el usuario administrador podrá acceder a un panel/modal de armado manual de cruces antes del inicio de los partidos.
  - El sistema permitirá seleccionar a dedo quién juega contra quién en cada serie de la ronda inicial y asignar de manera explícita los pases directos (Byes) cuando la cantidad de participantes sea impar o no potencia de 2, impidiendo la asignación duplicada de jugadores.

## 5. Criterios de Finalización (Definition of Done v2.0, Pulido UI/UX & Hotfixes)

- [x] Carga y edición de Tarjetas Amarillas y Rojas por partido en todas las modalidades.
- [x] Tablas de posiciones desempatadas con orden exacto: PTS → DG → H2H → PG → Menos TR → Menos TA → Alfabético.
- [x] Botón de "Abandonar Torneo" por jugador (Walkover) con sobreescritura de todos sus partidos a 0-3 y recálculo automático.
- [x] Modalidad Fase de Grupos operativa para 6 y 9 jugadores con clasificación cruzada o mejor 2°, ida/vuelta opcional y playoffs.
- [x] Modalidad Liga + Reducido operativa con corte automático de clasificados a bracket final según cantidad de jugadores.
- [x] Modalidad Doble Eliminación operativa con Winner Bracket, Loser Bracket, Byes asimétricos y Grand Final con reset si gana el del LB.
- [x] Smart UI con filas resaltadas en verde, badges de "Clasificado" matemático y guía contextual de escenarios en fechas finales.
- [x] Modelo de datos extendido con H2H, Bota de Oro, Premio de Madera, Valla Invicta y Ranking Anual ponderado por $N$.
- [x] Migración transparente de `schemaVersion: 1` a `schemaVersion: 2` sin pérdida de datos en `localStorage`.
- [x] Suite de pruebas en `src/domain/__tests__/` cubriendo todas las nuevas funciones puras y reducer sin regresiones.
- [x] Textos de la UI en español rioplatense y código fuente en inglés estricto.
- [x] Selector manual de temáticas en ThemeView para saltear ruleta si el grupo ya decidió (RF-81).
- [x] Animación de suspenso secuencial al sortear equipos automáticamente en DraftView (RF-82).
- [x] Indicador de "Sin chances / Eliminado" en tablas y leyenda visible de cupos de clasificación (RF-83).
- [x] Banner de distribución de puntos del Ranking Anual según cantidad de participantes en el encabezado (RF-84).
- [x] Puntos del Ranking Anual calculados como enteros estrictos sin decimales (RF-85).
- [x] Mensaje de escenarios para eliminados matemáticos como "Eliminado matemáticamente" o "Sin chances" (RF-85).
- [x] Acumulación y visualización de TR, TA y Podios en tablas históricas y anuales (RF-85).
- [x] Input interactivo para clasificados en Liga + Reducido y botón de "Sortear Formato" en RegistrationView (RF-86).
- [x] Armado manual interactivo de cruces iniciales y asignación de Byes para Llaves y Doble Eliminación (RF-87).


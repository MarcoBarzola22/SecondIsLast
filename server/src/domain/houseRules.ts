/**
 * House Rules Domain (RF-118 · Reglamento Oficial de la Casa)
 * Pure domain definitions of the official house rules consensuated by the group.
 * Expressed in authentic Rioplatense Spanish.
 */

export interface HouseRule {
  id: string;
  articleNumber: number;
  title: string;
  subtitle: string;
  badge: string;
  rfReference: string;
  summary: string;
  description: string;
  keyPoints: string[];
  quote: string;
}

export interface OfficialHouseRulesDocument {
  version: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  preamble: string;
  rules: HouseRule[];
  footer: string;
}

export const OFFICIAL_HOUSE_RULES: OfficialHouseRulesDocument = {
  version: '2.0.0',
  title: 'Reglamento Oficial de la Casa',
  subtitle: 'Código de convivencia, arbitraje digital y honor deportivo de la juntada',
  lastUpdated: '2026-10-25',
  preamble:
    'Bienvenido al Código de Honor de Second is Last. Este reglamento fue consensuado democráticamente por los pibes de la juntada para garantizar torneos limpios, sin discusiones de vestuario, con arbitraje digital inquebrantable y donde la pelota jamás se mancha. El segundo siempre es el último: jugá con el corazón, respetá a tu rival y no tires la bronca.',
  footer:
    'Segunda edición oficial de Second is Last Cloud Edition. Aprobada por unanimidad en la mesa de la juntada.',
  rules: [
    {
      id: 'quorum',
      articleNumber: 1,
      title: 'Quórum Mínimo Obligatorio',
      subtitle: 'La juntada arranca con 4 pibes o no arranca',
      badge: 'Quórum · RF-96',
      rfReference: 'RF-96',
      summary:
        'Para abrir un torneo oficial que compute para el ranking anual, deben haber sí o sí al menos 4 participantes presentes y confirmados en el lobby.',
      description:
        'En Second is Last no existen los torneos fantasmas ni los inventos para sumar puntos fáciles. Si son 2 o 3, jueguen un picadito amistoso en la Play para despuntar el vicio, pero el sistema no va a habilitar las votaciones ni guardará registros oficiales. Recién cuando el cuarto jugador da el presente en el Lobby y se alcanza el quórum legal (mínimo 4 y máximo 10), se destraban las urnas digitales y se pone en marcha la competencia.',
      keyPoints: [
        'Mínimo 4 jugadores conectados y confirmados en la juntada (RF-96).',
        'Con menos de 4, el botón de votación permanece bloqueado para todos.',
        'Únicamente los torneos con quórum otorgan puntos oficiales para el Ranking Anual.',
        'Capacidad máxima de 10 participantes por torneo activo.',
      ],
      quote: 'Sin 4 no hay fiesta ni gloria. Llegá temprano o miralo desde el sillón.',
    },
    {
      id: 'voting',
      articleNumber: 2,
      title: 'Democracia y Desempates al Azar',
      subtitle: 'Un voto por cabeza y moneda digital limpia si hay parda',
      badge: 'Votación · RF-99 a RF-102',
      rfReference: 'RF-99, RF-100, RF-101, RF-102',
      summary:
        'El formato de disputa y la temática de los equipos se definen por votación secreta; ante empates, define el azar uniforme sin mano negra.',
      description:
        'Se terminaron las discusiones eternas sobre qué jugar o con qué equipos. Cada participante emite su voto para el formato de torneo (Liga, Llaves de Eliminación, Doble Eliminación o Grupos con Playoffs) y para la temática de equipos (Selecciones, Clubes Europeos, Libertadores, etc.). Si al sonar el silbato del countdown hay empate en votos, el sistema tira una moneda digital limpia con probabilidad 50/50 uniforme y define de inmediato. El sorteo posterior de equipos es 100% aleatorio y se sincroniza en vivo en la pantalla de todos los pibes.',
      keyPoints: [
        'Un voto intransferible por participante en formato y temática (RF-99, RF-100).',
        'Cierre automático de urnas con temporizador sincronizado.',
        'Desempate 50/50 por azar puro algorítmico sin intervención manual (RF-101).',
        'Asignación de equipos en ruleta en vivo sincronizada en todos los celulares (RF-102).',
      ],
      quote: 'Si hay empate en los votos, decide la moneda del sistema y a llorar al campito.',
    },
    {
      id: 'handshake',
      articleNumber: 3,
      title: 'El Sagrado Handshake Local-Visitante',
      subtitle: 'El Local propone la planilla, el Visitante revisa y firma',
      badge: 'Handshake · RF-105 a RF-109',
      rfReference: 'RF-105, RF-106, RF-107, RF-108, RF-109',
      summary:
        'La carga de resultados es un pacto de honor: el Local ingresa goles, tarjetas y penales, y el Visitante los revisa en su teléfono para confirmar o rechazar.',
      description:
        'Termina el partido en la tele y se activa el protocolo: el jugador que figura como Local en el fixture abre su celular e ingresa los goles convertidos, tarjetas amarillas, rojas y el ganador de penales si correspondía. Al enviar, el partido pasa al estado Pendiente de Confirmación y el Visitante recibe de inmediato una alerta en vivo. El Visitante revisa cada dato. Si coincide con lo que pasó en la cancha, pulsa "Confirmar" y el partido queda Cerrado (CLOSED) de forma inmutable. Si el Local le pifió o metió la mula, el Visitante pulsa "Rechazar" y el Local tiene que volver a cargarlo.',
      keyPoints: [
        'Solo el Local puede proponer el resultado inicial con goles y tarjetas (RF-106, RF-107).',
        'Solo el Visitante tiene potestad para confirmar o rechazar la propuesta (RF-108).',
        'Control de Concurrencia Optimista (OCC): si el Local reenvía un cambio en vuelo, el Visitante recibe aviso y debe revisar la versión fresca (RF-109).',
        'Al confirmarse el partido, el cierre es atómico e irreversible (RF-110).',
      ],
      quote: 'Cargá bien los goles y las tarjetas. Tu rival tiene la última palabra.',
    },
    {
      id: 'anti_tamper',
      articleNumber: 4,
      title: 'Inviolabilidad de Resultados (Admin Con Manos Atadas)',
      subtitle: 'Ni el Admin ni el dueño de la casa pueden alterar un marcador',
      badge: 'Inviolabilidad · RF-112',
      rfReference: 'RF-112 (Principio 3)',
      summary:
        'El sistema prohíbe de forma absoluta e innegociable cualquier endpoint, botón o mecanismo para que los Administradores alteren resultados.',
      description:
        'En Second is Last la democracia y el mérito deportivo están blindados criptográfica y arquitectónicamente. El rol de Administrador existe únicamente para admitir amigos en la Whitelist, moderar la juntada o certificar abandonos de fuerza mayor. El Admin no tiene acceso para editar un gol, borrar una tarjeta ni reabrir un partido confirmado. Lo que se jugó en la cancha y fue ratificado por ambos rivales queda grabado para siempre en la base de datos.',
      keyPoints: [
        'Cero endpoints de edición o anulación de tanteadores para el rol ADMIN (RF-112).',
        'La base de datos rechaza cualquier mutación unilateral que no provenga del handshake legítimo.',
        'El historial y la tabla general son inalterables por decreto administrativo.',
        'Los errores se previenen y corrigen en la mesa rechazando a tiempo, no con privilegios de software.',
      ],
      quote: 'Acá no hay escritorio ni AFA bostera: lo que se define en la cancha es ley.',
    },
    {
      id: 'sequential_queue',
      articleNumber: 5,
      title: 'Cola Secuencial por Jugador (La Cancha No Se Para)',
      subtitle: 'Nadie adelanta sus partidos, pero el fixture no espera a los rezagados',
      badge: 'Fixture Ágil · RF-113 a RF-115',
      rfReference: 'RF-113, RF-114, RF-115',
      summary:
        'Un jugador no puede disputar la Fecha N+1 si debe su Fecha N; pero si dos rivales ya están libres, juegan de inmediato sin esperar que termine la fecha global.',
      description:
        'Para evitar cuellos de botella en la tele y en la juntada, el torneo no funciona con fechas globales rígidas. Si vos y tu próximo rival ya completaron y cerraron sus partidos anteriores, el sistema les desbloquea automáticamente el cruce para que puedan agarrar los joysticks y cargar el resultado, sin importar si en el otro sillón todavía están sufriendo un alargue. Lo que jamás podés hacer es saltearte una fecha propia: tu cola de partidos es estrictamente secuencial.',
      keyPoints: [
        'Bloqueo estricto: Fecha N+1 inhabilitada hasta que tu partido de Fecha N esté en estado CLOSED (RF-114).',
        'Desacoplamiento total: dos jugadores libres juegan su cruce al toque sin esperar a los demás (RF-115).',
        'Auto-liquidación de Byes: cruces libres se marcan CLOSED desde el inicio y avanzan de ronda (RF-113).',
        'Optimización total del tiempo de juntada para jugar la mayor cantidad de partidos.',
      ],
      quote: 'Cerrá tu partido anterior antes de pedir cancha para el siguiente.',
    },
    {
      id: 'tiebreakers',
      articleNumber: 6,
      title: 'Criterios Implacables de Desempate y Fair Play',
      subtitle: 'Puntos, diferencia, duelo directo y conducta deportiva',
      badge: 'Desempate · RF-32, RF-34',
      rfReference: 'RF-32, RF-34',
      summary:
        'En fase de liga o grupos, la tabla desempata con rigor olímpico: Puntos, Diferencia de Gol, Duelo Directo, Partidos Ganados y Fair Play (Tarjetas Rojas y Amarillas).',
      description:
        'Si dos o más participantes terminan con la misma cantidad de puntos, el sistema no tira monedas en la tabla: aplica una cascada estricta y matemática de desempate en seis niveles sucesivos. Si pegaste patadas de más y coleccionaste tarjetas, la conducta antideportiva te va a costar la clasificación.',
      keyPoints: [
        '1° Criterio: Puntos Totales (PTS).',
        '2° Criterio: Diferencia de Gol global (DG = Goles a Favor - Goles en Contra).',
        '3° Criterio: Duelo Directo (Head to Head - H2H) entre los involucrados en el empate.',
        '4° Criterio: Mayor cantidad de Partidos Ganados (PG).',
        '5° Criterio: Fair Play 1 · Menor cantidad de Tarjetas Rojas directas acumuladas (TR).',
        '6° Criterio: Fair Play 2 · Menor cantidad de Tarjetas Amarillas acumuladas (TA).',
      ],
      quote: 'Pegar patadas desleales en el descuento te puede dejar afuera de los playoffs.',
    },
    {
      id: 'walkover',
      articleNumber: 7,
      title: 'Walkover y Abandono Inmediato (0-3 Sin Vueltas)',
      subtitle: 'El que se va sin avisar o abandona pierde 0-3 y libera a los pibes',
      badge: 'Walkover · RF-116, RF-117',
      rfReference: 'RF-116, RF-117',
      summary:
        'Ante retiro voluntario o ausencia física injustificada, se aplica Walkover: todos sus partidos pasan a derrota 0-3 y los rivales quedan liberados al instante.',
      description:
        'Si un participante tiene una emergencia impostergable o tira la toalla por calentura, puede auto-declarar su abandono desde la app; en caso de que desaparezca de la juntada sin tocar el celular, el Administrador tiene la potestad de aplicar el Walkover administrativo. En ambos casos, todos los partidos del desertor (pendientes, en juego y anteriores) se sentencian automáticamente con derrota 0-3 (con 3 goles y 0 tarjetas para el contrincante) y pasan al estado Cerrado sin requerir confirmación de handshake. Sus rivales quedan inmediatamente destrabados para seguir compitiendo.',
      keyPoints: [
        'Resultado automático: 0-3 en contra en todos los partidos del participante (RF-116).',
        'Cierre automático (CLOSED) sin esperar handshake del rival (RF-117).',
        'Desbloqueo instantáneo para que los rivales avancen a la siguiente fecha o ronda.',
        'Recálculo atómico de tablas y llaves de playoffs en la base de datos.',
      ],
      quote: 'Si te vas de la juntada bancate el 0-3. Los que se quedan siguen jugando.',
    },
    {
      id: 'annual_ranking',
      articleNumber: 8,
      title: 'Gloria Anual y Escala de Puntos Enteros (N / 4)',
      subtitle: 'Puntos limpios según el tamaño de la juntada; el segundo es el último',
      badge: 'Ranking · RF-78, RF-84',
      rfReference: 'Principio 5, RF-78, RF-84',
      summary:
        'Cada torneo reparte puntos enteros para la tabla histórica anual con un multiplicador basado en N/4 participantes, premiando con creces al campeón.',
      description:
        'La gloria no es solo ganar una noche; es coronarse rey del año en el asado de fin de año. Para que un torneo de 8 o 12 jugadores valga proporcionalmente más que un cuadrangular chico, los puntos se escalan por el factor N / 4 participantes y se redondean a enteros puros. Y acordate de la máxima fundacional del grupo: "El segundo es el último". El subcampeón se lleva puntos de consuelo, pero el trofeo y el derecho a cargar a todos en el grupo de WhatsApp le pertenecen al campeón.',
      keyPoints: [
        'Campeón (1° puesto): 10 × (N / 4) puntos (Ej: 4 jugadores = 10 pts; 8 jugadores = 20 pts; 12 jugadores = 30 pts).',
        'Subcampeón (2° puesto): 7 × (N / 4) puntos (Ej: 4 jugadores = 7 pts; 8 jugadores = 14 pts; 12 jugadores = 21 pts).',
        'Tercer Puesto (3° puesto): 5 × (N / 4) puntos (Ej: 4 jugadores = 5 pts; 8 jugadores = 10 pts; 12 jugadores = 15 pts).',
        'Cuarto Puesto (4° puesto): 3 × (N / 4) puntos (Ej: 4 jugadores = 3 pts; 8 jugadores = 6 pts; 12 jugadores = 9 pts).',
        'Premio por Participación: 1 punto para todos los que hayan disputado el torneo.',
      ],
      quote: 'El segundo es el primero de los que pierden. La gloria eterna es solo para el campeón.',
    },
  ],
};

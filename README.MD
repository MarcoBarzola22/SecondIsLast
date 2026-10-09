# 🏆 Second is Last

**Second is Last** es un gestor de torneos locales (offline) diseñado para organizar rápidamente competiciones entre amigos. Creado inicialmente para esas noches de PES 6, su diseño "Arena Cyberpunk" y su flexibilidad lo hacen ideal para cualquier videojuego competitivo (FIFA, Dragon Ball, Mortal Kombat, etc.).

Este MVP está pensado para ser rápido, efímero y no interrumpir la acción: cargas los jugadores, sorteas los cruces y empiezas a jugar.

## ✨ Características Principales

- **Brackets Asimétricos Dinámicos:** Soporte nativo para 4, 5 o 6 jugadores, calculando automáticamente los pases directos ("Byes") y la fase de "Play-in".
- **Draft de Equipos y Temáticas:** Ruleta de temáticas (ej. "Clásicos", "Liga MX") y asignación de equipos/personajes por jugador tras un sorteo de orden.
- **Gestión de Partidos Completa:** Soporte para partidos de Ida y Vuelta, cálculo de resultado global en tiempo real y desempates por penales/gol de oro.
- **Tabla de Posiciones Histórica:** Acumulación de puntos por posición final en cada torneo (Campeón, Subcampeón, 3er Puesto, etc.).
- **Persistencia Local:** Todos los datos del torneo y el historial de los jugadores se guardan en el `localStorage` del navegador para no perder el progreso si se recarga la página.

## 🛠️ Stack Tecnológico (MVP)

- **Frontend:** React 19, TypeScript
- **Estilos:** Tailwind CSS (Estética oscura, neón y E-Sports)
- **Iconos:** Lucide React
- **Almacenamiento:** `localStorage` (Preparado para futura migración a Prisma/SQLite)

## 🚀 Inicio Rápido

Para correr el proyecto en tu máquina local y empezar a jugar hoy mismo:

1. Clona este repositorio.
2. Instala las dependencias:
   ```bash
   npm install
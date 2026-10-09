# 🏆 Second is Last

**Second is Last** es un gestor de torneos locales (offline) diseñado para organizar rápidamente competiciones entre amigos. Creado para esas juntadas de PES 6, su diseño "Arena Cyberpunk" y su flexibilidad lo hacen ideal para cualquier videojuego competitivo (PES, FIFA, Mortal Kombat, etc.).

Este MVP está pensado para ser rápido, efímero y robusto: no interrumpe la acción, guarda todo en el navegador y no se rompe en medio de la juntada.

---

## ✨ Características Principales

- **Brackets Asimétricos Dinámicos:** Soporte nativo para 4, 5 y 6 jugadores sorteados con Fisher-Yates, calculando automáticamente los pases directos ("Byes"), la fase de Cuartos (Play-in), Semifinales, Final y 3er Puesto.
- **Ruleta de Temáticas:** Sorteo animado y estocástico entre temáticas clásicas de PES 6 (*Clásicos PES 6*, *Apertura 2006*, *Europa Actual*, *Selecciones Mundial 06*, *Solo Sudamérica*).
- **Draft de Equipos por Turnos:** Sorteo aleatorio del orden de elección, selección obligatoria de equipos por turnos y validación contra nombres duplicados o vacíos.
- **Gestión de Partidos a Ida y Vuelta:** Cómputo del resultado Global en tiempo real, validación estricta de goles (0 a 99), desempate obligatorio por penales y posibilidad de corregir llaves previas.
- **Podio y Cierre Automatizado:** Reconocimiento de Campeón (+10 PTS), Subcampeón (+7 PTS), 3er Puesto (+5 PTS), 4to Puesto (+3 PTS) y eliminados en Cuartos (+1 PTS).
- **Tabla Histórica Oficial:** Columnas exactas: `Rank`, `JUGADORES` (Apellido, Nombre), `PTS`, `PJ`, `PG`, `PP`, `GF`, `GC`, `DG`, `TJ`. Criterio de desempate automático: PTS desc → DG desc → GF desc → Apellido asc.
- **Persistencia Silenciosa y Efímera:** Todo el estado vive en `localStorage` bajo una clave atómica versionada (`second-is-last:data`). Cuenta con autosave reactivo, recuperación ante datos corruptos y Error Boundary global para evitar pantallas en blanco.

---

## 🛠️ Stack Tecnológico

- **Frontend:** React 19, TypeScript (`strict`)
- **Build tool:** Vite 8
- **Estilos:** Tailwind CSS v4 (`@tailwindcss/vite`, paleta basada en OKLCH y utilidades cyberpunk `panel-metal`, `glow-green`, `glow-blue`)
- **Iconografía:** Lucide React
- **Testing:** Vitest (tests unitarios para la capa de dominio y almacenamiento)
- **Almacenamiento:** `localStorage` mediante adaptador aislado versionado en `src/storage/`

---

## 🏛️ Arquitectura del Proyecto (SDD)

El proyecto sigue una estricta separación de responsabilidades basada en la metodología Spec-Driven Development:

```
src/
├── domain/            # Lógica pura desacoplada (SIN React, 100% testeable con Vitest)
│   ├── types.ts       # Modelos y contratos de TypeScript
│   ├── random.ts      # Algoritmo Fisher-Yates con RNG inyectable
│   ├── players.ts     # Normalización, formato y validación de duplicados
│   ├── theme.ts       # Catálogo y sorteo de temáticas
│   ├── draft.ts       # Turnos y reglas del draft
│   ├── bracket.ts     # Generador de llaves asimétricas (4, 5 y 6 jugadores)
│   ├── series.ts      # Goles, cálculo de global, penales y propagación
│   └── standings.ts   # Podio, cómputo de estadísticas y ranking histórico
├── storage/           # Adaptador de persistencia con tolerancia a fallos
│   ├── schema.ts      # Esquema versionado (SCHEMA_VERSION = 1)
│   └── storage.ts     # loadAppData y saveAppData con try/catch silencioso
├── state/             # Estado global con React Context + useReducer
│   ├── actions.ts     # Unión de acciones tipadas
│   ├── reducer.ts     # Reducer delgado con guardas de ciclo de vida
│   └── AppContext.tsx # Provider, hooks useAppState / useAppDispatch y autosave
└── components/        # Capa de presentación visual (React 19 + Tailwind CSS)
    ├── ui/            # Panel metálico, botones temáticos, inputs
    ├── layout/        # Header con StepNav y botón de abandonar
    ├── views/         # RegistrationView, ThemeView, DraftView, SeriesCard, BracketView, PodiumPanel, StandingsView
    └── ErrorBoundary.tsx # Captura de errores de render con recuperación amigable
```

---

## 🚀 Inicio Rápido

### 1. Clonar el repositorio
```bash
git clone https://github.com/MarcoBarzola22/SecondIsLast.git
cd SecondIsLast
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Ejecutar el servidor de desarrollo
```bash
npm run dev
```
Abre en tu navegador la URL indicada (habitualmente `http://localhost:5173`).

---

## 🧪 Pruebas y Construcción

### Ejecutar tests unitarios (Vitest)
```bash
npm test
```
Ejecuta la suite completa de tests de la lógica de dominio y del adaptador de persistencia.

### Compilar para producción (TypeScript + Vite)
```bash
npm run build
```
Genera los artefactos optimizados en la carpeta `dist/`.

---

## 📜 Reglas de la Casa
> *"El segundo es el primero de los perdedores."*
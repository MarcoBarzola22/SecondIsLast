# Constitución — Second is Last

1. **Stack Full-Stack unificado:** React 19 + Tailwind en frontend; Node/Express + PostgreSQL (Prisma) + Socket.io en backend; 100% TypeScript estricto de punta a punta.
2. **Spec como contrato inquebrantable:** Ningún código se escribe sin un Requisito Funcional (RF) previo en `spec.md` y su tarea asignada en `tasks.md`.
3. **Dominio puro y desacoplado:** Reglas de torneo, llaves y puntuación residen en `src/domain/` como funciones puras sin dependencias de UI ni I/O, reusables en cliente y servidor.
4. **Política de testing estricta:** Tests unitarios obligatorios para toda la lógica de dominio y tests de integración en endpoints/eventos Socket críticos antes de cerrar cada tarea.
5. **Persistencia relacional y resiliencia en vivo:** PostgreSQL como única fuente de verdad con sincronización vía WebSockets; manejo tolerante a desconexiones para jamás crashear en plena juntada.
6. **Idioma y tono:** Código, tipos, esquemas, tests y commits en inglés. Textos y mensajes de UI exclusivamente en español rioplatense ("vos", "jugá", "confirmá").

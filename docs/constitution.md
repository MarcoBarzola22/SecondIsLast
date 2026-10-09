# Constitución — Second is Last

1. **Stack mínimo:** React 19 + TypeScript (`strict`) + Tailwind CSS. Solo se suman dependencias de UI ya presentes en la maqueta (ej. Lucide); cualquier otra requiere aprobación explícita en `plan.md`.
2. **Persistencia efímera:** Todo el estado (torneo activo e historial) vive en `localStorage`. Sin backend, sin APIs externas, sin cookies.
3. **Lógica pura separada:** Llaves, byes, global ida/vuelta y puntos viven en `src/domain/` como funciones puras y testeables. Ningún archivo de `domain/` importa React.
4. **Idioma:** Código, tipos, nombres de archivo y commits en inglés. Todo texto visible al usuario en español rioplatense ("vos", "jugá", "cargá").
5. **No crashear en la juntada:** Lectura/escritura de storage y parseo con `try/catch` y valores por defecto seguros. Un Error Boundary global evita la pantalla en blanco. Los errores se loguean en consola, nunca se lanzan a la UI.
6. **Storage tras un adaptador:** Solo `src/storage/` toca `localStorage`, con datos versionados (`schemaVersion`). Así migrar a otra persistencia no rompe al resto de la app.

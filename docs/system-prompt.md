# Contexto de Desarrollo: Visiovial Rural

Sos un Ingeniero de Software Senior especializado en desarrollo Full-Stack con Next.js (App Router), TypeScript, Tailwind CSS y Supabase. Tu objetivo es desarrollar de forma limpia, modular y segura la plataforma "Visiovial Rural": relevamiento del estado de caminos rurales de la Provincia de Buenos Aires.

## Reglas estrictas de desarrollo

1. **Next.js App Router.** Usar obligatoriamente la arquitectura de directorios `app/`. Priorizar Server Components para renderizado de datos y Server Actions para mutaciones (formularios, auth). Versión estable actual (16.x); el interceptor de rutas se llama `proxy.ts` (antes `middleware.ts`).
2. **Tipado estricto.** No se permite `any`. Todos los componentes y respuestas de Supabase se tipan con los tipos generados por la CLI (`lib/supabase/database.types.ts`).
3. **Estados de UI.** Toda acción del usuario (subida de archivos, filtros de mapa, login) contempla estados de carga, error y éxito con feedback visual claro.
4. **Mobile-first.** El sistema se usa principalmente en el campo. Interfaces de carga limpias, botones grandes, adaptadas a conexiones móviles intermitentes (Edge/3G/4G).
5. **Base de datos limpia.** No inventar tablas ni columnas que no estén declaradas en `docs/database-schema.sql`. Cualquier cambio de esquema se hace primero en ese archivo y en una migración nueva en `supabase/migrations/` (0001 a 0005 hoy, en orden; `0003a` antes que `0003`). `docs/database-schema.sql` es el **estado final**: equivale a aplicar todas las migraciones en orden y una instalación nueva puede correr solo ese archivo.
6. **Secretos.** Credenciales solo en `.env.local` (ignorado por git). La clave `service_role` / `sb_secret_*` se usa únicamente en código de servidor.
7. **Tests.** Vitest + Testing Library para lógica y componentes. Cobertura objetivo 80% en `lib/` y Server Actions.
8. **Cliente/servidor.** `cobertura_tramos`, `puntos_eventos` y `logros` no tienen política de RLS de escritura: solo se insertan con el cliente admin (`crearClienteAdmin`, clave secreta) y únicamente después de validar el payload y la plausibilidad del recorrido en el servidor (Server Action). El cliente nunca calcula puntos, cobertura ni insignias; solo los muestra.

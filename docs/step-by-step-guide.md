# Guía de implementación por fases

## Fase 0: Scaffold
- [x] `create-next-app` con TypeScript, Tailwind, App Router, ESLint. Sin `src/`.
- [x] Vitest + Testing Library configurados. Script `npm test`.
- [x] `.env.example` con las variables requeridas.

## Fase 1: Infraestructura Supabase
- [x] `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- [x] Migración `supabase/migrations/0001_schema.sql` idéntica a `docs/database-schema.sql`, aplicada al proyecto.
- [x] Tipos generados en `lib/supabase/database.types.ts`.
- [x] Cliente servidor `lib/supabase/server.ts` con `@supabase/ssr` (cookies).
- [x] Cliente navegador `lib/supabase/client.ts`.
- [x] Cliente admin `lib/supabase/admin.ts` (clave secreta, solo servidor).
- [x] `proxy.ts` que refresca sesión y protege `/dashboard/*`.

## Fase 2: Autenticación y onboarding
- [x] `app/login/page.tsx` mobile-first con login y registro.
- [x] Server Actions `signIn`, `signUp`, `signOut` en `app/login/actions.ts`.
- [x] Registro pide nombre y partido (dropdown desde `lib/partidos.ts`); van en `options.data` y el trigger crea el perfil.

## Fase 3: Dashboard y caminos
- [x] `app/dashboard/page.tsx` con KPIs: kilómetros relevados (desde `metadata.km`), fallas activas, últimos reportes.
- [x] `app/dashboard/caminos/page.tsx` con lista y buscador por `nombre_codigo`.
- [x] Alta de camino (rol municipio/auditor).

## Fase 4: Carga de viaje y simulación IA
- [x] `app/dashboard/cargar-viaje/page.tsx`: selección de camino, origen de datos, km recorridos, dropzone HTML5 de imágenes/videos.
- [x] Subida directa a bucket `evidencia-vial` en carpeta `{uid}/{relevamiento_id}/`.
- [x] `app/api/procesar-ia/route.ts`: recibe `relevamiento_id`, genera fallas con coordenadas dentro del partido del usuario, inserta en `fallas_deteccion`, marca `procesado_ia = true`.

## Fase 5: Mapa
- [x] `components/MapaRelevamiento.tsx` con react-leaflet y tiles OSM (carga dinámica, sin SSR).
- [x] Marcadores por severidad: rojo alta, amarillo media, verde baja.
- [x] Filtros por tipo de falla y municipio.

## Fase 6 (futura): Capas base UBA
- [ ] Recibir shapefiles/GeoJSON de caminosrurales@agro.uba.ar (segmentos, tambos, industrias, escuelas).
- [ ] Tabla `capas_base` con PostGIS y overlay en el mapa.

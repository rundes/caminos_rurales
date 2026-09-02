# Guía de implementación por fases

## Fase 0: Scaffold
- [ ] `create-next-app` con TypeScript, Tailwind, App Router, ESLint. Sin `src/`.
- [ ] Vitest + Testing Library configurados. Script `npm test`.
- [ ] `.env.example` con las variables requeridas.

## Fase 1: Infraestructura Supabase
- [ ] `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- [ ] Migración `supabase/migrations/0001_schema.sql` idéntica a `docs/database-schema.sql`, aplicada al proyecto.
- [ ] Tipos generados en `lib/supabase/database.types.ts`.
- [ ] Cliente servidor `lib/supabase/server.ts` con `@supabase/ssr` (cookies).
- [ ] Cliente navegador `lib/supabase/client.ts`.
- [ ] Cliente admin `lib/supabase/admin.ts` (clave secreta, solo servidor).
- [ ] `proxy.ts` que refresca sesión y protege `/dashboard/*`.

## Fase 2: Autenticación y onboarding
- [ ] `app/login/page.tsx` mobile-first con login y registro.
- [ ] Server Actions `signIn`, `signUp`, `signOut` en `app/login/actions.ts`.
- [ ] Registro pide nombre y partido (dropdown desde `lib/partidos.ts`); van en `options.data` y el trigger crea el perfil.

## Fase 3: Dashboard y caminos
- [ ] `app/dashboard/page.tsx` con KPIs: kilómetros relevados (desde `metadata.km`), fallas activas, últimos reportes.
- [ ] `app/dashboard/caminos/page.tsx` con lista y buscador por `nombre_codigo`.
- [ ] Alta de camino (rol municipio/auditor).

## Fase 4: Carga de viaje y simulación IA
- [ ] `app/dashboard/cargar-viaje/page.tsx`: selección de camino, origen de datos, km recorridos, dropzone HTML5 de imágenes/videos.
- [ ] Subida directa a bucket `evidencia-vial` en carpeta `{uid}/{relevamiento_id}/`.
- [ ] `app/api/procesar-ia/route.ts`: recibe `relevamiento_id`, genera fallas con coordenadas dentro del partido del usuario, inserta en `fallas_deteccion`, marca `procesado_ia = true`.

## Fase 5: Mapa
- [ ] `components/MapaRelevamiento.tsx` con react-leaflet y tiles OSM (carga dinámica, sin SSR).
- [ ] Marcadores por severidad: rojo alta, amarillo media, verde baja.
- [ ] Filtros por tipo de falla y municipio.

## Fase 6 (futura): Capas base UBA
- [ ] Recibir shapefiles/GeoJSON de caminosrurales@agro.uba.ar (segmentos, tambos, industrias, escuelas).
- [ ] Tabla `capas_base` con PostGIS y overlay en el mapa.

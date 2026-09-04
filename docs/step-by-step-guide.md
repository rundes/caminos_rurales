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

## Fase 6: Capas base
- [x] Capas del piloto Maipú: `public/capas/maipu/caminos.geojson` (OSM, red vial rural con nomenclatura de Vialidad BA), `limite.geojson` (Overpass), `red-provincial.geojson` (recorte IGN/DVP), `localidades.geojson` (polígonos y POIs reutilizados de `severo_data`). Generador genérico por municipio en `scripts/generar-capas-municipio.mjs`.
- [ ] Shapefiles/GeoJSON de caminosrurales@agro.uba.ar (segmentos, tambos, industrias, escuelas) pendientes de recibir; sin tabla `capas_base` ni overlay PostGIS todavía (fuera de alcance del piloto Maipú, ver fase 10).

## Fase 7: Recorridos y cobertura
- [x] Migraciones `0003a_tipos_falla.sql` y `0003_recorridos.sql`: tablas `tramos`, `recorridos`, `cobertura_tramos`, `puntos_eventos`, `logros`; `perfiles.acepto_terminos_at`; `fallas_deteccion` reapuntada a `recorrido_id`; baja de `relevamientos`.
- [x] `scripts/seed-tramos.mjs`: siembra `public.tramos` (165 tramos, 610 km) desde `public/capas/maipu/caminos.geojson`.
- [x] Motor de cobertura puro (`lib/cobertura.ts`, `lib/track.ts`): muestreo de la geometría cada 50 m, índice espacial en grilla, regla de cobertura (60 % de las muestras a menos de 40 m del track), filtro y simplificación (Douglas-Peucker) del track GPS.
- [x] `app/terminos/`: pantalla y aceptación de términos; `proxy.ts` y `app/dashboard/layout.tsx` bloquean el resto de la app hasta aceptar.
- [x] `finalizarRecorrido` (Server Action): valida payload y plausibilidad física del track, inserta el recorrido, calcula cobertura, km nuevos/repetidos, inserta `cobertura_tramos` y observaciones, idempotente por `recorridos.id` (sellado con `procesado_at`, migración `0004_recorridos_procesado.sql`).
- [x] Cliente PWA de recorrido: grabación en `IndexedDB` (`idb`), `watchPosition` + wake lock, cola de sincronización con reintentos y backoff, pantalla de observación con evidencia (`<input capture>`, límite 15 s / 50 MB).
- [x] Baja de `cargar-viaje`, `procesar-ia`, `lib/simulador.ts`.

## Fase 8: Juego y ranking
- [x] `lib/juego.ts`: puntos por km nuevo/repetido y por observación con evidencia (`puntos_eventos`); insignias (`primer_recorrido`, `explorador_50km`, `cartografo_200km`, `localidad_completa:<localidad>`, `municipio_100`) registradas en `logros`.
- [x] Antitrampa: `evaluarPlausibilidad` (velocidad media y entre muestras, precisión GPS, km máximo por recorrido) y tope diario de puntos por usuario (`PUNTOS_MAX_DIA`).
- [x] Funciones SQL `security definer` `cobertura_municipio` y `ranking_municipio` para el dashboard.
- [x] `app/dashboard/ranking/page.tsx`: ranking del municipio, insignias propias, progreso por localidad.
- [x] `app/dashboard/mapa/page.tsx`: tramos cubiertos (verde) y pendientes (gris) sobre las capas base, observaciones por severidad.

## Fase 9: PWA
- [x] `public/manifest.json` e íconos (`scripts/generar-iconos.mjs`, generados con `sharp` desde un SVG).
- [x] `public/sw.js`: service worker manual, sin librerías; precache del shell, network-first para navegación y assets de Next, cache-first para capas GeoJSON, íconos y teselas IGN/OSM.
- [x] Registro del service worker en un client component (`components/RegistroSw.tsx`) desde `app/layout.tsx`; `manifest` y `theme-color` en los metadatos de Next.

## Fase 10 (pendiente)
- [ ] Google Cloud Storage con credencial real (`ALMACENAMIENTO=gcs`, `GCS_SERVICE_ACCOUNT_KEY`, bucket `maipu-pba` con lectura pública y CORS) — hoy el proveedor por defecto es Supabase Storage.
- [ ] App nativa (o wrapper) para grabación de recorrido en segundo plano; la PWA solo graba con la app abierta en primer plano.
- [ ] Moderación de observaciones.
- [ ] Shapefiles/capas UBA (ver fase 6) y edición de geometrías de tramos.

## Fase 11: Sensores
- [x] Migraciones `0006a_enums_sensor.sql` (enums `calidad_segmento`, `origen_observacion`, aplicada antes que `0006` por la misma restricción que `0003a`) y `0006_muestras_sensor.sql`: tabla `muestras_sensor`, columnas `origen`/`magnitud`/`tramo_id` en `fallas_deteccion`, función `rugosidad_tramos`.
- [x] `lib/sensores/umbrales.ts`: umbrales calibrables de calidad de segmento, impacto, frenada/lateral y radio de asignación a tramo.
- [x] Captura cliente: `DeviceMotionEvent`, permiso iOS pedido en el toque de "Iniciar recorrido", calibración de gravedad, agregación por segmento (5 s / 100 m), detección de impactos con debounce.
- [x] Almacenamiento local en IndexedDB (store de sensores, versión 3) y envío de agregados (`muestras`, `impactos`) en el payload de `finalizarRecorrido`.
- [x] Servidor: asignación de segmento/impacto al tramo más cercano, inserción de `muestras_sensor`, impactos como `fallas_deteccion` `origen = 'sensor'`, puntos `km_sensor`.
- [x] Indicador "Sensores activos" / "Sin sensores" durante la grabación.
- [x] Mapa: toggle "Estado estimado" con tramos coloreados por calidad y marcador distinto para observaciones de origen sensor.
- [x] Resumen del recorrido: km por calidad, cantidad de impactos.
- [x] Términos actualizados con el uso de sensores de movimiento.

## Fase 12 (futura)
- [ ] Cámara: registro de cuadros georreferenciados y clasificación de superficie.

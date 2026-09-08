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

## Fase 12: cuadros de cámara
- [x] Migración `0007_cuadros.sql`: tabla `cuadros` (posición, rumbo, velocidad, `tramo_id`, ruta al objeto) con RLS por municipio/propio y la función `cuadros_por_tramo`.
- [x] `lib/juego.ts`: puntos por cuadros registrados (`PUNTOS_POR_CUADROS = 1` cada `CUADROS_POR_PUNTO = 10`, tope `PUNTOS_MAX_CUADROS = 100`), otorgados de forma idempotente por `registrarCuadros`.
- [x] `registrarCuadros` (Server Action): valida sesión y payload (≤ 200 por llamada), verifica el recorrido propio, asigna `tramo_id` con el asignador de sensores (40 m), upsert por `(recorrido_id, t)`.
- [x] Cliente: store `cuadros` en IndexedDB (v4), captura JPEG 1280 px / calidad 0,7 vía canvas cada 100 m o 10 s (≥ 15 km/h), tope 2000 cuadros y aviso de espacio (`navigator.storage.estimate()`), permiso de cámara pedido en el gesto de "Iniciar recorrido", botón "Cámara" para apagar/prender el stream sin cortar la grabación.
- [x] Cola de subida separada (`colaCuadros`), diferida hasta que el recorrido está `subido`, en lotes de 20, con reintentos y backoff; "Subir cuadros solo con WiFi" por defecto y botón "Subir ahora con datos".
- [x] Resumen del recorrido: cuadros capturados/pendientes de subir.
- [x] Mapa: capa "Cuadros" (toggle independiente) con miniatura firmada y navegación anterior/siguiente por tramo; tooltip del tramo con cantidad de cuadros.
- [x] Términos actualizados con el uso de la cámara.

## Fase 12b (futura)
- [ ] Clasificación de superficie y detección de baches con modelo entrenado sobre los cuadros; difuminado de caras/patentes.

## Fase 13: Endurecimiento (ola 1, rama `feat/hardening`)
- [x] A. Seguridad de datos (migración `0008_seguridad.sql`): perfiles inmutables desde la app (rol, municipio_id, id) con `revoke update` + trigger `perfiles_no_escalar`; altas de `recorridos` acotadas al municipio propio y sin update desde la app; altas de `fallas_deteccion` solo con `origen = 'manual'`; `search_path` fijo en todas las funciones `security definer`; códigos de invitación por municipio (`codigos_invitacion`, `MAIPU-2027`) y pantalla `/pendiente`; índices faltantes.
- [x] B. Servidor: validación, cupos, carrera (migración `0009_cupos.sql`): `filaObservacion` valida el prefijo `{uid}/{recorridoId}/`; `observacionId` uuid o `cuadro-<t>` con regex; puntos por cuadros pasan por `limitarPorTopeDiario`; reclamo atómico de `procesado_at` contra la carrera de finalización; cupos diarios (`uso_diario`, `consumir_cupo`: 1500 subidas, 30 recorridos); `.limit()` en consultas sin tope; punto único por `(recorrido_id, motivo)`.
- [x] C. Cliente: memoria, pérdida de datos, grabación: IndexedDB v5 con store `blobs` separado e índice compuesto `[recorridoId, estadoSubida]`; nav inferior bloqueada durante la grabación con confirmación al salir; recorridos en error visibles con "Reintentar"; Douglas-Peucker con pila explícita.
- [x] D. Lectura y mapa: `Promise.all` en `mapa/page.tsx`; `unstable_cache` por `municipio:<slug>` (`lib/cache.ts`) con `revalidateTag`; cuadros cargados solo al activar el toggle; `preferCanvas`, `useMemo`/`React.memo` en capas; headers de seguridad y cache inmutable (`next.config.ts`); SW afinado.
- [x] E. Operación: `.github/workflows/ci.yml` (tipos, lint, tests con cobertura, build) y `smoke.yml` manual; umbrales de cobertura en `vitest.config.mts`; `lib/env.ts` (zod, `envServidor`/`envPublico`) cableado en los clientes de Supabase y el proveedor de almacenamiento; `engines`/`.nvmrc`; `scripts/setup-entorno.mjs` y `scripts/borrar-usuario.mjs`; `CHANGELOG.md`.

## Fase 14: producto (ola 2, rama `feat/producto`)
- [x] A. Estados de observación (migración `0010_estado_observaciones.sql`, `feat(observaciones)`): enum `estado_observacion` (pendiente / en obra / resuelta / descartada) y columnas de seguimiento en `fallas_deteccion`; mismo patrón de tres capas que `perfiles` en 0008 — columnas escribibles granuladas (`revoke`/`grant update` explícito), política `fallas_update_estado_gestion` (RLS filtra filas, solo municipio/auditor de su propio municipio) y trigger `fallas_estado_no_escalar` (corta cualquier cambio de estado colado por la política `fallas_update_propio` del dueño, RLS no filtra columnas); función `resumen_observaciones(p_municipio)`. Server Action `cambiarEstado`: el gate real es RLS + trigger, no la función.
- [x] B. `/dashboard/observaciones`: listado con estado, `EstadoSelect` (municipio/auditor) o badge de solo lectura para el resto, conteos por estado, export CSV (`lib/exportar.ts`: `aCsv` RFC 4180 + BOM UTF-8) y GeoJSON (`aGeoJson`), mismos exportes disponibles para cobertura por tramo (`app/dashboard/cobertura/export`).
- [x] C. Filtros compartidos (`components/FiltrosObservaciones.tsx`: tipo, severidad, origen, estado, rango de fechas; sin selector de municipio, RLS ya limita todo a la del usuario) montados en el mapa y en la lista de observaciones, que filtra en la propia consulta en vez de traer 500 filas y filtrar en el navegador.
- [x] D. Cobertura por km: `TarjetaCobertura`/`BarraCobertura` muestran "X,X km de Y,Y km (Z%)" como cifra principal y "N de M tramos" como texto secundario (`lib/cobertura-resumen.ts`, formato es-AR).
- [x] E. "Caminos" → "Tramos" (`feat(tramos)`): baja de `app/dashboard/caminos` (tabla legacy, sin relación con la cobertura real); `/dashboard/tramos` (listado con km, veces cubierto, estado estimado, cuadros y última visita; búsqueda y orden por km/última visita) y `/dashboard/tramos/[id]` (detalle con mapa enfocado, observaciones y cuadros del tramo; 404 si el tramo no es del municipio propio vía RLS `tramos_select`). Sin alta de tramos: la tabla no tiene todavía política de insert para municipio/auditor (ver Pendiente en el plan de endurecimiento y alcance).
- [x] F. Grabación enfocada (`feat(grabacion)`): se oculta la tarjeta de cobertura y el resto del cromo del dashboard mientras se graba (`OcultarSiGrabando`), métricas grandes y de alto contraste, botón "Observación" flotante alcanzable con el pulgar (mín. 56 px) y "Finalizar" con confirmación en dos pasos; corte de segmento al pausar/reanudar (`lib/local/grabador.ts`, `partirEnSegmentos` en `lib/track.ts`) para no unir con una recta la traza; `ResumenRecorrido` muestra el error de subida agotada con reintento visible.
- [x] G. PWA instalable: `BannerInstalar` + `lib/pwa/instalacion.ts` escuchan `beforeinstallprompt` en Chromium y muestran instrucciones manuales en iOS Safari (Compartir → Agregar a inicio; detección por user-agent, documentada como excepción deliberada); se recuerda el descarte en `localStorage` (con try/catch) y nunca se muestra si la app ya corre instalada. Aviso de batería (`AvisoBateria` + `lib/bateria.ts`) antes de grabar, con nivel real vía Battery Status API cuando existe y mensaje genérico en iOS.
- [x] H. Interfaz solo en modo claro: `color-scheme: light` fijo en `app/globals.css`, sin ninguna regla `prefers-color-scheme` (la app se usa a pleno sol manejando y nunca tuvo un modo oscuro completo, solo variables de fondo/texto sueltas que dejaban texto invisible sobre fondos del mismo tono). Barrido de accesibilidad táctil en toda la app: `:focus-visible` global y targets reales de 44 px (`min-h-11`, no solo `min-height` de CSS heredado).
- [x] I. Recuperar contraseña y reenvío (`feat(auth)`): `/recuperar` pide el email (`resetPasswordForEmail`, `redirectTo` armado desde `SITE_URL` o los headers de la petición, nunca del input del cliente) con respuesta siempre neutra; `app/auth/confirm/route.ts` exchangea el `code` PKCE del enlace por una sesión y redirige a `/nueva-clave`; contraseña mínima de 8 caracteres validada en cliente y servidor con el mismo mensaje. Reenvío de confirmación desde el login si `signIn` falla por email sin confirmar, con cooldown de 60 s (`lib/reenvio-cooldown.ts`). `lib/auth-mensajes.ts` traduce los mensajes de Supabase Auth al castellano en las cuatro Server Actions de auth, sin revelar nunca si una cuenta existe.
- [x] J. `scripts/smoke.mjs`: sección 11 (estados de observación, agregada en A) y cobertura nueva de `/dashboard/tramos`, `/dashboard/tramos/[id]`, baja de `/dashboard/caminos`, exportes CSV/GeoJSON, `/recuperar`, `/nueva-clave` y `/auth/confirm`.

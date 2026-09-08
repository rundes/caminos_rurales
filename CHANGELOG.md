# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
versionado según [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

## [0.8.0] - 2026-09-08

### Cierre de rama `feat/pendientes`

- Lecturas firmadas en GCS (`lib/almacenamiento/gcs.ts`): antes servía las
  evidencias como URL pública fija, lo que exigía un bucket público y
  exponía las evidencias de todos los municipios a quien adivinara una
  ruta. Ahora firma lecturas con `getSignedUrl({ action: 'read' })` V4,
  mismo vencimiento (1 h) y mismo contrato que Supabase Storage;
  `ProveedorAlmacenamiento.urlsLectura` firma en lote (Supabase agrupa con
  `createSignedUrls`, GCS con concurrencia acotada vía `lib/concurrencia.ts`
  al no tener API de lote); `envServidor()` valida
  `GCS_SERVICE_ACCOUNT_KEY` al arrancar en vez de en la primera firma.
- Difuminado de privacidad en los cuadros (`lib/privacidad/`): difumina
  caras (BlazeFace) y personas/vehículos (COCO-SSD) en el dispositivo antes
  de subir cada cuadro, dentro de la cola de subida (no durante la
  grabación); si difuminar falla, el cuadro no se sube sin procesar y
  reintenta con el mismo backoff. IndexedDB v6 (`cuadros.difuminado`).
  Ajuste "Difuminar caras y vehículos" (activado por defecto) en
  `PantallaInicio`, progreso en `ResumenRecorrido`. No cubre patentes
  sueltas sin vehículo detectado ni caras chicas/lejanas/en ángulo raro
  (documentado en README y en los términos).
- Alta y edición de tramos para municipio/auditor (migración
  `0011_alta_tramos.sql`): políticas `tramos_insert_gestion` /
  `tramos_update_gestion`; columna `activo` en vez de `delete` (un tramo con
  historial de cobertura no puede desaparecer; `cobertura_municipio`, el
  listado y la capa del mapa solo cuentan/muestran tramos activos, pero
  `rugosidad_tramos`, `cuadros_por_tramo` y el detalle nunca ocultan el
  historial ya registrado); trigger `tramos_auditoria`. `/dashboard/tramos/
  nuevo` y `/dashboard/tramos/[id]/editar`, con un mapa Leaflet de
  click-to-add-vertex y km en vivo; el km siempre se recalcula en el
  servidor desde la geometría (`kmDeGeometria`), nunca lo manda el cliente.
- Mitigación de la interrupción de grabación en 2° plano: como una PWA no
  puede grabar GPS con la pantalla apagada o la app en 2° plano (límite de
  la plataforma, no de la app), una interrupción ya no queda invisible ni
  se cuenta como recorrido cubierto. Se detecta con un watchdog de
  `UMBRAL_INTERRUPCION_MS` (30 s: por encima del timeout de 20 s de cada
  lectura de GPS, para no confundir una lectura lenta con una
  interrupción) reforzado por `visibilitychange`/`pageshow`/`pagehide` y la
  pérdida inesperada del wake lock (`hooks/useGrabadorGps.ts`,
  `hooks/useWakeLock.ts`). Al detectarla, corta la grabación igual que una
  pausa manual (reusa `cortes`/`pausarGrabador`/`reanudarGrabador`, sin un
  mecanismo paralelo) y avisa en vivo ("Se interrumpió la grabación: el
  tramo entre las X y las Y no quedó registrado") y en `ResumenRecorrido`.
  `retomar` (recorrido retomado tras cerrar la app) aplica el mismo umbral
  contra el último punto guardado. Verificado contra `lib/cobertura.ts`:
  el cálculo de cobertura del servidor ya compara cada punto real contra
  las muestras del tramo (índice espacial), sin unir el track con una
  línea, así que un hueco nunca cuenta como cubierto — no hizo falta
  cambiarlo, solo se agregó una prueba que lo fija (`__tests__/cobertura.test.ts`).
  `PantallaInicio` avisa antes de arrancar que hay que dejar la pantalla
  encendida y la app en primer plano.

### Ola 2: producto (0.7.0)

- Migración `0010_estado_observaciones.sql`: enum `estado_observacion`
  (pendiente / en obra / resuelta / descartada) y columnas de seguimiento en
  `fallas_deteccion`; columnas escribibles granuladas (mismo patrón que
  `perfiles` en 0008); política `fallas_update_estado_gestion` y trigger
  `fallas_estado_no_escalar` limitan el cambio de estado a municipio/auditor
  sobre su propio municipio; función `resumen_observaciones(p_municipio)`.
- `/dashboard/observaciones`: listado con estado, filtros compartidos
  (`FiltrosObservaciones`: tipo, severidad, origen, estado, rango de
  fechas), `EstadoSelect` para municipio/auditor (badge de solo lectura para
  el resto), conteos por estado, export CSV y GeoJSON (`lib/exportar.ts`:
  `aCsv` RFC 4180 con BOM UTF-8, `aGeoJson`) también disponible para
  cobertura por tramo.
- Cobertura expresada en kilómetros: `TarjetaCobertura`/`BarraCobertura`
  muestran "X,X km de Y,Y km (Z%)" como cifra principal y "N de M tramos"
  como texto secundario (`lib/cobertura-resumen.ts`, formato es-AR).
- "Caminos" → "Tramos": baja de `app/dashboard/caminos` (tabla legacy sin
  relación con la cobertura real); `/dashboard/tramos` (listado con km,
  veces cubierto, estado estimado, cuadros y última visita; búsqueda y
  orden por km/última visita) y `/dashboard/tramos/[id]` (detalle con mapa
  enfocado, observaciones y cuadros del tramo, 404 si no es del municipio
  propio vía RLS). Sin alta de tramos todavía: la tabla no tiene política de
  insert para municipio/auditor.
- Layout de grabación enfocado: se oculta la tarjeta de cobertura y el resto
  del cromo del dashboard mientras se graba (`OcultarSiGrabando`), métricas
  grandes y de alto contraste, botón "Observación" flotante alcanzable con
  el pulgar y "Finalizar" con confirmación en dos pasos; corte de segmento
  al pausar/reanudar para no unir con una recta la traza; acuse con
  reintento visible si falla la subida al guardar.
- Instalación como PWA: `BannerInstalar` (`lib/pwa/instalacion.ts`) escucha
  `beforeinstallprompt` en Chromium y muestra instrucciones manuales en iOS
  Safari (Compartir → Agregar a inicio); aviso de batería
  (`AvisoBateria`/`lib/bateria.ts`) antes de grabar, con nivel real vía
  Battery Status API cuando existe.
- Interfaz solo en modo claro: `color-scheme: light` fijo y sin reglas
  `prefers-color-scheme` (la app se usa a pleno sol manejando y nunca tuvo
  un modo oscuro completo). Barrido de accesibilidad táctil: `:focus-visible`
  global y targets reales de 44 px en toda la app.
- Recuperar contraseña (`/recuperar`, `/nueva-clave`,
  `app/auth/confirm/route.ts`: exchange del `code` PKCE por sesión, flujo
  server-only) y reenvío de confirmación desde el login (`lib/reenvio-cooldown.ts`,
  cooldown de 60 s); `lib/auth-mensajes.ts` traduce los mensajes de Supabase
  Auth al castellano en las cuatro Server Actions de auth.
- `scripts/smoke.mjs`: sección 11 (estados de observación) y cobertura
  nueva de tramos, exportes, `/recuperar`, `/nueva-clave` y `/auth/confirm`.

### Ola 1: endurecimiento (0.6.0)

- CI (`ci.yml`): tipos (`tsc --noEmit`), lint (`eslint --max-warnings=0`), tests
  con cobertura y build en cada PR y push a `main`. `smoke.yml` manual
  (`workflow_dispatch`) contra un entorno levantado en el runner.
- `lib/env.ts`: validación de variables de entorno con zod al arrancar
  (`envServidor`, cacheada, mensajes en español) y acceso literal a las
  públicas para el bundle del cliente (`envPublico`). Cableado en los clientes
  de Supabase y en el proveedor de almacenamiento.
- Umbrales de cobertura de tests en `vitest.config.mts` (incluye `hooks/**`).
- `engines.node >= 20.9`, `.nvmrc` (22).
- `scripts/setup-entorno.mjs`: aplica las migraciones en el orden documentado
  y siembra los datos base de Maipú (`--solo-migraciones`, `--dry-run`).
- `scripts/borrar-usuario.mjs <email>`: baja completa de un usuario (storage
  + `auth.admin.deleteUser`, `--dry-run`).
- Migración `0008_seguridad.sql`: perfiles inmutables desde la app (rol,
  municipio, id), altas de `recorridos`/`fallas_deteccion` acotadas al
  municipio y origen propios, `search_path` fijo en funciones `security
  definer`, códigos de invitación por municipio (`MAIPU-2027`), índices
  faltantes.
- Migración `0009_cupos.sql`: cupos diarios (1500 subidas, 30 recorridos) vía
  `consumir_cupo`, reclamo atómico de `procesado_at` contra la carrera de
  finalización, punto único por motivo dentro de un recorrido.
- Validación de rutas de evidencia (`{uid}/{recorridoId}/`) y de
  `observacionId` en el servidor; `.limit()` en consultas sin tope.
- Cliente: store `blobs` separado en IndexedDB (v5), nav bloqueada durante la
  grabación, confirmación al salir con datos pendientes, recorridos en error
  visibles con reintento, Douglas-Peucker sin recursión.
- Lectura: consultas en paralelo y cacheadas por municipio, cuadros cargados
  bajo demanda, mapa en canvas, headers de seguridad (HSTS, CSP, etc.) y
  cache inmutable para capas/íconos.

## [0.5.0] - 2026-09-04

### Fase 12: cuadros de cámara

- Migración `0007_cuadros.sql`: tabla `cuadros` con posición, rumbo,
  velocidad, `tramo_id` y ruta al objeto en storage; función
  `cuadros_por_tramo`.
- Captura de cuadros JPEG durante el recorrido (cada 100 m o 10 s a ≥ 15
  km/h), con tope de 2000 por recorrido y aviso de espacio libre.
- Subida diferida de cuadros (WiFi por defecto, botón para forzar con datos
  móviles), en lotes con reintentos y backoff.
- Puntos por cuadros registrados, con tope por recorrido.
- Capa "Cuadros" en el mapa con miniatura y navegación anterior/siguiente por
  tramo.

## [0.4.0] - 2026-09-03

### Fase 11: sensores del celular

- Migraciones `0006a_enums_sensor.sql` y `0006_muestras_sensor.sql`: enums de
  calidad/origen, tabla `muestras_sensor`, columnas de sensor en
  `fallas_deteccion`, función `rugosidad_tramos`.
- Captura de acelerómetro/giroscopio durante el recorrido, agregada por
  segmento (5 s / 100 m); impactos automáticos como observaciones
  `origen = 'sensor'`.
- Mapa "Estado estimado" por tramo (calidad de rugosidad) y resumen del
  recorrido con km por calidad e impactos.

## [0.3.0] - 2026-09-03

### Recorridos, cobertura y PWA

- Migraciones `0003a_tipos_falla.sql`, `0003_recorridos.sql`,
  `0004_recorridos_procesado.sql`, `0005_fallas_update.sql`: reemplazo del
  flujo de carga de viaje por recorridos GPS con cobertura por tramo, puntos,
  insignias y ranking.
- Motor de cobertura puro (muestreo, grilla espacial, Douglas-Peucker) y
  `finalizarRecorrido` idempotente.
- Cliente PWA de recorrido: grabación en IndexedDB, `watchPosition` + wake
  lock, cola de sincronización con reintentos.
- App instalable: manifest, service worker con precache y cache-first para
  capas/teselas/íconos.

## [0.2.0] - 2026-09-03

### Piloto Maipú

- Capas del partido de Maipú: red vial rural (OSM, nomenclatura Vialidad BA),
  límite administrativo, red provincial IGN/DVP, localidades y POIs.
- Generador genérico de capas por municipio (`scripts/generar-capas-municipio.mjs`).
- Almacenamiento de evidencia conmutable (Supabase Storage o GCS vía
  `ALMACENAMIENTO`).

## [0.1.0] - 2026-09-03

### MVP

- Next.js 16 (App Router) + TypeScript + Tailwind + Supabase (Auth, Postgres,
  Storage), esquema inicial con RLS (`0001_schema.sql`,
  `0002_storage_por_municipio.sql`).
- Login, registro y dashboard con KPIs.
- Carga de viaje con evidencia y simulación de detección de fallas por IA.
- Mapa de fallas por severidad con filtros.

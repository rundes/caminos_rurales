# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
versionado según [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

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

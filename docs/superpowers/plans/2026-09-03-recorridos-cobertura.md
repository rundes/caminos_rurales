# Recorridos y cobertura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recorrido GPS en vivo con observaciones, cobertura por tramo, puntos e insignias, dashboard de cobertura. Reemplaza cargar-viaje y simulador.

**Architecture:** Cliente PWA graba en IndexedDB y sincroniza con Server Actions. Servidor calcula cobertura contra `tramos` (geometrías OSM en Postgres como jsonb) con funciones puras en `lib/cobertura.ts` y reglas de juego en `lib/juego.ts`. Dashboard lee funciones SQL `security definer`.

**Tech Stack:** MVP + `idb` 8, service worker manual, `sharp` (dev, íconos), `@google-cloud/storage` 8 (servidor).

**Spec:** `docs/superpowers/specs/2026-09-03-recorridos-cobertura-design.md`. Convenciones: errores genéricos en español con `console.error('[tag]', raw)`, `ResultadoAccion`, Vitest, sin `any`, archivos < 400 líneas, funciones < 50 líneas, commits con trailers.

---

### Task 1: Migración 0003 y limpieza del flujo viejo

**Files:** `docs/database-schema.sql` (reescribir como estado final), `supabase/migrations/0003_recorridos.sql`, `supabase/migrations/0003a_tipos_falla.sql` (solo `alter type ... add value`, aplicar primero y por separado), `scripts/seed-tramos.mjs`, `lib/supabase/database.types.ts` (regenerar con `npm run tipos`, requiere `SUPABASE_ACCESS_TOKEN`), eliminar `app/dashboard/cargar-viaje/`, `app/api/procesar-ia/`, `lib/simulador.ts`, `lib/subida.ts` (se reescribe en Task 4), tests asociados; `app/dashboard/page.tsx` y `lib/kpis.ts` dejan de leer `relevamientos` (KPI provisorio: km de `recorridos`, observaciones = count fallas). `app/dashboard/layout.tsx` nav: Inicio, Caminos, Mapa, Ranking.

- [ ] `0003a_tipos_falla.sql`: `alter type tipo_falla add value if not exists 'alcantarilla_rota'; ... 'senalizacion'; ... 'otro';`
- [ ] `0003_recorridos.sql`: tipo `recorrido_estado`; tablas `tramos`, `recorridos`, `cobertura_tramos`, `puntos_eventos`, `logros`; `alter table perfiles add column acepto_terminos_at timestamptz`; `alter table fallas_deteccion drop column relevamiento_id, add column recorrido_id uuid references recorridos(id) on delete cascade, add column descripcion text, add column url_evidencia_video text`; `drop table relevamientos cascade`; índices (`recorridos(usuario_id)`, `recorridos(municipio)`, `cobertura_tramos(tramo_id)`, `fallas_deteccion(recorrido_id)`, `puntos_eventos(usuario_id)`); RLS + políticas según spec §3; funciones `cobertura_municipio(p_municipio text) returns table (localidad text, tramos int, cubiertos int, km numeric, km_cubiertos numeric)` y `ranking_municipio(p_municipio text) returns table (usuario_id uuid, nombre text, puntos bigint, posicion bigint)`, ambas `security definer`, `set search_path = public`, que verifican `p_municipio = municipio_actual()`.
- [ ] Reescribir `docs/database-schema.sql` para reflejar el estado final (0001+0002+0003), sin `relevamientos`.
- [ ] `scripts/seed-tramos.mjs`: lee `public/capas/maipu/caminos.geojson` (features con `nombre_codigo` no null), calcula km con `kmDeLineas`, localidad = sufijo de `Caminos vecinales - X` o, para códigos numéricos/RP, la localidad rural más cercana al punto medio (reusar `scripts/lib/asignar-caminos.mjs`), genera `insert into tramos ... on conflict (id) do update` y aplica vía Management API (`--dry-run` imprime). Municipio `maipu`.
- [ ] Aplicar 0003a, luego 0003, luego seed. Verificar: `select count(*) from tramos` = 165; `select cobertura_municipio('maipu')` devuelve filas con cubiertos 0.
- [ ] `npm run tipos`. Borrar código viejo y sus tests. `tsc`, `lint`, `test`, `build` verdes. Commit `feat: esquema de recorridos, cobertura y juego; tramos de Maipú; baja del flujo de carga de viaje`.

### Task 2: Motor de cobertura y reglas de juego (puro, TDD)

**Files:** `lib/cobertura.ts`, `lib/juego.ts`, `lib/track.ts`, tests.

- [ ] `lib/track.ts`: `type PuntoGps = { lat, lng, t: number, precision: number }`; `filtrarPunto(ultimo, nuevo, { precisionMax: 50, distanciaMin: 5 })`; `simplificar(puntos, toleranciaM = 10)` (Douglas-Peucker sobre lat/lng con distancia perpendicular en metros aproximada); `kmDeTrack(puntos)`.
- [ ] `lib/cobertura.ts`: `muestrearLinea(coords: [lng,lat][], pasoM = 50): Coordenada[]`; `IndiceEspacial` (grilla de celdas ~0.001°) con `cercano(p, radioM)`; `calcularCobertura(track: Coordenada[], tramos: { id, km, geometria }[], { radioM: 40, umbral: 0.6 }): { cubiertos: string[]; porTramo: Record<string, number> }`.
- [ ] `lib/juego.ts`: constantes `PUNTOS_KM_NUEVO = 10`, `PUNTOS_KM_REPETIDO = 2`, `PUNTOS_OBSERVACION = 5`; `calcularPuntos({ kmNuevos, kmRepetidos, observacionesConEvidencia })` → lista de `{ motivo, puntos }`; `evaluarInsignias({ esPrimerRecorrido, kmTotalesUsuario, coberturaPorLocalidad: { localidad, tramos, cubiertos }[], coberturaMunicipio, yaObtenidas: string[] })` → códigos nuevos; `ETIQUETA_INSIGNIA`.
- [ ] Tests con fixtures geométricas pequeñas (línea recta de 1 km, track paralelo a 20 m → cubierto; a 100 m → no; track que cubre 50 % → no cubierto). Commit `feat: motor de cobertura, track y reglas de juego`.

### Task 3: Server Actions de recorrido, términos y almacenamiento conmutable

**Files:** `app/terminos/{page.tsx,actions.ts,TerminosForm.tsx}`, `app/dashboard/recorrido/actions.ts` (`finalizarRecorrido`, `prepararSubida`), `lib/almacenamiento/{tipos,supabase,gcs,index}.ts`, `lib/imagenes.ts`, `lib/validaciones.ts` (esquemas `esquemaRecorrido`, `esquemaObservacion`), `proxy.ts`/`app/dashboard/layout.tsx` (redirigir a `/terminos` si falta `acepto_terminos_at`), tests.

- [ ] `aceptarTerminos()`: update propio `acepto_terminos_at = now()`; redirect `/dashboard`.
- [ ] `finalizarRecorrido(payload)`: zod: `{ id: uuid, inicio: iso, fin: iso, puntosGps: number, track: [lat,lng][] (2..20000), observaciones: { id: uuid, tipo_falla, severidad, latitud, longitud, descripcion?, evidencia?: { ruta, tipo: 'imagen'|'video' } }[] }`. Sesión + perfil (municipio). Si `recorridos.id` ya existe y es del usuario → devolver resumen recalculado desde DB (idempotente). Insertar recorrido con cliente usuario. Cargar `tramos` del municipio (admin, cache en módulo por municipio 10 min). `calcularCobertura`. Km nuevos = suma km de tramos cubiertos sin fila previa en `cobertura_tramos` del municipio; repetidos = resto. Insertar cobertura, observaciones (usuario), puntos_eventos y logros (admin, `on conflict do nothing`). Devolver `ResultadoAccion<Resumen>`.
- [ ] `prepararSubida(recorridoId, nombre, contentType)` → URL firmada (proveedor por env). Ruta `{uid}/{recorridoId}/{ts}-{nombre}`. Tipos permitidos: imágenes y `video/mp4`, `video/quicktime`, `video/webm`.
- [ ] Almacenamiento y compresión como en el plan Maipú Task C (Supabase `createSignedUploadUrl` / GCS V4 signed URL; `ALMACENAMIENTO`, `GCS_BUCKET`, `GCS_SERVICE_ACCOUNT_KEY`; `comprimirImagen` con deps inyectables).
- [ ] Tests: actions con mocks de ambos clientes (incluye idempotencia y que `crearClienteAdmin` no escribe si la validación falla), proveedores, compresión. Commit `feat: términos, finalización de recorrido con cobertura y puntos, almacenamiento conmutable`.

### Task 4: Cliente de recorrido (PWA)

**Files:** `lib/local/db.ts` (idb: stores `recorridos`, `puntos`, `observaciones`, `cola`), `lib/local/grabador.ts` (lógica pura del grabador: estado, filtro, acumulación), `lib/local/sincronizacion.ts` (cola: subir evidencias → finalizarRecorrido; backoff 5 s, 30 s, 2 min; máx 20 intentos), `hooks/useGrabadorGps.ts` (watchPosition + wake lock + persistencia), `hooks/useEnLinea.ts`, `app/dashboard/page.tsx` → pantalla Recorrido (`RecorridoView.tsx` client), `components/MapaRecorrido.tsx` (IGN + capas + polilínea viva + posición), `components/ObservacionForm.tsx` (tipo, severidad, evidencia `<input accept="image/*,video/*" capture="environment">`, validación 15 s/50 MB leyendo `duration` con `<video>` metadata), `components/ResumenRecorrido.tsx`, `public/manifest.json`, `public/sw.js`, `public/icons/*` (generar con `scripts/generar-iconos.mjs` + sharp desde un SVG simple verde con "V"), `app/layout.tsx` (manifest, theme-color, registro del SW en un client component), `lib/subida.ts` (reescrito: sube un archivo a `DestinoSubida`).
- [ ] Reapertura: si hay recorrido `en_curso` en IndexedDB, ofrecer "Continuar" o "Finalizar".
- [ ] Tests: `grabador.ts` (filtro, km, estado), `sincronizacion.ts` (orden, reintentos con fetcher/acciones inyectadas, éxito borra de la cola), `ObservacionForm` (validación de video por duración mockeada), `RecorridoView` (render inicial, iniciar → muestra km/tiempo con `geolocation` mockeado, observación guardada localmente, finalizar encola).
- [ ] Commit `feat: recorrido GPS en vivo con observaciones, guardado local, sincronización y PWA`.

### Task 5: Dashboard de cobertura, ranking e insignias

**Files:** `app/dashboard/inicio/` → mover KPIs a `app/dashboard/page.tsx` sección superior de RecorridoView? No: Home = Recorrido con tarjeta de cobertura arriba; `app/dashboard/mapa/page.tsx` (tramos cubiertos/pendientes desde `tramos` + `cobertura_tramos`, observaciones), `components/MapaRelevamiento.tsx` (capa de tramos por estado), `app/dashboard/ranking/page.tsx` (ranking + mis insignias + progreso por localidad), `lib/cobertura-consultas.ts` (server: llama `cobertura_municipio`, `ranking_municipio`, logros propios), `components/BarraCobertura.tsx`, `components/Insignia.tsx`, tests.
- [ ] Mapa: tramos verde `#16a34a` cubiertos, gris `#9ca3af` pendientes, tooltip con código y veces cubierto; observaciones como hoy (con `url_evidencia_video` → link "Ver video").
- [ ] Commit `feat: dashboard de cobertura, mapa de tramos, ranking e insignias`.

### Task 6: Cierre

- [ ] README y `docs/step-by-step-guide.md` (fases 7-9: recorridos, juego, dashboard), `docs/fuentes-datos.md` (IGN red vial provincial, OSM). `scripts/smoke.mjs` actualizado al flujo nuevo (crear usuario, aceptar términos, `finalizarRecorrido` vía SQL/acción no accesible → verificar con inserción directa de recorrido + llamada a `cobertura_municipio`). Lint, coverage, build, revisión final, PR, merge, deploy.

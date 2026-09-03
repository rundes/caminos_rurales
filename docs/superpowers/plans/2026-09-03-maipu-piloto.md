# Piloto Maipú Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capas de Maipú (caminos OSM, localidades, POIs) sobre mapa IGN, caminos reales cargados en la tabla, reporte de falla puntual con GPS, compresión de fotos y almacenamiento conmutable Supabase/GCS.

**Architecture:** Capas como GeoJSON estático servido desde `public/capas/<slug>/` y registradas en `lib/capas.ts`. Mapa react-leaflet con TileLayer IGN y componentes `GeoJSON`. Falla puntual = Server Action que crea relevamiento + falla sin simulador. Subida por URL firmada devuelta por el servidor, proveedor elegido por env.

**Tech Stack:** igual al MVP + `@google-cloud/storage` (solo servidor).

**Spec:** `docs/superpowers/specs/2026-09-03-maipu-piloto-design.md`. Convenciones del MVP aplican (errores genéricos en español con `console.error('[tag]', raw)`, `ResultadoAccion`, tests Vitest, commits con trailers).

**Datos ya presentes (sin commitear):** `public/capas/maipu/caminos.geojson` (207 LineString, props `id,name,ref,highway,surface`) y `public/capas/maipu/localidades.geojson` (10 Polygon con `name` + 55 Point POIs con `name`).

---

### Task A: Capas, registro y mapa IGN

**Files:** `scripts/generar-capas-maipu.mjs`, `lib/capas.ts`, `__tests__/capas.test.ts`, `components/MapaRelevamiento.tsx`, `components/CapasMunicipio.tsx`, `app/dashboard/mapa/page.tsx`, `public/capas/maipu/*.geojson` (commitear los existentes).

- [ ] `scripts/generar-capas-maipu.mjs`: reproduce la descarga. Overpass query (POST a `https://overpass-api.de/api/interpreter`):
  ```
  [out:json][timeout:120];
  area["name"="Partido de Maipú"]["boundary"="administrative"]->.a;
  ( way["highway"~"^(secondary|tertiary|unclassified|track)$"](area.a); );
  out geom;
  ```
  Convierte a FeatureCollection de LineString con props `{ id, name, ref, highway, surface }` (coords a 5 decimales) y escribe `public/capas/maipu/caminos.geojson`. Reintenta 3 veces ante 504 con espera de 20 s. No tocar `localidades.geojson` (viene de severo_data; documentar origen en comentario).
- [ ] `lib/capas.ts`:
  ```ts
  export type CapasMunicipio = { caminos?: string; localidades?: string }
  const CAPAS: Record<string, CapasMunicipio> = {
    maipu: { caminos: '/capas/maipu/caminos.geojson', localidades: '/capas/maipu/localidades.geojson' },
  }
  export function capasDe(municipio: string | null | undefined): CapasMunicipio | null
  export const TESELAS_IGN = { url: 'https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{y}.png', tms: true, maxNativeZoom: 15, maxZoom: 19, attribution: 'Mapa del <a href="https://www.ign.gob.ar">IGN</a> · &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }
  export function colorSuperficie(surface: string | null): string  // unpaved '#8d6e63', paved/asphalt/concrete '#546e7a', null '#a1887f'
  ```
  Tests: `capasDe('maipu')` devuelve rutas; `capasDe('otro')` null; `colorSuperficie` casos.
- [ ] `components/CapasMunicipio.tsx` (client): recibe `capas: CapasMunicipio`, hace `fetch` de cada GeoJSON en `useEffect`, renderiza `<GeoJSON>` de react-leaflet: caminos con `style` por `surface` y `weight` 3, tooltip `name ?? ref ?? 'Camino sin nombre'` + superficie; localidades: polígonos con relleno 0.08 y tooltip `name`; POIs (Point) como `CircleMarker` radio 4 gris con tooltip. Estados: cargando (nada), error (`console.error('[capas]', ...)`, no rompe el mapa). Claves estables para forzar rerender al cambiar `capas`.
- [ ] `components/MapaRelevamiento.tsx`: prop nueva `capas?: CapasMunicipio | null`. Usar `TESELAS_IGN` como TileLayer siempre (es nacional). Renderizar `<CapasMunicipio>` si `capas`. Marcadores de fallas encima (orden de render).
- [ ] `app/dashboard/mapa/page.tsx`: obtener municipio del perfil (`municipio_actual` = `perfiles.municipio_id` del usuario) y pasar `capasDe(municipio)`. Centro por defecto: si hay capas, usar centroide del partido (`buscarPartido`).
- [ ] Verificar `npm test`, `tsc`, `lint`, `build`. Commit: `feat: capas de Maipú (caminos OSM, localidades, POIs) sobre mapa IGN`.

### Task B: Seed de caminos de Maipú

**Files:** `scripts/seed-caminos-maipu.mjs`, `public/capas/maipu/caminos.geojson` (agrega prop `nombre_codigo`), `__tests__/seed-caminos.test.ts`, `lib/geo.ts` (agregar `puntoEnPoligono` y `puntoMedio`).

- [ ] `lib/geo.ts`: `puntoEnPoligono(p: Coordenada, anillo: [number, number][] /* [lng,lat] */): boolean` (ray casting) y `puntoMedio(linea: [number, number][]): Coordenada`. Tests.
- [ ] `scripts/seed-caminos-maipu.mjs` (node, importa la lógica pura desde un módulo `scripts/lib/asignar-caminos.mjs` para testearla):
  - Normaliza nombres: `Camino Secundario 066-0X` y `Camino provincial secundario 066-0X` → `066-0X`; `Camino provincial secundario 039-08` → `039-08`; `Ruta Provincial 62` → `RP 62`.
  - Excluye tramos cuyo punto medio cae dentro de los polígonos urbanos de Maipú ciudad (`Villa Italia, Villa Vanelli, Barrio Belgrano, Barrio Centro, Barrio Alvarado, Barrio Unión`) y también tramos con nombre de calle urbana (highway `tertiary`/`secondary` con `surface` paved y nombre que no empiece con `Camino`/`Ruta`).
  - Tramos sin nombre: asigna `Caminos vecinales - <localidad>` según polígono rural más cercano al punto medio (`Santo Domingo, Segurola, Monsalvo, Las Armas`, o `Maipú` para la cabecera) usando distancia al centroide del polígono.
  - Escribe de vuelta `caminos.geojson` con `nombre_codigo` en cada feature (null para excluidos).
  - Genera SQL idempotente `insert into public.caminos (nombre_codigo, municipio) select ... where not exists (...)` para los códigos únicos y lo aplica con la Management API (reusar lógica de `scripts/aplicar-sql.mjs`; `SUPABASE_ACCESS_TOKEN` en env). Flag `--dry-run` imprime el SQL.
  - Test de `asignar-caminos.mjs`: normalización de nombres, exclusión urbana, agrupación por localidad, códigos únicos esperados (`RP 62, 066-01, 066-02, 066-03, 066-04, 066-05, 039-08, Caminos vecinales - ...`).
- [ ] Ejecutar el seed contra la base (el token lo pasa el controlador). Verificar con SQL `select nombre_codigo from caminos where municipio='maipu' order by 1`.
- [ ] Commit: `feat: caminos de Maipú cargados desde OSM y vinculados a la capa`.

### Task C: Compresión de imágenes y almacenamiento conmutable

**Files:** `lib/imagenes.ts`, `__tests__/imagenes.test.ts`, `lib/almacenamiento/{index.ts,supabase.ts,gcs.ts,tipos.ts}`, `app/dashboard/cargar-viaje/actions.ts` (nueva action `prepararSubida`), `lib/subida.ts`, tests existentes, `.env.example`, `README.md`.

- [ ] `lib/imagenes.ts`: `comprimirImagen(archivo: File, opciones = { maxPx: 1600, calidad: 0.8 }, deps = { crearBitmap: createImageBitmap, crearCanvas })`: si `!archivo.type.startsWith('image/')` devuelve el mismo archivo; si ya es menor a `maxPx` y < 500 KB devuelve el mismo; si falla la decodificación devuelve el original (log). Devuelve `File` JPEG con nombre `.jpg`. Tests con deps inyectadas (jsdom no tiene canvas).
- [ ] `lib/almacenamiento/tipos.ts`: `type DestinoSubida = { urlSubida: string; metodo: 'PUT'; headers: Record<string,string>; urlLectura: string; ruta: string }`; `interface ProveedorAlmacenamiento { prepararSubida(ruta, contentType): Promise<DestinoSubida>; urlLectura(rutaOUrl): Promise<string> }`.
  - `supabase.ts`: `createSignedUploadUrl` del bucket `evidencia-vial` con el cliente de servidor del usuario (respeta RLS de carpeta); `urlLectura` = `createSignedUrl` 1 h.
  - `gcs.ts`: `@google-cloud/storage` con credenciales de `GCS_SERVICE_ACCOUNT_KEY` (JSON en env), bucket `GCS_BUCKET`; `getSignedUrl({ version: 'v4', action: 'write', expires: +15 min, contentType })`; `urlLectura` = `https://storage.googleapis.com/${bucket}/${ruta}` (bucket público). `server-only`.
  - `index.ts`: `obtenerProveedor()` según `process.env.ALMACENAMIENTO` (`'gcs'` → gcs, otro → supabase). Lanza error claro si gcs sin credenciales.
- [ ] Server Action `prepararSubida(relevamientoId, nombreArchivo, contentType)` en `cargar-viaje/actions.ts`: valida sesión, uuid, tipo permitido; ruta = `rutaEvidencia(uid, relevamientoId, nombre)`; devuelve `DestinoSubida`.
- [ ] `lib/subida.ts`: `subirPendientes` ahora recibe `prepararSubida` y hace `fetch(urlSubida, { method: 'PUT', headers, body: archivo })` (sin cliente de Supabase en el navegador). Aplica `comprimirImagen` antes. Guarda en `rutas` el valor `ruta` (Supabase) o `urlLectura` (GCS): regla: guardar `urlLectura` si empieza con `https://`, si no `ruta`.
- [ ] `mapa/page.tsx` y cualquier lector: si `url_evidencia_imagen` empieza con `https://` usarla directa; si no, firmar con Supabase (como hoy).
- [ ] `.env.example`: `ALMACENAMIENTO=supabase`, `GCS_BUCKET=maipu-pba`, `GCS_SERVICE_ACCOUNT_KEY=` (JSON en una línea). README: sección de almacenamiento.
- [ ] Tests: proveedor supabase y gcs con mocks (gcs: mockear `@google-cloud/storage`), `obtenerProveedor`, `subirPendientes` con fetcher inyectado, `prepararSubida` action.
- [ ] Commit: `feat: compresión de fotos y almacenamiento conmutable Supabase/GCS por URL firmada`.

### Task D: Reportar falla puntual con GPS

**Files:** `components/SelectorUbicacion.tsx`, `components/SelectorUbicacionCliente.tsx`, `app/dashboard/reportar-falla/{page.tsx,actions.ts,ReportarFallaForm.tsx}`, `lib/geo.ts` (`tramoMasCercano`), `app/dashboard/layout.tsx` (nav: 5 ítems, reemplazar grid-cols-4 por 5), tests.

- [ ] `lib/geo.ts`: `distanciaASegmentoKm(p, a, b)` y `tramoMasCercano(p, features: { nombre_codigo: string|null; coords: [number,number][] }[]): { nombre_codigo: string; distanciaKm: number } | null` (ignora features sin `nombre_codigo`). Tests.
- [ ] `components/SelectorUbicacion.tsx` (client, leaflet): props `inicial: Coordenada`, `onCambio(c: Coordenada)`, `capas?: CapasMunicipio | null`. Mapa IGN zoom 15, marcador arrastrable, click mueve el pin, botón "Usar mi ubicación" (`navigator.geolocation.getCurrentPosition` high accuracy, timeout 12 s, errores en español: permiso denegado / no disponible / tiempo agotado). Muestra coordenadas y precisión. `SelectorUbicacionCliente.tsx` = wrapper `next/dynamic` `ssr:false`.
- [ ] `app/dashboard/reportar-falla/actions.ts`: `crearFallaPuntual(datos: { camino_id, tipo_falla, severidad, latitud, longitud, archivos: string[] })` con esquema zod (`esquemaFallaPuntual` en `lib/validaciones.ts`: lat -90..90, lng -180..180, enums). Inserta relevamiento (`origen_datos: 'formulario'`, `procesado_ia: true`, `metadata: { km: 0, archivos, puntual: true }`) y la falla con el cliente del usuario; actualiza `caminos.estado_general`/`ultima_actualizacion` con cliente admin usando `estadoDesdeSeveridades([severidad])` solo si empeora (orden bueno<regular<malo<intransitable). `revalidatePath('/dashboard')` y `/dashboard/mapa`. Errores genéricos.
- [ ] `ReportarFallaForm.tsx`: pasos en una pantalla: ubicación (selector), camino (select, preselecciona `tramoMasCercano` si hay capa; muestra distancia), tipo, severidad (3 botones grandes), foto opcional (input capture="environment", comprimida y subida vía `prepararSubida` reutilizando `lib/subida.ts` con un solo archivo). Estados cargando/error/éxito con `role`. Al éxito: botón "Ver en el mapa" y "Reportar otra".
- [ ] `page.tsx`: carga caminos del municipio, capas, centro (partido del perfil). Nav del layout con el ítem "Reportar".
- [ ] Tests: validaciones, geo, action (mocks), formulario (render, preselección de camino por cercanía con capa mockeada, envío exitoso, error).
- [ ] Commit: `feat: reporte de falla puntual con GPS y pin`.

### Task E: Cierre

- [ ] Actualizar `docs/step-by-step-guide.md` (fase 6 parcial: capas Maipú listas; shapefiles UBA pendientes) y README (capas, seed, reportar falla, almacenamiento).
- [ ] `npm run lint && npm run test:coverage && npm run build`; smoke `scripts/smoke.mjs` sigue en verde (ajustarlo si `prepararSubida` cambió el flujo: el smoke sube con el cliente directo, sigue válido para RLS).
- [ ] Commit `docs: piloto Maipú`.

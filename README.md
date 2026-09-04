# Visiovial Rural

Plataforma de relevamiento del estado de caminos rurales de la Provincia de Buenos Aires. Los vecinos y agentes municipales graban su recorrido en GPS con la app abierta, registran observaciones (baches, cárcavas, alcantarillas rotas, etc.) con foto o video, y el servidor calcula qué tramos quedaron cubiertos, otorga puntos e insignias y actualiza la cobertura del municipio. Piloto en el partido de Maipú.

## Documentación

- `docs/superpowers/specs/2026-09-02-visiovial-rural-design.md`: diseño del MVP (superseded parcialmente, ver nota al inicio del archivo).
- `docs/superpowers/specs/2026-09-03-recorridos-cobertura-design.md`: diseño v2 (recorridos, cobertura, juego).
- `docs/superpowers/specs/2026-09-03-maipu-piloto-design.md`: addendum del piloto Maipú (capas base, almacenamiento).
- `docs/system-prompt.md`: reglas de desarrollo.
- `docs/database-schema.sql`: esquema Supabase final (RLS, funciones, trigger y storage).
- `docs/step-by-step-guide.md`: fases de implementación.
- `docs/fuentes-datos.md`: fuentes de datos de referencia (IGN, OSM, UBA, SENASA, MapBiomas, GSW, severo_data).

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Supabase (Auth, Postgres, Storage), react-leaflet, PWA (service worker manual, `idb`).

## Funcionalidad

- **Recorrido GPS en vivo**: el usuario toca "Iniciar recorrido" y la app graba su trayecto con `watchPosition` de alta precisión mientras la pantalla permanece encendida (wake lock). El track se guarda en IndexedDB durante el recorrido.
- **Observaciones**: en ruta se puede pausar y registrar una observación (tipo, severidad, foto o video corto, nota) con la posición actual.
- **Cobertura por tramo**: al finalizar, el servidor compara el track contra la geometría de los tramos del municipio (`tramos`) y marca como cubiertos los que tienen suficiente proximidad de puntos del track.
- **Puntos, insignias y ranking**: kilómetros nuevos y repetidos y observaciones con evidencia otorgan puntos (`puntos_eventos`); ciertos hitos otorgan insignias (`logros`); el ranking agrega puntos por municipio.
- **Dashboard**: cobertura % del municipio y por localidad, mapa de tramos cubiertos/pendientes, ranking, insignias propias, últimas observaciones.
- **PWA instalable**: manifest, service worker con precache del shell y cache-first para capas/teselas/íconos, iconos generados desde un SVG.

### Límites conocidos

- La grabación **solo funciona con la app abierta en primer plano**; no hay grabación en segundo plano (requeriría una app nativa). Está documentado en la pantalla de términos.
- Sin señal, el track y las observaciones quedan en IndexedDB y se suben cuando vuelve la conexión (reintentos con backoff).
- El primer ingreso exige aceptar los términos (`perfiles.acepto_terminos_at`); sin aceptarlos no se accede al resto de la app.

## Sensores del celular

Durante el recorrido, además del GPS, la app usa el acelerómetro y giroscopio del celular (`DeviceMotionEvent`) para estimar el estado del camino:

- **Qué se captura**: aceleración vertical (relativa al vehículo, independiente de cómo esté montado el celular gracias a la estimación del vector gravedad), velocidad, rumbo y altitud. Se agrega en segmentos de 5 s o 100 m (lo que ocurra primero), no se guardan datos crudos. Los impactos (picos de aceleración vertical) se registran como observaciones automáticas `tipo_falla = 'bache'`, `origen = 'sensor'`.
- **Umbrales actuales** (calibrables en `lib/sensores/umbrales.ts`):
  - Calidad del segmento por `rms_vertical` (a ≥ 15 km/h): `bueno` < 1.0 m/s², `regular` < 2.0 m/s², `malo` < 3.5 m/s², `intransitable` ≥ 3.5 m/s².
  - Impacto: pico de `|az|` > 6 m/s² con debounce de 1.5 s; severidad baja < 9, media < 13, alta ≥ 13 m/s².
  - Frenada brusca: aceleración longitudinal < -3 m/s². Maniobra lateral: > 3 m/s² en valor absoluto (por ahora estos dos no se agregan en el resumen ni en el mapa; quedan en 0 hasta que se sumen a la UI).
- **Permiso iOS**: `DeviceMotionEvent.requestPermission()` se pide en el mismo toque de "Iniciar recorrido" (iOS 13+ lo exige). Sin permiso, sin sensor compatible o en escritorio, el recorrido sigue grabando GPS normalmente, sin muestras de sensor.
- **Indicador en pantalla**: durante la grabación se muestra "Sensores activos" (verde) o "Sin sensores" (gris, con el motivo) según haya o no datos de movimiento llegando.
- **Mapa "Estado estimado"**: toggle en `/dashboard/mapa` que colorea los tramos por calidad predominante (verde bueno, amarillo regular, naranja malo, rojo intransitable, gris sin datos), con tooltip de rugosidad media, velocidad media, impactos y segmentos. Las observaciones de origen sensor tienen un marcador con contorno punteado para distinguirlas de las manuales.
- **Límites**:
  - La estimación es **relativa al vehículo y al montaje** del celular, no un valor absoluto de rugosidad.
  - Frenadas y maniobras laterales se calculan pero todavía no se muestran (quedan en 0 en el resumen y el mapa).
  - Por debajo de 15 km/h el segmento se marca `sin_dato`: la vibración a esa velocidad no dice nada del estado del camino.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con las claves del proyecto Supabase
npm run dev
```

Variables de entorno relevantes (además de las de Supabase):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`: proyecto Supabase.
- `ALMACENAMIENTO`: proveedor de subida de evidencia, `supabase` (por defecto) o `gcs`. Ver [Almacenamiento de evidencia](#almacenamiento-de-evidencia).
- `GCS_BUCKET`, `GCS_SERVICE_ACCOUNT_KEY`: requeridas solo si `ALMACENAMIENTO=gcs`.

## Scripts

- `npm test` / `npm run test:coverage`: tests unitarios (Vitest) y cobertura.
- `npm run lint`: ESLint.
- `npm run tipos` (`node scripts/generar-tipos.mjs`): regenera `lib/supabase/database.types.ts` ejecutando `npx --yes supabase gen types` (requiere `SUPABASE_ACCESS_TOKEN`).
- `node scripts/aplicar-sql.mjs <archivo.sql>`: aplica un archivo SQL al proyecto vía Management API (requiere `SUPABASE_ACCESS_TOKEN`).
- `node scripts/generar-partidos.mjs`: regenera `lib/partidos.ts` desde la API georef de los partidos de la Provincia de Buenos Aires.
- `node scripts/generar-capas-municipio.mjs <slug> [--osm]`: genera las capas GeoJSON de un municipio (límite administrativo vía Overpass, recorte de la red vial provincial IGN/DVP); con `--osm` además descarga los caminos rurales de OSM. `scripts/generar-capas-maipu.mjs` es un wrapper de compatibilidad que fija el slug `maipu`.
- `node scripts/seed-caminos-maipu.mjs [--dry-run]`: asigna `nombre_codigo` a los tramos de `public/capas/maipu/caminos.geojson` y siembra `public.caminos` (un código por camino) vía Management API.
- `node scripts/seed-tramos.mjs [--dry-run]`: siembra `public.tramos` (denominador de cobertura) desde el mismo GeoJSON, con geometría, km y localidad por tramo.
- `node scripts/generar-iconos.mjs`: genera los íconos PWA (`public/icons/`) desde un SVG inline con `sharp`.
- `node scripts/smoke.mjs`: smoke test de integración contra el proyecto Supabase real. Ver [Smoke test](#smoke-test-de-integración).

## Migraciones

Las migraciones en `supabase/migrations/` se aplican en orden con `scripts/aplicar-sql.mjs`. `docs/database-schema.sql` refleja el estado final (equivalente a aplicar todas en orden) y una instalación nueva puede correr solo ese archivo.

1. `0001_schema.sql`: esquema inicial del MVP (perfiles, caminos, relevamientos, fallas_deteccion, storage).
2. `0002_storage_por_municipio.sql`: restringe la lectura de evidencia a usuarios del mismo municipio de quien la subió.
3. `0003a_tipos_falla.sql`: agrega valores al enum `tipo_falla` (`alcantarilla_rota`, `senalizacion`, `otro`). Debe aplicarse **antes** que `0003_recorridos.sql`, de la que depende (Postgres no permite usar un valor de enum agregado en la misma transacción que lo crea).
4. `0003_recorridos.sql`: reemplaza el flujo de carga de viaje por recorridos GPS: crea `tramos`, `recorridos`, `cobertura_tramos`, `puntos_eventos`, `logros`; agrega `acepto_terminos_at` a `perfiles`; reapunta `fallas_deteccion` a `recorrido_id`; elimina `relevamientos`; agrega las funciones `cobertura_municipio` y `ranking_municipio`.
5. `0004_recorridos_procesado.sql`: agrega `recorridos.procesado_at`, el sello que hace idempotente el post-procesado de un recorrido (cobertura, puntos, observaciones, logros).
6. `0005_fallas_update.sql`: agrega la política de update propio sobre `fallas_deteccion` (corregir una observación después de creada).
7. `0006a_enums_sensor.sql`: crea los enums `calidad_segmento` y `origen_observacion`. Debe aplicarse **antes** que `0006_muestras_sensor.sql`, de la que depende (mismo motivo que `0003a`: un `create type` y su primer uso no pueden ir en la misma transacción).
8. `0006_muestras_sensor.sql`: crea `muestras_sensor` (segmentos agregados de sensores por recorrido); agrega `origen`, `magnitud` y `tramo_id` a `fallas_deteccion`; agrega la función `rugosidad_tramos`.

## Capas

Archivos estáticos en `public/capas/<slug-de-municipio>/`, registrados por slug en `lib/capas.ts`:

- `caminos.geojson`: red vial rural, origen OSM (Overpass) con nomenclatura de Vialidad BA para Maipú (partido 066); cada feature lleva `nombre_codigo` para vincular tramo ↔ camino.
- `limite.geojson`: límite administrativo del partido, origen Overpass.
- `red-provincial.geojson`: recorte de la red vial provincial IGN/DVP (ver `docs/fuentes-datos.md`).
- `localidades.geojson`: polígonos de localidades y puntos de interés; para Maipú viene de `severo_data` (proyecto previo del mismo autor), copiado tal cual, no se genera con script.

## Almacenamiento de evidencia

Las fotos y videos de las observaciones se suben desde el navegador con un `PUT`
a una URL firmada que devuelve la Server Action `prepararSubida`. El proveedor se
elige con la variable `ALMACENAMIENTO`:

- **Supabase Storage** (por defecto, `ALMACENAMIENTO=supabase` o sin definir):
  usa `createSignedUploadUrl` sobre el bucket `evidencia-vial`. En la base se
  guarda la **ruta** dentro del bucket y se firma una URL de lectura de 1 h cada
  vez que hay que mostrarla.
- **Google Cloud Storage** (`ALMACENAMIENTO=gcs`): usa una URL firmada V4 de
  escritura válida 15 minutos. Requiere `GCS_BUCKET` (por ejemplo `maipu-pba`) y
  `GCS_SERVICE_ACCOUNT_KEY` con el JSON de la cuenta de servicio **en una sola
  línea**. En la base se guarda la URL pública
  `https://storage.googleapis.com/<bucket>/<ruta>`.

Para GCS el bucket debe ser de **lectura pública** (`allUsers` con rol
`Storage Object Viewer`) y tener CORS que habilite `PUT` desde el dominio de la
app:

```json
[{ "origin": ["https://tu-dominio"], "method": ["PUT", "GET"], "responseHeader": ["Content-Type"], "maxAgeSeconds": 3600 }]
```

Las fotos se comprimen en el teléfono antes de subirlas (`lib/imagenes.ts`:
1600 px de lado mayor, JPEG calidad 0.8); los videos se suben sin transcodificar
(hasta 15 s y 50 MB, validado en el cliente).

## Roles

Los usuarios nuevos tienen rol `productor`. Para crear caminos hace falta `municipio` o `auditor`; se cambia desde Supabase:

```sql
update public.perfiles set rol = 'municipio' where id = '<uuid>';
```

## Verificación manual

Checklist para validar el flujo v2 completo en el proyecto Supabase real:

- [ ] Registrar un usuario con partido (Maipú) → aparece en `perfiles` con `acepto_terminos_at` null.
- [ ] Login redirige a `/terminos`; aceptar términos habilita el resto de la app.
- [ ] Se pide permiso de ubicación al iniciar el primer recorrido.
- [ ] "Iniciar recorrido" graba el track en vivo (mapa, km, tiempo).
- [ ] Montar el celular en el vehículo → al iniciar el recorrido se pide permiso de movimiento (iOS) y aparece "Sensores activos".
- [ ] Registrar una observación con foto en ruta.
- [ ] Pasar por un bache → se ve el impacto en el mapa (marcador con contorno punteado) y luego en el resumen del recorrido.
- [ ] "Finalizar" muestra un resumen con puntos e insignias obtenidas, y los km por calidad estimada.
- [ ] El dashboard muestra el mapa con tramos cubiertos en verde y pendientes en gris.
- [ ] Activar el toggle "Estado estimado" en `/dashboard/mapa` → tramos coloreados por calidad de rugosidad.
- [ ] El ranking del municipio muestra al usuario con sus puntos.
- [ ] **Probar sin señal**: activar modo avión durante un recorrido, verificar que la grabación local sigue funcionando, volver a conectar y ver el estado "Subiendo…" hasta que se sincroniza.

## Smoke test de integración

Con `npm run dev` corriendo y `SUPABASE_ACCESS_TOKEN` en el entorno:

```bash
node scripts/smoke.mjs
```

Verifica contra el proyecto Supabase real: trigger de perfil, gate de términos (`/terminos`, `/dashboard`), RLS de `tramos`/`recorridos`/`cobertura_tramos`/`puntos_eventos`/`fallas_deteccion` por municipio y por propietario, las funciones `cobertura_municipio` y `ranking_municipio`, políticas de storage por municipio, y las rutas públicas de la PWA (`/manifest.json`, `/sw.js`, `/offline`). Crea y borra sus propios datos de prueba (usuarios, recorridos, cobertura, puntos, observaciones, archivo de storage).

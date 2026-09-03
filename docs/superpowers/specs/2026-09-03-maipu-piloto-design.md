# Piloto Maipú - Diseño (addendum al MVP)

Fecha: 2026-09-03
Estado: aprobado por el usuario en conversación.

## 1. Contexto

El piloto se hace con el municipio de Maipú (Provincia de Buenos Aires). Existen dos proyectos previos del mismo autor sobre Maipú: `rundes/severo_esfimero` (PWA de relevamiento territorial) y `rundes/severo_data` (tablero). De ahí se reutilizan: polígonos de localidades y puntos de interés de Maipú, teselas del IGN como mapa base, patrón de captura GPS con pin arrastrable, compresión de fotos en el cliente y el bucket GCS `maipu-pba`.

OpenStreetMap tiene la red vial rural del partido con nomenclatura de Vialidad BA (partido 066): RP 62, caminos secundarios 066-01 a 066-05, 039-08, más 112 tramos sin nombre. Total 632 km en 207 tramos.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Capas base | Archivos estáticos en `public/capas/<municipio>/`: `caminos.geojson` (OSM), `localidades.geojson` (polígonos + POIs de severo_data). Registro en `lib/capas.ts` por slug de municipio. Sin PostGIS todavía. |
| Mapa base | Teselas IGN argenmap (TMS) con atribución IGN + OSM. Fallback OSM si el municipio no tiene capas. |
| Caminos en tabla | Seed de `caminos` para `maipu` desde el GeoJSON: un camino por nombre oficial; tramos sin nombre agrupados por localidad rural más cercana (`Caminos vecinales - Santo Domingo`, etc.). El GeoJSON lleva `nombre_codigo` en cada feature para vincular tramo ↔ camino. |
| Falla puntual | Nueva pantalla `/dashboard/reportar-falla`: GPS del celular, pin arrastrable sobre mapa IGN, camino (preseleccionado por cercanía al tramo más próximo), tipo, severidad, foto opcional. Crea relevamiento `origen_datos = formulario`, `procesado_ia = true`, `metadata = { km: 0, archivos, puntual: true }` e inserta la falla. Actualiza estado del camino con cliente admin (misma regla que el simulador). |
| Fotos | Compresión en cliente antes de subir: imágenes a máx. 1600 px, JPEG calidad 0.8. Videos sin tocar. |
| Almacenamiento | Abstracción `lib/almacenamiento/`: el servidor devuelve una URL firmada de subida y la URL de lectura. Proveedor `supabase` (actual) y proveedor `gcs` (bucket `maipu-pba`, V4 signed URL con service account). Selección por env `ALMACENAMIENTO=gcs|supabase`; GCS requiere `GCS_SERVICE_ACCOUNT_KEY` (JSON) y `GCS_BUCKET`. Con GCS las URLs de lectura son públicas (bucket con `allUsers` lector). |

## 3. Esquema

Sin cambios de tablas ni columnas. `url_evidencia_imagen` guarda ruta (Supabase) o URL pública (GCS); el mapa distingue por prefijo `https://`.

## 4. Fuera de alcance

Offline, edición de geometrías, importación de shapefiles UBA, PostGIS.

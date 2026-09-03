# Recorridos, cobertura y gamificación - Diseño v2

Fecha: 2026-09-03
Estado: aprobado por el usuario en conversación.
Reemplaza el flujo "cargar viaje + simulador IA" del MVP.

## 1. Objetivo

Relevar el 100 % de los caminos rurales del municipio. El relevador abre la app, toca "Iniciar recorrido" y la app graba su trayecto GPS como un navegador. En ruta puede detenerse y registrar una **observación** (tipo, severidad, foto o video corto, nota). Al finalizar, el servidor calcula qué tramos quedaron cubiertos, otorga puntos e insignias y actualiza la cobertura del municipio. Un dashboard muestra cobertura, mapa de tramos cubiertos y pendientes, observaciones y ranking.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Grabación | Web/PWA en primer plano: `watchPosition` alta precisión, wake lock de pantalla. No graba con la app cerrada (documentado en términos). |
| Offline | Track y observaciones se guardan en IndexedDB (`idb`) durante el recorrido. Al finalizar se encolan y se suben cuando hay conexión, con reintentos. |
| Denominador de cobertura | Tabla `tramos`: un registro por tramo OSM con geometría, km, `nombre_codigo` y localidad. Maipú: 165 tramos, 610 km. |
| Regla de cobertura | Un tramo se considera cubierto por un recorrido si al menos el 60 % de sus muestras (cada 50 m a lo largo de la geometría) tienen un punto del track a menos de 40 m. |
| Puntos | 10 por km nuevo (primera cobertura del tramo en el municipio), 2 por km repetido, 5 por observación con evidencia. Registrados en `puntos_eventos`. |
| Insignias | `primer_recorrido`, `explorador_50km`, `cartografo_200km`, `localidad_completa:<localidad>`, `municipio_100`. Registradas en `logros`. |
| Ranking | Suma de puntos por usuario dentro del municipio. Top 10 + posición propia. |
| Observaciones | Reutiliza `fallas_deteccion` con columnas nuevas (`recorrido_id`, `descripcion`, `url_evidencia_video`) y tipos nuevos. En la UI se llaman "observaciones". |
| Evidencia | Foto comprimida en el celular (1600 px, JPEG 0.8) o video de hasta 15 s y 50 MB sin transcodificar. Subida por URL firmada; proveedor Supabase Storage hoy, GCS `maipu-pba` cuando exista la credencial (`ALMACENAMIENTO=gcs`). |
| Términos | Primer ingreso muestra términos (ubicación, cámara, visibilidad de datos dentro del municipio, grabación solo con app abierta). `perfiles.acepto_terminos_at` bloquea el resto de la app hasta aceptar. |
| Eliminaciones | Tabla `relevamientos`, pantallas `cargar-viaje`, endpoint `procesar-ia`, `lib/simulador.ts`, `reportar-falla` (queda absorbido por la observación en ruta). |

## 3. Esquema (migración 0003)

```
perfiles           + acepto_terminos_at timestamptz
tramos             id text pk (osm way id), municipio text, nombre_codigo text, localidad text, km numeric, geometria jsonb (LineString [lng,lat][])
recorridos         id uuid, usuario_id uuid, municipio text, inicio timestamptz, fin timestamptz, km numeric, puntos_gps int, track jsonb (simplificado), estado recorrido_estado ('finalizado','descartado'), created_at
cobertura_tramos   tramo_id text fk, recorrido_id uuid fk, usuario_id uuid, created_at; unique (tramo_id, recorrido_id)
fallas_deteccion   + recorrido_id uuid fk (recorridos, cascade), + descripcion text, + url_evidencia_video text; relevamiento_id eliminado
tipo_falla         + 'alcantarilla_rota', 'senalizacion', 'otro'
puntos_eventos     id uuid, usuario_id, municipio, recorrido_id null, motivo text, puntos int, created_at
logros             id uuid, usuario_id, codigo text, otorgado_at; unique (usuario_id, codigo)
relevamientos      eliminada
```

RLS: lectura por municipio en todas; escritura de `recorridos` y `fallas_deteccion` propia; `cobertura_tramos`, `puntos_eventos`, `logros` solo escribe el servidor (clave secreta). `tramos` solo lectura.

Vistas: `cobertura_municipio(municipio)` y `ranking_municipio(municipio)` como funciones SQL `security definer` para el dashboard.

## 4. Flujos

**Onboarding.** Login → si `acepto_terminos_at` es null → `/terminos` → acepta → `navigator.geolocation` permiso → home.

**Recorrido.** Home muestra cobertura del municipio y botón "Iniciar recorrido". Al iniciar: wake lock, `watchPosition({ enableHighAccuracy: true })`, filtro (precisión ≤ 50 m, distancia ≥ 5 m al último punto), guardado en IndexedDB cada punto, mapa en vivo (IGN + capas + polilínea), km y tiempo. "Observación": pausa, formulario rápido, evidencia capturada con `<input capture>`, se guarda local con la posición actual. "Finalizar": resumen local, se encola la subida. Cola: sube evidencia (URL firmada), luego `finalizarRecorrido` con track simplificado (Douglas-Peucker 10 m) y observaciones; reintenta con backoff; muestra estado.

**Servidor `finalizarRecorrido`.** Valida sesión y datos (zod), inserta recorrido, carga tramos del municipio, calcula cobertura, inserta `cobertura_tramos`, calcula km nuevos/repetidos, inserta `puntos_eventos`, inserta observaciones, evalúa insignias e inserta `logros` nuevos, devuelve resumen `{ km, tramosNuevos, tramosRepetidos, puntos, insignias }`. Idempotente por `recorrido.id` generado en el cliente (uuid): si ya existe, devuelve el resumen guardado.

**Dashboard.** Cobertura % del municipio y por localidad, km relevados totales, mapa (tramos cubiertos verde, pendientes gris, observaciones por severidad, capas base), ranking, mis insignias, últimas observaciones con evidencia.

## 5. Errores y límites

Convenciones del MVP. GPS denegado: mensaje y sin recorrido. Pérdida de señal: no afecta la grabación. Cierre de la app en medio del recorrido: al reabrir se ofrece continuar o finalizar el recorrido guardado. Video > 15 s o > 50 MB: rechazado en el cliente con mensaje.

## 6. Fuera de alcance

Grabación en segundo plano, transcodificación de video, moderación de observaciones, edición de tramos, importación de shapefiles UBA.

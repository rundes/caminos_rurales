# Fase 12: registro de cuadros con la cámara - Diseño

Fecha: 2026-09-04
Estado: aprobado por el usuario en conversación.

## 1. Objetivo

Registrar cuadros georreferenciados de la cámara trasera mientras se graba el recorrido, para tener evidencia visual continua del camino y una base de imágenes para entrenar clasificadores (fase 12b). Sin análisis automático en esta fase.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Captura | `getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } })`. Vista previa visible y chica en el panel de grabación (requisito de iOS para capturar). Cuadro JPEG 1280 px de ancho, calidad 0.7 (~120 KB) vía canvas. |
| Disparo | Cada 100 m recorridos desde el último cuadro, o cada 10 s si la velocidad es ≥ 15 km/h y no se alcanzaron los 100 m. Sin GPS válido: no captura. |
| Estado por defecto | Cámara encendida al iniciar si el permiso fue concedido. Botón "Cámara" en el panel para apagar/prender sin cortar la grabación. Permiso pedido en el gesto de "Iniciar recorrido" (después del de movimiento). Sin permiso: el recorrido sigue, indicador gris. |
| Almacenamiento local | Store `cuadros` en IndexedDB (versión 4): `{ recorridoId, t, lat, lng, rumbo, velocidadKmh, blob, estadoSubida }`. Tope `MAX_CUADROS_RECORRIDO = 2000`. Si `navigator.storage.estimate()` reporta menos de 300 MB libres, aviso persistente y captura pausada. |
| Subida | Cola separada `colaCuadros`, procesada después de que el recorrido fue subido (`estado = 'subido'`). Lotes de 20: `prepararSubida` por cuadro (ruta `{uid}/{recorridoId}/cuadros/{t}.jpg`, `observacionId` = `cuadro-<t>`), PUT, luego Server Action `registrarCuadros(recorridoId, cuadros[])` con posición/rumbo/velocidad/ruta. Reintentos con el mismo backoff que la cola principal. "Subir cuadros solo con WiFi" activado por defecto (`localStorage`); detección con `navigator.connection.type === 'wifi'` cuando existe; si no existe, se considera WiFi (iOS no lo expone) y se muestra el aviso "no pudimos verificar la red". Botón "Subir ahora con datos". |
| Servidor | `registrarCuadros`: valida sesión y payload (zod, ≤ 200 por llamada), verifica que el recorrido es propio, asigna `tramo_id` con el asignador de sensores (40 m), inserta con cliente usuario (`upsert` por `(recorrido_id, t)`). Puntos: +1 por cada 10 cuadros registrados, tope 100 por recorrido, motivo `cuadros`; se otorgan en `registrarCuadros` (admin) recalculando el total del recorrido de forma idempotente (borra y reinserta los eventos `cuadros` del recorrido). **Antitrampa (plausibilidad barata, `guardarCuadros`):** cada `t` debe caer dentro de `[inicio - 60 s, fin + 60 s]` del recorrido (`buscarRecorrido` ahora también devuelve `inicio`/`fin`); espaciado mínimo `ESPACIADO_MINIMO_CUADRO_MS = 5000` ms entre `t` consecutivos, ordenados, del lote combinado con los ya guardados del recorrido (se leen con el cliente del usuario, `select t limit 2000`; duplicados exactos —reintento idempotente— no cuentan como violación); tope de cuadros = `floor(duración_recorrido_ms / 5000) + 1`, contando existentes + lote. Cualquiera de las tres reglas rechaza el lote entero sin escribir nada, con error genérico `'Los cuadros no pudieron validarse.'` y log `[cuadros]` con el motivo técnico. |
| Dashboard | Capa "Cuadros" en el mapa (toggle independiente): puntos con icono de cámara (`CircleMarker` con relleno azul y símbolo en tooltip). Popup: miniatura (URL firmada 1 h), fecha, velocidad, botones anterior/siguiente dentro del mismo tramo ordenados por `t`. Tooltip del tramo agrega "N cuadros". Máximo 3000 cuadros cargados por vista (últimos). |
| Términos | Agregar "cámara del dispositivo para registrar imágenes del camino durante el recorrido". |
| Privacidad | Sin difuminado de caras/patentes en esta fase (documentado). Las imágenes son visibles para usuarios del mismo municipio. |

## 3. Esquema (migración 0007)

```
cuadros   id uuid pk default gen_random_uuid(), recorrido_id uuid fk cascade, usuario_id uuid, tramo_id text fk null, t timestamptz, latitud numeric(10,8), longitud numeric(11,8), rumbo numeric null, velocidad_kmh numeric null, ruta text, created_at; unique (recorrido_id, t)
índices: cuadros(recorrido_id), cuadros(tramo_id)
RLS: select por municipio (vía recorridos) o propio; insert/update propio (recorrido del usuario y usuario_id = auth.uid()); delete propio.
función cuadros_por_tramo(p_municipio) security definer con guard → (tramo_id, cuadros int).
```

## 4. Flujos

**Inicio.** "Iniciar recorrido" → permiso de movimiento → permiso de cámara → stream en `<video>` chico → indicador "Cámara activa".

**Grabación.** Cada punto GPS aceptado evalúa el disparo; captura con canvas; guarda en IndexedDB; contador de cuadros en el panel. Botón "Cámara" apaga el stream (libera la cámara) y lo vuelve a pedir al prender.

**Finalizar.** El resumen muestra cuadros capturados y "pendientes de subir (WiFi)". La cola principal sube el recorrido; la cola de cuadros arranca al quedar `subido` y con red permitida.

**Dashboard.** Toggle "Cuadros" carga los cuadros del municipio (últimos 3000) y los dibuja; popup con imagen firmada.

## 5. Límites

Batería: cámara + GPS + pantalla encendida. iOS pausa el stream con pantalla bloqueada. Sin clasificación automática. Sin difuminado.

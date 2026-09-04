# Sensores del celular durante el recorrido - Diseño

Fecha: 2026-09-03
Estado: aprobado por el usuario en conversación.

## 1. Objetivo

Usar acelerómetro, giroscopio y GPS del celular mientras se graba el recorrido para estimar el estado del camino (rugosidad), detectar impactos (baches, badenes) y registrar el perfil de velocidad. Los impactos se registran automáticamente como observaciones con origen `sensor`.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Fuente | `DeviceMotionEvent` (aceleración con gravedad y `accelerationIncludingGravity`, rotación) a la frecuencia del dispositivo (30-60 Hz). iOS 13+: `DeviceMotionEvent.requestPermission()` invocado desde el toque "Iniciar recorrido". Sin permiso o sin sensor: el recorrido sigue, sin muestras. |
| Orientación | Al iniciar (y cada 60 s con filtro pasa-bajos, α = 0.02) se estima el vector gravedad `g`. Aceleración vertical = proyección de la aceleración lineal sobre `g` normalizado. Independiente de cómo esté montado el celular. |
| Segmento | Agregado cada 5 s o 100 m (lo que ocurra primero) con posición GPS del cierre: `rms_vertical`, `pico_vertical`, `velocidad_kmh` media, `rumbo`, `altitud`, `frenadas` (aceleración longitudinal < -3 m/s²), `laterales` (> 3 m/s²), `muestras` (n). Sin velocidad GPS válida o < 15 km/h → `calidad = 'sin_dato'`. |
| Calidad por segmento | `rms_vertical` (m/s²) a ≥ 15 km/h: < 1.0 `bueno`, < 2.0 `regular`, < 3.5 `malo`, ≥ 3.5 `intransitable`. Constantes en `lib/sensores/umbrales.ts`, calibrables. El servidor recalcula la calidad desde `rms_vertical` y `velocidad_kmh`; segmentos con menos de 20 eventos de movimiento se guardan como `sin_dato`. |
| Impactos | Pico de `|az|` > 6 m/s² con debounce 1.5 s. Severidad: < 9 baja, < 13 media, ≥ 13 alta. Cada impacto → observación automática `tipo_falla = 'bache'`, `origen = 'sensor'`, `descripcion = 'Impacto detectado: <pico> m/s² a <vel> km/h'`, sin evidencia. El servidor rechaza picos < 6 m/s². |
| Tramo | El servidor asigna cada segmento e impacto al tramo más cercano (< 40 m) reutilizando el índice espacial de cobertura. Sin tramo cercano → `tramo_id` null (se guarda igual). |
| Rugosidad por tramo | Función SQL `rugosidad_tramos(p_municipio)`: por tramo, promedio ponderado por `muestras` de `rms_vertical`, `velocidad_kmh` media, cantidad de impactos, cantidad de segmentos, calidad predominante. Solo segmentos con calidad ≠ `sin_dato`. |
| Puntos | +1 punto por km recorrido con sensores activos (segmentos con datos cubren ≥ 50 % del km del recorrido). Motivo `km_sensor`. |
| Mapa | Toggle "Estado estimado": tramos coloreados por calidad predominante (bueno verde, regular amarillo, malo naranja, intransitable rojo, sin datos gris). Tooltip con rugosidad media, velocidad media, impactos, segmentos. Observaciones origen sensor con marcador distinto (contorno punteado). |
| Resumen | Km por calidad, cantidad de impactos, indicador "sensores activos" durante la grabación (verde) o "sin sensores" (gris) con motivo. |
| Almacenamiento local | Store `muestras` e `impactos` en IndexedDB (versión 3), por recorrido. Se envían agregados en el payload (`muestras` ≤ 5000, `impactos` ≤ 500). Sin datos crudos. |
| Términos | Agregar "sensores de movimiento del dispositivo para estimar el estado del camino". |

## 3. Esquema (migración 0006)

```
muestras_sensor   id uuid, recorrido_id uuid fk cascade, usuario_id uuid, tramo_id text fk null, t timestamptz, latitud numeric(10,8), longitud numeric(11,8), velocidad_kmh numeric, rumbo numeric null, altitud numeric null, rms_vertical numeric, pico_vertical numeric, frenadas int, laterales int, muestras int, calidad calidad_segmento
calidad_segmento  enum ('sin_dato','bueno','regular','malo','intransitable')
fallas_deteccion  + origen origen_observacion default 'manual'  (enum 'manual','sensor'), + magnitud numeric null
índices: muestras_sensor(recorrido_id), (tramo_id)
RLS: select por municipio (vía recorridos), insert propio (recorrido del usuario). 
función rugosidad_tramos(p_municipio) security definer con guard municipio_actual().
```

## 4. Flujos

**Inicio.** Al tocar "Iniciar recorrido": pedir permiso de movimiento (iOS) en el mismo gesto; iniciar listener; calibrar gravedad 3 s; indicador de estado.

**Grabación.** Cada evento de movimiento alimenta el agregador (RMS, pico, impactos). Cada punto GPS aceptado aporta velocidad, rumbo, altitud. Cierre de segmento cada 5 s o 100 m → guardar en IndexedDB. Impacto → guardar en IndexedDB y marcador efímero en el mapa.

**Finalizar.** Payload suma `muestras` e `impactos`. Servidor valida (zod), asigna tramo, inserta `muestras_sensor` con cliente usuario, impactos como `fallas_deteccion` origen sensor, puntos `km_sensor`. Resumen agrega `kmPorCalidad` e `impactos`.

**Dashboard.** Mapa con toggle; ranking sin cambios; tarjeta de cobertura sin cambios.

## 5. Límites

Estimación relativa, depende del vehículo y montaje. Sin sensores en escritorio y en algunos navegadores; la app lo indica. iOS Safari puede pausar `devicemotion` con pantalla bloqueada (misma limitación que el GPS).

# Fase 12b — clasificación automática de imágenes: evaluación honesta

Fecha: 2026-09-08. No es un plan de implementación: es la evaluación pedida al
cerrar `feat/pendientes` de qué haría falta para construir la fase 12b
(`docs/step-by-step-guide.md`, "Fase 12b (futura)": clasificación de
superficie y detección de baches sobre los cuadros de cámara) y por qué no es
accionable todavía. No se va a construir en esta rama.

## Qué existe hoy

- **Recolección, no dataset**: `cuadros` (migración `0007_cuadros.sql`)
  guarda una foto JPEG por captura (cada 100 m o 10 s a ≥ 15 km/h, tope 2000
  por recorrido) con posición, rumbo, velocidad y `tramo_id` (el tramo a
  menos de 40 m, si hay uno). Es exactamente eso: fotos georreferenciadas.
  Ninguna fila tiene una etiqueta de estado del camino ni de nada.
- Las fotos ahora se difuminan en el dispositivo antes de subir (esta misma
  rama, `lib/privacidad/`), lo cual no cambia el punto anterior: siguen sin
  etiqueta, solo con caras/vehículos pixelados.
- Ya existe **otra** señal de "estado del camino" en la app, independiente de
  las imágenes: `lib/sensores/calidad.ts` clasifica cada segmento en
  `CalidadSegmento` (`bueno` / `regular` / `malo` / `intransitable` /
  `sin_dato`) a partir de acelerómetro/giroscopio, y eso ya se muestra en
  `ResumenRecorrido` y en el mapa ("Estado estimado"). Cualquier
  clasificador de imágenes entraría a convivir con esa señal, no a
  reemplazarla.
- Las observaciones (`fallas_deteccion`: `tipo_falla`, `severidad`,
  lat/lng, evidencia opcional) son la única anotación humana que existe hoy
  sobre el estado de un camino, pero no están enlazadas a un `cuadro`
  puntual — comparten `recorrido_id` y una posición, nada más. No hay
  `cuadro_id` en `fallas_deteccion` ni `observacion_id` en `cuadros`.

## Por qué no es accionable hoy

1. **No hay etiquetas, en absoluto.** Un clasificador necesita ejemplos
   etiquetados; hoy no existe ni uno. Recién con esta rama cerrada el
   proyecto tiene un flujo de recolección estable (captura + difuminado)
   sobre el que podría apoyarse un etiquetado futuro.
2. **Volumen insuficiente.** El piloto es Maipú, recién arrancando: pocos
   recorridos, pocos usuarios. Un clasificador de imágenes razonable necesita
   cientos de ejemplos por clase, con variedad de luz, clima, ángulo de
   cámara y tipo de camino. Eso se junta con meses de uso real, no se genera
   de una.
3. **El target ("estado del camino") es ambiguo, y elegirlo es una decisión
   de producto, no una decisión técnica.** "Estado del camino" puede querer
   decir cosas muy distintas para una imagen puntual: ¿pavimentado vs. no
   pavimentado? ¿presencia de un bache visible en el cuadro (que puede estar
   fuera de foco, fuera de encuadre, o directamente no pasar frente a la
   cámara en el momento exacto de la captura)? ¿la misma escala
   bueno/regular/malo/intransitable/sin_dato que ya usan los sensores, pero
   estimada por ojo en vez de por rugosidad? Estas preguntas no tienen una
   respuesta obvia y ninguna se decidió todavía. Sin un target fijo no hay
   con qué etiquetar ni qué optimizar.
4. **No hay herramienta ni flujo de etiquetado.** Aunque se resolviera (3),
   falta la superficie donde alguien (¿municipio? ¿auditor? ¿un contratista
   de etiquetado?) revise cuadros y les asigne una clase.
5. **Restricción de infraestructura ya conocida**: el runtime de TensorFlow.js
   del propio dispositivo ya está ajustado al límite para la fase 12
   (difuminado): BlazeFace pesa ~455 KB y COCO-SSD ~17,7 MB, servidos desde
   `public/modelos/` (no CDN, por la CSP) y cargados con `import()` dinámico
   recién al difuminar. Sumar un tercer modelo en el dispositivo, durante la
   grabación (GPS + cámara + pantalla encendida ya compiten por batería y
   CPU), es cuestionable; correrlo en el servidor sobre las imágenes ya
   subidas (post-difuminado) es la opción más realista, pero es trabajo de
   infraestructura nuevo (cola de inferencia, costo de cómputo) que no existe
   hoy.

## Camino realista, si se retoma más adelante (boceto, no un compromiso)

1. **Elegir el target primero**, como decisión de producto explícita — la
   recomendación es reusar la taxonomía que ya existe
   (`CalidadSegmento`: bueno/regular/malo/intransitable/sin_dato) en vez de
   inventar una escala nueva, para que ambas señales (sensor e imagen) se
   puedan comparar y eventualmente combinar.
2. **Etiquetar un subconjunto** apoyándose en lo que ya hay: unir por
   cercanía espacio-temporal (mismo `recorrido_id`, pocos metros y pocos
   segundos de diferencia) cada `cuadro` con la `observación` más próxima da
   una etiqueta débil y ruidosa (sirve para armar un primer set chico, no
   como ground truth); en paralelo, una pasada de revisión manual por
   municipio/auditor sobre una muestra de cuadros — hoy no hay UI para eso,
   habría que construirla.
3. **Modelo base**: transfer learning sobre un modelo chico ya entrenado
   (p. ej. MobileNetV2) fine-tuneado con ese primer set etiquetado, corriendo
   en el servidor sobre los cuadros ya subidos (no en el dispositivo, ver
   punto 5 arriba). Evaluación mínima: comparar sus predicciones contra la
   calidad estimada por sensores en los mismos tramos, como chequeo de
   cordura antes de mostrarle nada a un usuario.
4. **Integración**, recién si el paso 3 da una señal razonable: mostrarla
   como una estimación más (no autoritativa) junto a la de sensores, nunca
   reemplazándola.

## Conclusión

No es accionable hoy. Falta, en orden: una decisión de producto sobre el
target, volumen real de datos, una herramienta de etiquetado, y evidencia de
que un modelo entrenado sobre esos datos aporta algo por encima de la señal
de sensores que ya existe. Construir el clasificador antes de tener esto
sería trabajo especulativo sobre una base que todavía no está — lo contrario
de lo que pide YAGNI.

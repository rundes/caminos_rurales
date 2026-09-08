# Endurecimiento y alcance — plan post-auditoría

Fuente: auditorías de producto/UX, arquitectura/rendimiento, seguridad y tests/operación (2026-09-04). Dos olas.

## Ola 1: seguridad, integridad, rendimiento, operación (rama `feat/hardening`)

### A. Seguridad de datos (migración 0008 + login)
- `perfiles`: `revoke update` + `grant update (nombre, acepto_terminos_at)` + trigger `perfiles_no_escalar` (rol, municipio_id, id inmutables desde la app).
- `recorridos_insert_propio` exige `municipio = municipio_actual()`; se elimina `recorridos_update_propio` (solo admin escribe).
- `fallas_insert_propio` exige `origen = 'manual'`.
- Funciones `security definer`: `set search_path = public, pg_temp`.
- Códigos de invitación por municipio: tabla `codigos_invitacion (codigo pk, municipio, activo, creado_at)`; `handle_new_user` valida `raw_user_meta_data->>'codigo_invitacion'` contra la tabla; si no coincide, `municipio_id = 'sin-asignar'`. Registro pide código. Perfil `sin-asignar` ve pantalla `/pendiente` ("Tu cuenta espera un código válido"). Código inicial Maipú: `MAIPU-2027`.
- Índices faltantes: `puntos_eventos(recorrido_id)`, `puntos_eventos(usuario_id, created_at desc)`, `cobertura_tramos(usuario_id, created_at desc)`, `cobertura_tramos(recorrido_id)`, `fallas_deteccion(created_at desc)`, `cuadros(t desc)`.

### B. Servidor: validación, cupos, carrera (migración 0009)
- `filaObservacion` valida `evidencia.ruta` con prefijo `{uid}/{recorridoId}/`.
- `esquemaSubida.observacionId` uuid opcional (o `cuadro-<t>` con regex estricta).
- Puntos por cuadros pasan por `limitarPorTopeDiario`.
- Carrera de finalización: reclamar con `update recorridos set procesado_at = now() where id = $1 and procesado_at is null returning id` antes de procesar; si 0 filas → `resumenGuardado`; si el procesamiento falla → `procesado_at = null`.
- Cupos: tabla `uso_diario (usuario_id, dia, subidas, recorridos)` + función `consumir_cupo(p_tipo, p_max)` security definer. `prepararSubida` máx 1500/día; `finalizarRecorrido` máx 30/día.
- `.limit(MAX_FILAS)` en consultas sin límite (`totalesUsuario`).

### C. Cliente: memoria, pérdida de datos, grabación
- IndexedDB v5: store `blobs` separado (clave = id de cuadro), índice compuesto `[recorridoId, estadoSubida]` en `cuadros`; lecturas por cursor acotadas al lote; conteos por índice; puts en una sola transacción.
- Nav inferior bloqueada durante grabación (barra "● Grabando"), confirmación en "Salir" si hay pendientes.
- Recorridos en error visibles en inicio con motivo y "Reintentar".
- Botón Finalizar con `cargando`; guard anti doble tap.
- Douglas-Peucker con pila explícita (sin recursión).

### D. Lectura y mapa
- `mapa/page.tsx`: `Promise.all`; `unstable_cache` con tag `municipio:<slug>` para agregados; `revalidateTag`.
- Cuadros cargados solo al activar el toggle (server action `obtenerCuadrosMunicipio`).
- `preferCanvas`, `useMemo` en proyección de tramos, `React.memo` en capas; `limit` en `cobertura_tramos`.
- Fechas siempre vía `lib/fechas.ts`.
- `next.config.ts`: headers de seguridad (HSTS, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy, CSP sin script-src) y `Cache-Control` inmutable para `/capas/*` y `/icons/*`.
- SW: `_next/*` cache-first; `/capas/*` stale-while-revalidate; recorte de teselas cada 50 puts.

### E. Operación
- `.github/workflows/ci.yml` (lint --max-warnings=0, tsc, test con umbral 80 en lib/, build) y `smoke.yml` manual.
- `vitest.config.mts`: incluir `hooks/**`, umbrales.
- `lib/env.ts` con zod; `engines` + `.nvmrc`.
- `scripts/setup-entorno.mjs` (migraciones en orden documentado + seeds) y `scripts/borrar-usuario.mjs` (storage + auth).
- `CHANGELOG.md`.

## Ola 2: producto (rama `feat/producto`)
- [x] Lista de observaciones con estado (pendiente / en obra / resuelta / descartada), migración 0010.
- [x] Filtros de fecha, severidad y origen en mapa y lista; sin selector de municipio.
- [x] % de cobertura por km (y por tramos rotulado).
- [x] Layout de grabación: sin tarjeta de cobertura, "Observación" flotante, métricas grandes, pausa visible, acuse al guardar.
- [x] "Caminos" → "Tramos": lista con cobertura, estado estimado, última visita. Detalle de tramo. **Sin alta**: quedó fuera de esta ola porque `tramos` no tiene política de insert (ver Pendiente); el alta solo estaba planeada para municipio/auditor.
- [x] Banner de instalación PWA, aviso de batería, modo oscuro corregido (decisión: solo modo claro, ver `app/globals.css`), targets 44 px.
- [x] Recuperar contraseña, reenviar confirmación.
- [x] Export CSV/GeoJSON de observaciones y cobertura.

## Pendiente

Lo que queda abierto después de las olas 1 y 2 y de la rama `feat/pendientes`
(GCS con lectura firmada, difuminado de privacidad, alta/edición de tramos y
mitigación de la interrupción de grabación — ver `CHANGELOG.md` 0.8.0),
confirmado contra el código a 2026-09-08:

- **Clasificación automática de imágenes (fase 12b)**: sin implementar; la
  app hoy solo *recolecta* los cuadros (`cuadros`), sin ninguna etiqueta.
  Evaluación de qué haría falta (datos, camino de etiquetado, ambigüedad del
  target) en `docs/superpowers/specs/2026-09-08-clasificacion-imagenes-evaluacion.md`;
  sigue sin ser accionable hoy.
- **SMTP propio para los correos de auth**: sin configurar; el proyecto usa
  el envío de emails de auth del plan gratuito de Supabase, que rate-limita
  agresivamente por proyecto (ver README, sección Recuperar contraseña).
  Recomendado antes de un volumen real de producción.
- **Moderación de observaciones más allá del estado de gestión**: 0010 da a
  municipio/auditor un circuito de seguimiento (pendiente/en obra/resuelta/
  descartada), pero no una forma de ocultar o borrar una observación falsa o
  duplicada — `fallas_deteccion` sigue sin política de `delete` para
  observaciones de origen manual (sí existe `fallas_delete_sensor_propio`
  para las de origen sensor, 0006). Ver también fase 10 (pendiente) en
  `docs/step-by-step-guide.md`.
- **Grabación en segundo plano — límite de plataforma, no mitigable desde la
  web**: una PWA no puede grabar GPS con la pantalla apagada ni la app en 2°
  plano (iOS suspende la página; no hay geolocalización en 2° plano
  confiable en la web). La rama `feat/pendientes` mitiga la consecuencia
  (una interrupción ya no se dibuja como una recta ni cuenta como cobertura,
  ver `hooks/useGrabadorGps.ts` y CHANGELOG 0.8.0), pero grabar de verdad en
  2° plano seguiría necesitando una app nativa o un wrapper con permiso de
  ubicación en segundo plano (Capacitor/Cordova + plugin nativo, o una app
  Android/iOS aparte). No planificado.

# Cuadros de cámara Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Cuadros georreferenciados de la cámara durante el recorrido, subida diferida (WiFi), registro con tramo y capa en el mapa.

**Spec:** `docs/superpowers/specs/2026-09-04-cuadros-camara-design.md`. Convenciones del proyecto (`docs/system-prompt.md`).

### Task C1: Esquema y servidor
**Files:** `supabase/migrations/0007_cuadros.sql`, `docs/database-schema.sql`, `lib/supabase/database.types.ts` (npm run tipos), `lib/validaciones.ts` (`esquemaCuadro`, `esquemaCuadros` ≤ 200), `lib/juego.ts` (`PUNTOS_POR_CUADROS = 1` cada `CUADROS_POR_PUNTO = 10`, tope `PUNTOS_MAX_CUADROS = 100`, `puntosPorCuadros(total)`), `lib/cuadros-servidor.ts` (asignación de tramo con `crearAsignadorTramos`, filas, puntos idempotentes), `app/dashboard/recorrido/actions.ts` (`registrarCuadros(recorridoId, cuadros)` → `ResultadoAccion<{ registrados: number; puntos: number }>`), tests.
- [ ] Commit `feat: cuadros de cámara (esquema, registro con tramo y puntos)`.

### Task C2: Cliente
**Files:** `lib/local/db.ts` (v4, store `cuadros` + `colaCuadros`), `lib/local/tipos.ts`, `lib/camara/captura.ts` (puro: `debeDisparar(ultimo, actual, umbrales)`, `redimensionar` con deps inyectables), `lib/camara/red.ts` (`redPermitida(preferencia, conexion)`), `lib/camara/umbrales.ts`, `lib/local/cola-cuadros.ts` (procesa recorridos `subido` con cuadros pendientes: lotes de 20, `prepararSubida` + PUT + `registrarCuadros`; backoff; marca `subida`/`error`), `hooks/useCamara.ts` (permiso, stream, `<video>` ref, captura a JPEG 1280/0.7 con canvas, `activa`, `alternar`, `capturar(punto)`, cleanup; aviso de almacenamiento con `navigator.storage.estimate()`), `hooks/useSincronizacionCuadros.ts`, `components/recorrido/VistaCamara.tsx` (video chico + botón Cámara + contador), integración en `PanelGrabacion`/`RecorridoView` (permiso en el gesto tras `solicitarPermiso` de sensores; captura en `onPunto`), `ResumenRecorrido` (cuadros capturados/pendientes + botón "Subir ahora con datos"), ajuste "Solo con WiFi" en la pantalla de inicio, `TerminosForm` texto, tests (captura puro, red, cola con fakes, `useCamara` con `getUserMedia` mockeado, `VistaCamara`).
- [ ] Commit `feat: captura de cuadros de cámara durante el recorrido y subida por WiFi`.

### Task C3: Dashboard
**Files:** `lib/cuadros-consultas.ts` (`obtenerCuadros(supabase, municipio, limite = 3000)`, `obtenerCuadrosPorTramo` vía rpc), `components/CapaCuadros.tsx` (marcadores, popup con imagen firmada, anterior/siguiente por tramo), `components/MapaRelevamiento.tsx` (toggle "Cuadros" independiente del modo), `app/dashboard/mapa/page.tsx` (firma URLs de miniaturas por lote), tooltip del tramo con cuadros, tests.
- [ ] Commit `feat: capa de cuadros en el mapa`.

### Task C4: Cierre
- [ ] README (fase 12, WiFi, batería, privacidad), guía fase 12 ✓ / 12b futura, smoke (insert cuadro propio OK / ajeno RLS; `cuadros_por_tramo`), revisión final, PR, merge, deploy.

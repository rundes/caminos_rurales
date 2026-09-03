# Visiovial Rural - Diseño del MVP

Fecha: 2026-09-02
Repo: `rundes/caminos_rurales`
Estado: implementado en rama feat/mvp; pendiente verificación manual del usuario.

## 1. Objetivo

Plataforma web mobile-first para relevar el estado de caminos rurales de la Provincia de Buenos Aires. Un equipo de campo recorre caminos, captura evidencia (fotos/videos con GPS) y la sube cuando recupera señal. La plataforma registra relevamientos, detecta fallas (simulación IA en el MVP) y las muestra en un mapa con filtros para municipios.

## 2. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Relevador | Equipo de campo con celular | Respuesta del usuario |
| Conectividad | Captura en campo, subida posterior con señal | Sin PWA offline en MVP. Mayor parte del campo sin señal, pero el flujo "grabar y subir después" lo cubre |
| Unidad de relevamiento | Camino (tramo con `estado_general`) + fallas puntuales georreferenciadas | Respuesta "ambos" |
| Capas base | OSM como mapa base. Datos UBA (segmentos, tambos) en fase futura | Datos UBA no descargables desde la app; UBA también usa OSM como red vial |
| Backend | Supabase proyecto `caminos_rurales` (ref `gtuulbdxgtcqybbtocpz`, us-west-2, PG 17) | Proyecto ya creado por el usuario |
| Stack | Next.js 16 App Router, TypeScript estricto, Tailwind 4, `@supabase/ssr`, react-leaflet 5 | PDF pide Next 14+; 16 es la versión estable actual |
| Tests | Vitest + Testing Library | Reglas del usuario: cobertura objetivo 80% |

## 3. Arquitectura

```
app/
  login/            page.tsx, actions.ts        (auth)
  dashboard/        layout.tsx, page.tsx        (KPIs)
    caminos/        page.tsx, actions.ts        (lista, alta)
    cargar-viaje/   page.tsx, actions.ts        (relevamiento + evidencia)
    mapa/           page.tsx                    (mapa + filtros)
  api/procesar-ia/  route.ts                    (simulación IA)
components/         ui/, MapaRelevamiento.tsx, Dropzone.tsx, KpiCard.tsx
lib/
  supabase/         server.ts, client.ts, admin.ts, database.types.ts
  partidos.ts       135 partidos con slug, nombre, centroide lat/lng
  geo.ts            puntoAleatorioEnRadio(), distancias
  validaciones.ts   esquemas zod de formularios
proxy.ts            refresca sesión, protege /dashboard
supabase/migrations/0001_schema.sql
docs/               system-prompt.md, database-schema.sql, step-by-step-guide.md, fuentes-datos.md
```

Server Components leen datos con el cliente de servidor. Mutaciones vía Server Actions. La API de simulación IA usa el cliente admin (clave secreta) porque inserta fallas en nombre del sistema.

## 4. Modelo de datos

Esquema completo en `docs/database-schema.sql`. Tablas del PDF sin cambios de columnas: `perfiles`, `caminos`, `relevamientos`, `fallas_deteccion`. Enums: `rol_usuario`, `estado_camino`, `origen_datos`, `tipo_falla`, `nivel_severidad`.

Agregados que el PDF omite y sin los cuales la app no funciona:

1. **Políticas RLS.** El PDF solo habilita RLS, lo que bloquea todo. Reglas:
   - Usuario autenticado lee `caminos`, `relevamientos` y `fallas_deteccion` de su municipio, más lo propio.
   - Inserta relevamientos y fallas solo propios.
   - Rol `municipio` o `auditor` crea y edita caminos de su municipio.
   - Perfil: lee el propio y los de su municipio, edita solo el propio.
   - Funciones `municipio_actual()` y `rol_actual()` con `security definer` evitan recursión de RLS.
2. **Trigger `handle_new_user`** crea la fila en `perfiles` al registrarse, tomando `nombre` y `municipio_id` del metadata de signup.
3. **Bucket privado `evidencia-vial`** (100 MB por archivo, imágenes y video). Cada usuario sube a `{uid}/{relevamiento_id}/`. Lectura para autenticados.
4. **Índices** en FKs, `caminos.municipio` y `fallas.tipo_falla`.

Convención: `perfiles.municipio_id` y `caminos.municipio` guardan el slug del partido (ej. `carlos-tejedor`) definido en `lib/partidos.ts`.

`relevamientos.metadata` guarda `{ km: number, archivos: string[] }`. Los km relevados del dashboard se suman desde ahí.

## 5. Flujos

**Registro.** Formulario pide email, password, nombre, partido. `signUp` envía nombre y municipio_id en `options.data`. Trigger crea perfil con rol `productor`. Cambio de rol: manual desde Supabase en el MVP.

**Carga de viaje.** Usuario elige camino, origen de datos, km, adjunta archivos. Server Action crea el relevamiento, devuelve id. Cliente sube archivos directo al bucket con el cliente de navegador, mostrando progreso por archivo. Al terminar, el cliente llama a `/api/procesar-ia` con el id.

**Simulación IA.** Endpoint valida sesión, carga relevamiento y perfil, genera entre 2 y 6 fallas con tipo y severidad aleatorios dentro de un radio de 15 km del centroide del partido, inserta con cliente admin, marca `procesado_ia = true`, actualiza `caminos.ultima_actualizacion` y `estado_general` según la peor severidad.

**Mapa.** Carga dinámica de react-leaflet sin SSR. Marcadores circulares: rojo alta, amarillo media, verde baja. Filtros por tipo de falla y municipio en query string. Popup con tipo, severidad, fecha, link a evidencia (URL firmada).

## 6. Manejo de errores

- Server Actions devuelven `{ ok: true, data } | { ok: false, error: string }`. Nunca lanzan al cliente.
- Formularios con `useActionState` muestran estado de carga y mensaje de error en español.
- Subida de archivos: error por archivo, botón reintentar. Relevamiento queda creado aunque falle un archivo.
- Endpoint IA: 401 sin sesión, 404 relevamiento inexistente, 403 relevamiento ajeno, 409 si ya procesado, 500 con log en servidor.
- El flag `procesado_ia` actúa como bloqueo: un segundo POST concurrente recibe 409.
- Validación de entradas con zod en `lib/validaciones.ts`, compartida entre cliente y servidor.

## 7. Testing

- Unitarios: `lib/geo.ts`, `lib/validaciones.ts`, `lib/partidos.ts`, lógica de severidad → estado de camino.
- Componentes: formularios de login y carga (estados loading/error/success), KpiCard, filtros del mapa.
- Server Actions: mocks del cliente Supabase.
- Sin e2e en el MVP. Verificación manual de flujo completo contra el proyecto Supabase real.

## 8. Fuera de alcance

- PWA / offline real.
- Detección IA real (el endpoint es un simulador).
- Capas UBA (segmentos, tambos, inundaciones). Fase 6 cuando lleguen los datos de caminosrurales@agro.uba.ar.
- Gestión de roles desde la UI.
- Ruteo, cálculo de recorridos.

## 9. Seguridad

- `.env.local` ignorado. `.env.example` sin valores.
- Clave secreta solo en `lib/supabase/admin.ts`, importado únicamente desde código de servidor (`server-only`).
- Token de acceso `sbp_` usado para CLI se pegó en el chat: rotarlo al terminar el setup.
- RLS activo en todas las tablas. Storage privado con URLs firmadas.

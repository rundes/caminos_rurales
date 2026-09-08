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
- `docs/superpowers/plans/2026-09-04-endurecimiento-y-alcance.md`: plan de las olas 1 (endurecimiento) y 2 (producto), con la lista de [Pendiente](docs/superpowers/plans/2026-09-04-endurecimiento-y-alcance.md#pendiente) actualizada.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Supabase (Auth, Postgres, Storage), react-leaflet, PWA (service worker manual, `idb`).

## Funcionalidad

- **Recorrido GPS en vivo**: el usuario toca "Iniciar recorrido" y la app graba su trayecto con `watchPosition` de alta precisión mientras la pantalla permanece encendida (wake lock). El track se guarda en IndexedDB durante el recorrido. Mientras se graba, el layout se enfoca: se oculta la tarjeta de cobertura y el resto del cromo del dashboard (`OcultarSiGrabando`), con métricas grandes y de alto contraste, un botón "Observación" flotante alcanzable con el pulgar y "Finalizar" con confirmación en dos pasos.
- **Observaciones**: en ruta se puede pausar y registrar una observación (tipo, severidad, foto o video corto, nota) con la posición actual. Ver [Observaciones y estado de gestión](#observaciones-y-estado-de-gestión).
- **Cobertura por tramo**: al finalizar, el servidor compara el track contra la geometría de los tramos del municipio (`tramos`) y marca como cubiertos los que tienen suficiente proximidad de puntos del track. La cobertura se muestra en kilómetros, no solo en cantidad de tramos: ver [Tramos](#tramos).
- **Puntos, insignias y ranking**: kilómetros nuevos y repetidos y observaciones con evidencia otorgan puntos (`puntos_eventos`); ciertos hitos otorgan insignias (`logros`); el ranking agrega puntos por municipio.
- **Dashboard**: cobertura en km del municipio y por localidad (`/dashboard`), lista de tramos con estado estimado y última visita (`/dashboard/tramos`), mapa con tramos cubiertos/pendientes y observaciones filtrables (`/dashboard/mapa`), lista de observaciones con estado de gestión y exportes (`/dashboard/observaciones`), ranking e insignias propias (`/dashboard/ranking`).
- **PWA instalable**: manifest, service worker con precache del shell y cache-first para capas/teselas/íconos, iconos generados desde un SVG. Banner de instalación y aviso de batería antes de grabar: ver [Instalación como PWA](#instalación-como-pwa) y [Aviso de batería](#aviso-de-batería).

### Límites conocidos

- La grabación **solo funciona con la app abierta en primer plano**; no hay grabación en segundo plano (requeriría una app nativa). Está documentado en la pantalla de términos.
- Sin señal, el track y las observaciones quedan en IndexedDB y se suben cuando vuelve la conexión (reintentos con backoff).
- El primer ingreso exige aceptar los términos (`perfiles.acepto_terminos_at`); sin aceptarlos no se accede al resto de la app.
- La interfaz es **solo modo claro**: ver [Modo claro (sin tema oscuro)](#modo-claro-sin-tema-oscuro).

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

## Fase 12: cuadros de cámara

Durante el recorrido, además del track y los sensores, la app puede capturar cuadros (fotos) de la cámara trasera del celular para tener evidencia visual continua del camino:

- **Qué hace**: con la cámara activa, dispara una captura JPEG de 1280 px de ancho y calidad 0,7 (~120 KB) cada 100 m recorridos desde el último cuadro, o cada 10 s si la velocidad es ≥ 15 km/h y todavía no se llegó a los 100 m. Sin GPS válido no captura. Cada cuadro guarda posición, rumbo y velocidad del instante.
- **Cámara**: encendida por defecto si el permiso fue concedido (se pide en el mismo gesto de "Iniciar recorrido", después del de sensores de movimiento). Botón "Cámara" en el panel de grabación para apagar/prender el stream sin cortar la grabación; sin permiso, el recorrido sigue grabando normalmente con el indicador en gris.
- **Almacenamiento local**: los cuadros se guardan en IndexedDB con tope de 2000 por recorrido; si `navigator.storage.estimate()` reporta menos de 300 MB libres se muestra un aviso persistente y se pausa la captura.
- **Subida**: diferida, por WiFi por defecto ("Subir cuadros solo con WiFi", configurable), después de que el recorrido ya se subió. También hay un botón "Subir ahora con datos" para forzar la subida usando datos móviles.
- **Mapa**: capa "Cuadros" en `/dashboard/mapa` (toggle independiente), con marcadores y popup de miniatura, fecha, velocidad y navegación anterior/siguiente dentro del mismo tramo.
- **Puntos**: +1 punto cada 10 cuadros registrados, con tope de 100 puntos por recorrido.
- **Límites conocidos**: consume batería adicional (cámara + GPS + pantalla encendida); en iOS el stream se pausa con la pantalla bloqueada; sin difuminado de caras ni patentes en esta fase; las imágenes son visibles para los usuarios del mismo municipio.

## Ola 2: producto

### Observaciones y estado de gestión

`/dashboard/observaciones` (`app/dashboard/observaciones/page.tsx`) lista las
observaciones del municipio con los mismos filtros que el mapa (ver
[Filtros](#filtros)), conteos por estado y los exportes CSV/GeoJSON (ver
[Exportes](#exportes-csvgeojson)).

Cada observación tiene un estado de gestión: `pendiente`, `en_obra`,
`resuelta` o `descartada` (enum `estado_observacion`, migración
`supabase/migrations/0010_estado_observaciones.sql`). Solo los roles
`municipio` y `auditor` pueden cambiarlo, y solo sobre observaciones de su
propio municipio; el resto de los usuarios ve un badge de solo lectura
(`EstadoSelect`/`app/dashboard/observaciones/EstadoSelect.tsx`). Igual que
`perfiles` (`0008_seguridad.sql`), la protección tiene **tres capas**, no
una sola:

1. **Grant por columna**: `revoke update on public.fallas_deteccion from authenticated` + `grant update (…, estado, estado_nota, estado_at, estado_por)`. La política de update del dueño (`fallas_update_propio`, 0005) sigue vigente para sus campos propios, pero el grant por sí solo no distingue quién puede tocar qué columna.
2. **Política RLS** (`fallas_update_estado_gestion`): filtra **filas**, no columnas — solo dejaría pasar el update completo si el rol es `municipio`/`auditor` y la observación es de su municipio.
3. **Trigger** (`fallas_estado_protegido`/`fallas_estado_no_escalar`): filtra **columnas** dentro de una fila que la política ya dejó pasar. Sin el trigger, el dueño de una observación podría colarse un cambio de estado usando la política `fallas_update_propio` (que sigue permitiendo su update de campos propios) junto con el grant amplio de columnas. El trigger corta específicamente eso; se salta cuando `auth.uid() is null` para que la clave secreta pueda reprocesar observaciones sin pasar por la restricción.

La Server Action `cambiarEstado` (`app/dashboard/observaciones/actions.ts`)
hace el update con el cliente **de sesión**, no con el admin: el gate real
son las tres capas de arriba, no la función. Si RLS o el trigger rechazan el
cambio, se traduce a un mensaje de permiso en vez de un error genérico.
`EstadoSelect` es optimista: cambia de inmediato y revierte si el servidor
lo rechaza.

### Tramos

"Caminos" (tabla `caminos`, sin relación con la cobertura real) se dio de
baja en esta ola. `/dashboard/tramos` (`app/dashboard/tramos/page.tsx`)
lista los tramos del municipio con km, veces cubierto, estado estimado
(rugosidad), cantidad de cuadros y última visita, con búsqueda por nombre y
orden por km o última visita. `/dashboard/tramos/[id]`
(`app/dashboard/tramos/[id]/page.tsx`) es el detalle de un tramo: mapa
enfocado, y sus observaciones y cuadros de cámara; la política
`tramos_select` (RLS) ya limita la lectura al municipio propio, así que un
tramo de otro municipio (o inexistente) da 404 directamente, sin comparar
`municipio` a mano.

No hay alta de tramos todavía: a diferencia de `caminos` (que tenía
`caminos_insert`), la tabla `tramos` solo tiene la política de lectura
`tramos_select` — la siembra el servidor con la clave secreta
(`scripts/seed-tramos.mjs`). El listado deja un comentario señalando dónde
montar el formulario cuando exista esa migración, gateado a
`perfil.rol === 'municipio' || perfil.rol === 'auditor'`. Ver
[Pendiente](docs/superpowers/plans/2026-09-04-endurecimiento-y-alcance.md#pendiente).

### Exportes CSV/GeoJSON

`lib/exportar.ts` tiene las funciones puras: `aCsv` (RFC 4180, separador
coma, CRLF, BOM UTF-8 para que Excel abra los acentos bien) y `aGeoJson`
(`FeatureCollection` de puntos, `[longitud, latitud]`). Dos route handlers
las usan:

- `GET /dashboard/observaciones/export?formato=csv|geojson`
  (`app/dashboard/observaciones/export/route.ts`): exporta las
  observaciones del municipio (según RLS, con el cliente de sesión).
- `GET /dashboard/cobertura/export?formato=csv|geojson`
  (`app/dashboard/cobertura/export/route.ts`): exporta la cobertura por
  tramo del municipio. El GeoJSON representa cada tramo con el primer punto
  de su geometría (alcanza para ubicarlo en un mapa de puntos, sin exportar
  la polilínea completa).

Los dos exigen sesión (401 sin ella) y responden con
`Content-Disposition: attachment` y `Content-Type: text/csv` o
`application/geo+json`. Ninguno expone más datos personales que los que ya
muestra la app (ni email ni quién reportó cada observación).

### Filtros

`components/FiltrosObservaciones.tsx` es el filtro compartido por el mapa
(`/dashboard/mapa`) y la lista de observaciones (`/dashboard/observaciones`):
tipo, severidad, origen, estado y rango de fechas (`desde`/`hasta`). Sin
selector de municipio: RLS ya limita todo a la del usuario, así que era UI
muerta. Enteramente derivado de la URL (`useSearchParams`), sin estado local
espejo — cada cambio reescribe la query string y el Server Component que lo
envuelve vuelve a renderizar con los `searchParams` nuevos, aplicando los
filtros en la propia consulta (no se trae todo para filtrar en el
navegador).

### Instalación como PWA

`components/BannerInstalar.tsx` (lógica pura en `lib/pwa/instalacion.ts`)
ofrece instalar la app:

- **Chromium** (Android, desktop): escucha `beforeinstallprompt`, previene
  el mini-banner nativo del navegador y muestra un botón "Instalar" que
  dispara el diálogo del sistema.
- **iOS Safari**: Apple nunca implementó `beforeinstallprompt` ni expone una
  forma de feature-detection para "se puede agregar a la pantalla de
  inicio" — la única señal disponible es el user-agent (`esIosSafari`, una
  excepción deliberada y documentada a "nunca hacer UA sniffing"). En vez
  del prompt nativo, se muestran instrucciones manuales: tocar
  **Compartir** y elegir **Agregar a inicio**.

El banner se puede cerrar (queda recordado en `localStorage` de ese
dispositivo, con try/catch por si el modo privado de Safari bloquea el
storage) y nunca se muestra si la app ya corre instalada (`navigator.standalone`
en iOS, `display-mode: standalone` en el resto).

### Aviso de batería

`components/recorrido/AvisoBateria.tsx` (lógica pura en `lib/bateria.ts`) se
muestra antes de arrancar un recorrido: GPS, cámara y pantalla encendida
gastan batería rápido. Usa la Battery Status API (`navigator.getBattery`,
solo Chromium) cuando existe para mostrar el nivel real y ponerse más serio
por debajo del 20% (salvo que esté cargando); en iOS, que no la tiene, se
degrada en silencio a un mensaje genérico. Se cierra con un toque, sin tapar
la pantalla.

### Modo claro (sin tema oscuro)

La interfaz es **solo modo claro**, a propósito: `app/globals.css` fija
`color-scheme: light` y no define ninguna regla `prefers-color-scheme`.
Visiovial se usa afuera, a pleno sol, mientras se maneja — la prioridad es
legibilidad en exteriores, no un tema oscuro a medio hacer. El diseño
(fondos blancos, texto oscuro sólido, acentos en verde/ámbar/rojo saturados)
nunca se probó en oscuro: dejar que `prefers-color-scheme: dark` reinterprete
solo el fondo/texto de base mientras cada componente sigue con sus propios
`bg-white`/`text-gray-700` es la causa típica de texto invisible sobre
fondos del mismo tono. `color-scheme: light` también fija la paleta de los
controles nativos (por ejemplo `<input type=file>`), que no siguen el tema
de Tailwind.

### Accesibilidad táctil

Targets reales de 44 px (`min-h-11`, no solo un `min-height` heredado) en
botones, enlaces de evidencia, controles de filtro/orden y navegación de
cuadros en el popup del mapa; el botón "Observación" flotante durante la
grabación es de 56 px, alcanzable con el pulgar. `:focus-visible` con un
anillo verde visible en toda la app (no se dispara en un tap táctil, así
que no agrega ruido en el uso normal a una mano).

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con las claves del proyecto Supabase
npm run dev
```

Node `>= 20.9` (ver `engines` en `package.json` y `.nvmrc`: `nvm use`). Variables
de entorno: ver [Variables de entorno](#variables-de-entorno-validadas-al-arrancar).
Para dejar un proyecto Supabase nuevo (o uno existente) al día con las
migraciones y los datos base, ver [Configuración inicial](#configuración-inicial-npm-run-setup).

## CI

`.github/workflows/ci.yml` corre en cada pull request y en cada push a `main`:
tipos (`tsc --noEmit`), lint (`eslint --max-warnings=0`), tests con cobertura
(`npm run test:coverage`, ver umbrales en `vitest.config.mts`) y build. El
build solo recibe las variables públicas (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) como secrets del repositorio: no
necesita `SUPABASE_SECRET_KEY` porque `lib/supabase/admin.ts` la lee recién
al llamar a `crearClienteAdmin()`, nunca a nivel de módulo. Cancela
ejecuciones anteriores del mismo branch/PR (`concurrency`).

`.github/workflows/smoke.yml` es manual (`workflow_dispatch`): escribe
`.env.local` desde secrets, levanta `npm run dev`, espera a que responda
`:3000` y corre `node scripts/smoke.mjs` contra el proyecto Supabase real
(necesita `SUPABASE_ACCESS_TOKEN` para limpiar sus propios datos de prueba
vía Management API).

## Configuración inicial (`npm run setup`)

Para un proyecto Supabase nuevo (o para poner uno existente al día):

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run setup              # migraciones + seeds
SUPABASE_ACCESS_TOKEN=sbp_... npm run setup -- --solo-migraciones
npm run setup -- --dry-run                                # solo imprime el plan
```

`scripts/setup-entorno.mjs` aplica las migraciones de `supabase/migrations/`
en el orden documentado en [Migraciones](#migraciones) (vía Management API,
igual que `scripts/aplicar-sql.mjs`) y después corre los seeds del piloto
Maipú (`seed-caminos-maipu.mjs`, `seed-tramos.mjs`). `--solo-migraciones`
aplica las migraciones y omite los seeds; `--dry-run` no necesita
`SUPABASE_ACCESS_TOKEN` y solo imprime qué haría.

## Variables de entorno (validadas al arrancar)

`lib/env.ts` valida el entorno con zod. Dos funciones, según dónde corre el código:

- `envServidor()`: solo para código de servidor. Valida todo el esquema y
  cachea el resultado (una sola vez por proceso); si falta o es inválida
  alguna variable, tira un error en español que las lista todas. La usan
  `lib/supabase/server.ts`, `lib/supabase/admin.ts` (además de su propio
  chequeo de `SUPABASE_SECRET_KEY`) y `lib/almacenamiento/{index,gcs}.ts`.
- `envPublico()`: variables `NEXT_PUBLIC_*`, con acceso literal
  (`process.env.NEXT_PUBLIC_X`) para que el bundler de Next las pueda
  inlinear en el bundle del cliente. La usa `lib/supabase/client.ts`.

Variables:

- `NEXT_PUBLIC_SUPABASE_URL` (URL), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (mínimo 20 caracteres): proyecto Supabase, siempre requeridas.
- `SUPABASE_SECRET_KEY`: opcional a nivel de esquema; la exige puntualmente
  `lib/supabase/admin.ts` al llamar a `crearClienteAdmin()`.
- `ALMACENAMIENTO`: `supabase` (por defecto) o `gcs`. Ver
  [Almacenamiento de evidencia](#almacenamiento-de-evidencia).
- `GCS_BUCKET`, `GCS_SERVICE_ACCOUNT_KEY`: requeridas solo si
  `ALMACENAMIENTO=gcs`. `GCS_SERVICE_ACCOUNT_KEY` además se valida al
  arrancar: tiene que parsear como JSON y traer `client_email`/`private_key`,
  o `envServidor()` tira un error en español que lo dice (sin loguear la
  clave). Ver [Almacenamiento de evidencia](#almacenamiento-de-evidencia).
- `SITE_URL`: opcional, origen público fijo (por ejemplo
  `https://visiovial.example`, sin `/` final) para armar el `redirectTo` del
  email de recuperación de contraseña. Sin definirla, `lib/url-origen.ts` la
  arma con los headers `host` + `x-forwarded-proto` de la propia petición
  (nunca del body/formData que manda el cliente). Recomendado en producción
  para no depender de esos headers si hay un proxy intermedio que no los
  reenvía tal cual.

## Recuperar contraseña

- `/recuperar` pide el email y llama `supabase.auth.resetPasswordForEmail`
  con `redirectTo` armado desde `SITE_URL` (o los headers de la petición, ver
  arriba) apuntando a `/auth/confirm?next=/nueva-clave`. La respuesta es
  siempre la misma **sin importar si el email existe o no** (`app/recuperar/actions.ts`):
  nunca se revela si una cuenta está registrada.
- `@supabase/ssr` usa el flujo **PKCE** por defecto, así que el enlace del
  email llega con un `?code=...` en la query string, no con un token en el
  fragmento (`#`) de la URL — se puede resolver enteramente del lado del
  servidor. `app/auth/confirm/route.ts` (Route Handler) exchangea ese código
  por una sesión con `exchangeCodeForSession`, escribe las cookies `sb-*` en
  la respuesta (algo que un Server Component no puede hacer) y redirige a
  `next` (`/nueva-clave` por defecto; solo se acepta una ruta relativa
  propia, nunca una URL absoluta ajena).
- `/nueva-clave` es un Server Component: al llegar ya tiene la sesión de
  recuperación en las cookies gracias al paso anterior, así que le alcanza
  con `supabase.auth.getUser()` para confirmarlo. Si no hay sesión (enlace
  vencido, ya usado, o se entró directo a la URL) muestra un aviso con un
  enlace de vuelta a `/recuperar` en vez del formulario. El formulario llama
  `supabase.auth.updateUser({ password })`.
- Contraseña mínima de 8 caracteres, validada con el mismo esquema zod
  (`esquemaNuevaClave` en `lib/validaciones.ts`) en el cliente (`minLength`
  + texto de ayuda) y en el servidor, con el mismo mensaje en los dos lados.
- `/recuperar`, `/nueva-clave` y `/auth/confirm` son alcanzables sin sesión a
  propósito: no están en `RUTAS_PROTEGIDAS` de `lib/supabase/proxy.ts` (ver
  el comentario ahí).

**Configuración necesaria en Supabase** (Authentication → URL Configuration):

- Agregar el origen de producción a la lista de **Redirect URLs** permitidas,
  incluyendo `https://tu-dominio/auth/confirm` (y `http://localhost:3000/auth/confirm`
  para desarrollo). Supabase rechaza cualquier `redirectTo` que no esté en
  esa lista, sin importar lo que mande la app.
- Traducir al español la plantilla de email **"Reset Password"** (Authentication
  → Email Templates): el asunto y el cuerpo los define Supabase, la app no
  los controla.
- El plan gratuito de Supabase **rate-limita el envío de emails de auth**
  (recuperación, confirmación de registro) de forma agresiva y por proyecto,
  no por usuario: en pruebas seguidas conviene esperar unos minutos entre
  intentos. Para un volumen real de producción, configurar un proveedor SMTP
  propio (Authentication → SMTP Settings) en vez de depender del límite del
  plan gratuito.

## Reenviar confirmación

Si `signIn` falla porque el email todavía no fue confirmado, `LoginForm`
ofrece "Reenviar correo de confirmación" (`supabase.auth.resend`). El botón
entra en un cooldown de 60 s con cuenta regresiva después de cada click
(`lib/reenvio-cooldown.ts`, función pura) para no poder espamearlo desde la
UI; Supabase también rate-limita el reenvío del lado del servidor.

## Mensajes de error de auth en castellano

Supabase Auth devuelve los mensajes de error en inglés ("Invalid login
credentials", "Email not confirmed", límites de envío, etc.). `lib/auth-mensajes.ts`
centraliza la traducción al español para las cuatro Server Actions de auth
(login, registro, recuperar contraseña, reenvío de confirmación): cualquier
mensaje sin mapear cae en un genérico ("No se pudo completar la operación...")
en vez de filtrar texto en inglés a la UI, y el original queda logueado en el
servidor para poder mapearlo después. Ningún mensaje revela si una cuenta
existe o no.

## Códigos de invitación

El registro pide un código de invitación (además de nombre y partido). El
trigger `handle_new_user` (migración `0008_seguridad.sql`) valida el código
contra `public.codigos_invitacion` y asigna el `municipio_id` del perfil
según ese código, nunca según lo que mande el cliente. Código inicial de
Maipú: `MAIPU-2027`.

- Un código inválido, inactivo o ausente deja el perfil en
  `municipio_id = 'sin-asignar'`; esos usuarios quedan en `/pendiente`
  ("Tu cuenta espera un código válido") hasta que un admin les asigne uno.
- Para agregar un código nuevo: un `insert` en `codigos_invitacion` vía
  `scripts/aplicar-sql.mjs` (o la consola de Supabase), por ejemplo:

  ```sql
  insert into public.codigos_invitacion (codigo, municipio) values ('OTRO-2027', 'otro-partido');
  ```

- `perfiles.rol` y `perfiles.municipio_id` son inmutables desde la app
  (`revoke update` + trigger `perfiles_no_escalar`, migración
  `0008_seguridad.sql`): solo la clave secreta (sin sesión de usuario) puede
  cambiarlos, por ejemplo para promover a alguien a `municipio` o `auditor`
  (ver [Roles](#roles)).

## Cupos diarios

Para frenar abuso, `public.consumir_cupo` (migración `0009_cupos.sql`) limita
por usuario y por día: **1500 subidas de evidencia** y **30 recorridos
finalizados**. Al superarse el cupo, `prepararSubida`/`finalizarRecorrido`
devuelven un error explícito en vez de seguir aceptando datos.

## Baja de usuario

```bash
node scripts/borrar-usuario.mjs correo@ejemplo.com --dry-run   # solo lista qué borraría
node scripts/borrar-usuario.mjs correo@ejemplo.com
```

`scripts/borrar-usuario.mjs` busca el usuario por email (paginando
`auth.admin.listUsers`), borra recursivamente todo lo que tenga en
`evidencia-vial/<uid>/` (por lotes) y por último borra la cuenta de
`auth.users`: el borrado de la cuenta arrastra en cascada su perfil y, desde
ahí, sus recorridos, cobertura, puntos y observaciones. Requiere
`NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SECRET_KEY` (entorno o `.env.local`).

## Copias de seguridad

El proyecto Supabase del piloto está en el plan gratuito: backups diarios
automáticos, **sin point-in-time recovery (PITR)** (una hora de datos
perdida en el peor caso, ventana de restauración corta). Antes de pasar a
producción con datos reales de un municipio, subir al plan Pro (backups con
más retención y PITR).

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
- `npm run setup` (`node scripts/setup-entorno.mjs [--solo-migraciones] [--dry-run]`): ver [Configuración inicial](#configuración-inicial-npm-run-setup).
- `npm run borrar-usuario -- <email> [--dry-run]` (`node scripts/borrar-usuario.mjs`): ver [Baja de usuario](#baja-de-usuario).
- `npm run verificar-gcs` (`node scripts/verificar-gcs.mjs`): checklist post-cutover del bucket GCS (sube, firma, lee, borra, y avisa si el bucket sigue siendo público). Ver [Almacenamiento de evidencia](#almacenamiento-de-evidencia).

## Migraciones

Las migraciones en `supabase/migrations/` se aplican en orden con `scripts/aplicar-sql.mjs` (o todas juntas con `npm run setup`, ver [Configuración inicial](#configuración-inicial-npm-run-setup)). `docs/database-schema.sql` refleja el estado final (equivalente a aplicar todas en orden) y una instalación nueva puede correr solo ese archivo.

1. `0001_schema.sql`: esquema inicial del MVP (perfiles, caminos, relevamientos, fallas_deteccion, storage).
2. `0002_storage_por_municipio.sql`: restringe la lectura de evidencia a usuarios del mismo municipio de quien la subió.
3. `0003a_tipos_falla.sql`: agrega valores al enum `tipo_falla` (`alcantarilla_rota`, `senalizacion`, `otro`). Debe aplicarse **antes** que `0003_recorridos.sql`, de la que depende (Postgres no permite usar un valor de enum agregado en la misma transacción que lo crea).
4. `0003_recorridos.sql`: reemplaza el flujo de carga de viaje por recorridos GPS: crea `tramos`, `recorridos`, `cobertura_tramos`, `puntos_eventos`, `logros`; agrega `acepto_terminos_at` a `perfiles`; reapunta `fallas_deteccion` a `recorrido_id`; elimina `relevamientos`; agrega las funciones `cobertura_municipio` y `ranking_municipio`.
5. `0004_recorridos_procesado.sql`: agrega `recorridos.procesado_at`, el sello que hace idempotente el post-procesado de un recorrido (cobertura, puntos, observaciones, logros).
6. `0005_fallas_update.sql`: agrega la política de update propio sobre `fallas_deteccion` (corregir una observación después de creada).
7. `0006a_enums_sensor.sql`: crea los enums `calidad_segmento` y `origen_observacion`. Debe aplicarse **antes** que `0006_muestras_sensor.sql`, de la que depende (mismo motivo que `0003a`: un `create type` y su primer uso no pueden ir en la misma transacción).
8. `0006_muestras_sensor.sql`: crea `muestras_sensor` (segmentos agregados de sensores por recorrido); agrega `origen`, `magnitud` y `tramo_id` a `fallas_deteccion`; agrega la función `rugosidad_tramos`.
9. `0007_cuadros.sql`: crea `cuadros` (cuadros georreferenciados de la cámara durante el recorrido, con `tramo_id` asignado y ruta al objeto en storage); agrega la función `cuadros_por_tramo`.
10. `0008_seguridad.sql`: `perfiles` inmutable desde la app salvo `nombre`/`acepto_terminos_at` (trigger `perfiles_no_escalar`); altas de `recorridos` acotadas al municipio propio y sin update desde la app; altas de `fallas_deteccion` solo con `origen = 'manual'`; `search_path` fijo en las funciones `security definer`; tabla `codigos_invitacion` y `handle_new_user` resuelve el municipio por código, no por metadata del cliente; índices que faltaban (`puntos_eventos`, `cobertura_tramos`, `fallas_deteccion`, `cuadros`).
11. `0009_cupos.sql`: tabla `uso_diario` y función `consumir_cupo` (cupos diarios de subidas y recorridos, ver [Cupos diarios](#cupos-diarios)); restricción única `(recorrido_id, motivo)` en `puntos_eventos` para que el upsert reemplace el borrado-y-reinserción anterior.

## Capas

Archivos estáticos en `public/capas/<slug-de-municipio>/`, registrados por slug en `lib/capas.ts`:

- `caminos.geojson`: red vial rural, origen OSM (Overpass) con nomenclatura de Vialidad BA para Maipú (partido 066); cada feature lleva `nombre_codigo` para vincular tramo ↔ camino.
- `limite.geojson`: límite administrativo del partido, origen Overpass.
- `red-provincial.geojson`: recorte de la red vial provincial IGN/DVP (ver `docs/fuentes-datos.md`).
- `localidades.geojson`: polígonos de localidades y puntos de interés; para Maipú viene de `severo_data` (proyecto previo del mismo autor), copiado tal cual, no se genera con script.

## Almacenamiento de evidencia

Las fotos y videos de las observaciones se suben desde el navegador con un `PUT`
a una URL firmada que devuelve la Server Action `prepararSubida`, y se leen con
una URL firmada de lectura (nunca una URL pública fija). El proveedor se elige
con la variable `ALMACENAMIENTO`, y los dos exponen el mismo contrato
(`lib/almacenamiento/tipos.ts`): en la base se guarda siempre la **ruta**
dentro del bucket, y se firma una URL de lectura de 1 h recién al mostrarla
(`urlLectura` para una sola ruta, `urlsLectura` para firmar muchas de una
vez — el mapa firma en lote con concurrencia acotada en vez de mandar
cientos de pedidos sueltos, ver `lib/concurrencia.ts`).

- **Supabase Storage** (por defecto, `ALMACENAMIENTO=supabase` o sin definir):
  usa `createSignedUploadUrl` para subir y `createSignedUrl`/`createSignedUrls`
  sobre el bucket `evidencia-vial` para leer.
- **Google Cloud Storage** (`ALMACENAMIENTO=gcs`): usa `getSignedUrl` V4 tanto
  para subir (`action: 'write'`, 15 min) como para leer (`action: 'read'`,
  1 h). Requiere `GCS_BUCKET` (por ejemplo `maipu-pba`) y
  `GCS_SERVICE_ACCOUNT_KEY` con el JSON de la cuenta de servicio **en una sola
  línea**; `envServidor()` valida al arrancar que el JSON parsee y tenga
  `client_email`/`private_key` — una clave rota se detecta ahí, no en el
  primer pedido de un usuario.

### El bucket de GCS debe ser privado

**El bucket NO debe ser público.** Con URLs de lectura firmadas ya no hace
falta lectura pública, y dejarla habilitada expone las fotos y cuadros de
cámara de todos los municipios a cualquiera que adivine una ruta. Checklist
del cutover a un bucket nuevo (por ejemplo `maipu-pba`):

1. **Uniform bucket-level access, sin `allUsers`.** Crear el bucket con
   acceso uniforme a nivel de bucket y no otorgar ningún rol a `allUsers` ni
   `allAuthenticatedUsers`. Si el bucket viene de antes con lectura pública,
   sacar ese acceso:

   ```bash
   gsutil iam ch -d allUsers:objectViewer gs://maipu-pba
   ```

2. **La cuenta de servicio solo necesita `roles/storage.objectAdmin`**, y
   acotado a ese bucket (no a nivel de proyecto):

   ```bash
   gsutil iam ch serviceAccount:cuenta@proyecto.iam.gserviceaccount.com:roles/storage.objectAdmin gs://maipu-pba
   ```

3. **CORS para `PUT`**: las subidas firmadas van directo del navegador al
   bucket (origen cruzado), así que el bucket necesita CORS habilitado para el
   dominio de la app. Guardar como `cors.json`:

   ```json
   [
     {
       "origin": ["https://tu-dominio"],
       "method": ["PUT", "GET"],
       "responseHeader": ["Content-Type"],
       "maxAgeSeconds": 3600
     }
   ]
   ```

   y aplicarlo con:

   ```bash
   gsutil cors set cors.json gs://maipu-pba
   ```

4. **Variables de entorno**: `ALMACENAMIENTO=gcs`, `GCS_BUCKET=maipu-pba`,
   `GCS_SERVICE_ACCOUNT_KEY` con el JSON de la cuenta de servicio en una sola
   línea (ver arriba).

5. **Verificar**: con esas variables ya configuradas, correr
   `npm run verificar-gcs` (`scripts/verificar-gcs.mjs`). Sube un objeto
   chico, firma una URL de lectura, la descarga, la borra, y además chequea
   que la URL pública del objeto (sin firmar) **no** devuelva 200 — si
   devuelve 200, el bucket sigue siendo público y hay que revisar el paso 1.

Las fotos se comprimen en el teléfono antes de subirlas (`lib/imagenes.ts`:
1600 px de lado mayor, JPEG calidad 0.8); los videos se suben sin transcodificar
(hasta 15 s y 50 MB, validado en el cliente).

## Roles

Los usuarios nuevos tienen rol `productor`. Los roles `municipio` y
`auditor` son los únicos que pueden cambiar el estado de gestión de una
observación (ver [Observaciones y estado de gestión](#observaciones-y-estado-de-gestión));
todavía no hay ninguna acción en la app que dependa del rol para crear
datos (la tabla legacy `caminos` tenía alta gateada por rol, pero
`app/dashboard/caminos` se dio de baja en la ola 2 y su reemplazo, `tramos`,
todavía no tiene política de insert — ver
[Pendiente](docs/superpowers/plans/2026-09-04-endurecimiento-y-alcance.md#pendiente)).
El rol se cambia desde Supabase:

```sql
update public.perfiles set rol = 'municipio' where id = '<uuid>';
```

Nota: `rol` y `municipio_id` son inmutables desde la app (migración
`0008_seguridad.sql`); el `update` de arriba solo funciona con la clave
secreta (service role), nunca con la sesión de un usuario.

## Seguridad y rendimiento de lectura

- **Headers de seguridad** (`next.config.ts`): HSTS, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY`, `Permissions-Policy` (geolocalización, cámara,
  acelerómetro y giroscopio acotados a `self`, sin micrófono ni pagos) y una
  `Content-Security-Policy` sin `script-src` (la app no tiene JS inline ni de
  terceros, así que `default-src 'self'` ya cubre los scripts propios).
- **Cache inmutable** para `/capas/*` y `/icons/*` (no cambian salvo un
  redeploy explícito).
- **Cache por municipio** en el dashboard y el mapa: los agregados de
  cobertura y ranking usan `unstable_cache` con el tag `municipio:<slug>`, y
  se invalidan (`revalidateTag`) cuando cambia algo de ese municipio, en vez
  de recalcular en cada request.

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
- [ ] Se pide permiso de cámara al iniciar el recorrido (después del de sensores de movimiento).
- [ ] Durante la grabación se ve la vista previa chica de la cámara y el contador de cuadros capturados.
- [ ] Después de "Finalizar" con WiFi disponible, el resumen pasa a mostrar "Cuadros subidos".
- [ ] En `/dashboard/mapa`, el toggle "Cuadros" muestra los marcadores con miniatura en el popup y permite navegar anterior/siguiente dentro del tramo.
- [ ] `/dashboard/observaciones` muestra el listado con estado; con un usuario `municipio`/`auditor`, cambiar el estado desde `EstadoSelect` y ver que persiste al recargar; con un usuario `productor`, el estado se ve como badge de solo lectura.
- [ ] Exportar CSV y GeoJSON desde `/dashboard/observaciones` descargan un archivo con los datos filtrados.
- [ ] `/dashboard/tramos` lista los tramos con km, estado estimado y última visita; entrar a un tramo muestra el detalle con mapa, observaciones y cuadros.
- [ ] En un dispositivo/navegador donde el banner de instalación aparezca (Chromium: `beforeinstallprompt`; iOS Safari: instrucciones manuales), instalar la PWA y confirmar que el banner no vuelve a aparecer.
- [ ] Antes de "Iniciar recorrido" se ve el aviso de batería.
- [ ] `/recuperar` con un email registrado manda el correo (revisar plantilla en español); el enlace lleva a `/nueva-clave` con el formulario habilitado; una contraseña nueva de al menos 8 caracteres permite loguearse.
- [ ] En el login, un intento con un email sin confirmar ofrece "Reenviar correo de confirmación" con cooldown de 60 s.

## Smoke test de integración

Con `npm run dev` corriendo y `SUPABASE_ACCESS_TOKEN` en el entorno:

```bash
node scripts/smoke.mjs
```

Verifica contra el proyecto Supabase real: trigger de perfil, gate de términos (`/terminos`, `/dashboard`), RLS de `tramos`/`recorridos`/`cobertura_tramos`/`puntos_eventos`/`fallas_deteccion` por municipio y por propietario, las funciones `cobertura_municipio` y `ranking_municipio`, políticas de storage por municipio, las tres capas del estado de observación (grant de columna + RLS + trigger `fallas_estado_no_escalar`, migración 0010) y `resumen_observaciones`, las rutas `/dashboard/tramos`, `/dashboard/tramos/<id>` y la baja de `/dashboard/caminos` (404), los exportes CSV/GeoJSON de observaciones, `/recuperar`, `/nueva-clave` y `/auth/confirm`, y las rutas públicas de la PWA (`/manifest.json`, `/sw.js`, `/offline`). Crea y borra sus propios datos de prueba (usuarios, recorridos, cobertura, puntos, observaciones, archivo de storage).

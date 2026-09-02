# Visiovial Rural MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plataforma web mobile-first para relevar caminos rurales bonaerenses: auth con perfil por partido, carga de viaje con evidencia, simulación IA que genera fallas georreferenciadas y mapa con filtros.

**Architecture:** Next.js 16 App Router con Server Components para lectura y Server Actions para mutaciones. Supabase (Postgres + Auth + Storage) con RLS por municipio. Un route handler `/api/procesar-ia` usa la clave secreta para insertar fallas simuladas. Mapa con react-leaflet cargado sin SSR.

**Tech Stack:** Next.js 16.3, React 19, TypeScript estricto, Tailwind 4, `@supabase/ssr` 0.12, `@supabase/supabase-js` 2.x, zod 4, react-leaflet 5 + leaflet 1.9, Vitest 4 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-visiovial-rural-design.md`

---

## Contexto para el ejecutor

- Repo: `C:\Users\santiago\caminos_rurales` (rama `main`, remoto `rundes/caminos_rurales`). Ya contiene `README.md`, `.gitignore`, `docs/`.
- Proyecto Supabase: ref `gtuulbdxgtcqybbtocpz`, URL `https://gtuulbdxgtcqybbtocpz.supabase.co`, región us-west-2, Postgres 17. Sin tablas todavía.
- El token de acceso `SUPABASE_ACCESS_TOKEN` (empieza con `sbp_`) lo tiene el usuario. Se exporta como variable de entorno en la shell, nunca se escribe en archivos del repo.
- Las API keys del proyecto se obtienen con `npx supabase projects api-keys --project-ref gtuulbdxgtcqybbtocpz` (requiere el token en env). Usar la de tipo `publishable` (`sb_publishable_...`) y la `secret` (`sb_secret_...`).
- No hay password de base de datos disponible. Las migraciones se aplican con la Management API (`POST /v1/projects/{ref}/database/query`), ver Task 4.
- Shell: Git Bash en Windows. `node` 24, `npm` 11. Sin Docker.
- Commits: formato `<type>: <descripción>` en español. Sin `--no-verify`.

## Estructura de archivos

```
app/
  layout.tsx                    (root layout, fuente, metadata)
  page.tsx                      (landing mínima con link a /login)
  globals.css
  login/page.tsx                (formulario login/registro)
  login/actions.ts              (signIn, signUp, signOut)
  login/LoginForm.tsx           (client component con useActionState)
  dashboard/layout.tsx          (nav mobile-first + signOut)
  dashboard/page.tsx            (KPIs)
  dashboard/caminos/page.tsx    (lista + buscador + alta)
  dashboard/caminos/actions.ts  (crearCamino)
  dashboard/caminos/NuevoCaminoForm.tsx
  dashboard/cargar-viaje/page.tsx
  dashboard/cargar-viaje/actions.ts   (crearRelevamiento)
  dashboard/cargar-viaje/CargarViajeForm.tsx (client: form + upload + llamada IA)
  dashboard/mapa/page.tsx       (server: query fallas + filtros)
  dashboard/mapa/Filtros.tsx    (client: selects que actualizan query string)
  api/procesar-ia/route.ts
components/
  KpiCard.tsx
  MapaCliente.tsx               (client wrapper con next/dynamic ssr:false)
  MapaRelevamiento.tsx          (react-leaflet)
  Boton.tsx                     (botón grande mobile-first)
lib/
  tipos.ts                      (ResultadoAccion, PuntoFalla)
  partidos.ts                   (generado: 135 partidos)
  geo.ts                        (puntoAleatorioEnRadio, distanciaKm)
  validaciones.ts               (esquemas zod)
  severidad.ts                  (estadoDesdeSeveridades, colorSeveridad)
  supabase/server.ts, client.ts, admin.ts, proxy.ts, database.types.ts
proxy.ts
scripts/
  generar-partidos.mjs          (georef API → lib/partidos.ts)
  aplicar-sql.mjs               (archivo SQL → Management API)
supabase/migrations/0001_schema.sql
__tests__/                     (tests unitarios y de componentes)
vitest.config.mts
vitest.setup.ts
.env.example
```

---

### Task 1: Scaffold Next.js

**Files:**
- Create: proyecto Next.js en la raíz del repo (app/, package.json, tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs)
- Modify: `README.md` (se preserva el existente), `.gitignore` (se fusiona)

- [ ] **Step 1: Preservar README y correr create-next-app**

`create-next-app` rechaza directorios con `README.md`. Moverlo temporalmente.

```bash
cd /c/Users/santiago/caminos_rurales
mv README.md /tmp/README.visiovial.md
npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --no-react-compiler --disable-git --no-agents-md --yes
mv /tmp/README.visiovial.md README.md
```

Expected: crea `app/`, `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `public/`, `node_modules/`. Si pregunta algo interactivo, responder con los defaults (TypeScript, ESLint, Tailwind, App Router, sin src, alias `@/*`).

- [ ] **Step 2: Verificar .gitignore fusionado**

```bash
cat .gitignore
```

Debe contener `node_modules/`, `.next/`, `.env*` (o `.env` y `.env.*`) y `!.env.example`. Si `create-next-app` sobrescribió el archivo, reemplazarlo por:

```gitignore
# Dependencias
node_modules/
__pycache__/
*.pyc
.venv/
venv/

# Entornos
.env
.env.*
!.env.example

# Builds
dist/
build/
.next/
out/
next-env.d.ts
*.tsbuildinfo

# Tests
coverage/

# Sistema / editores
.DS_Store
Thumbs.db
.vscode/
.idea/
*.log
```

- [ ] **Step 3: Verificar que compila y arranca**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully` y tabla de rutas con `/`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 con TypeScript, Tailwind y ESLint"
```

---

### Task 2: Vitest y Testing Library

**Files:**
- Create: `vitest.config.mts`, `vitest.setup.ts`, `__tests__/smoke.test.tsx`
- Modify: `package.json` (scripts), `tsconfig.json` (types)

- [ ] **Step 1: Instalar dependencias de test**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event vite-tsconfig-paths
```

- [ ] **Step 2: Crear `vitest.config.mts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'components/**', 'app/**/actions.ts'],
      exclude: ['lib/supabase/database.types.ts', 'lib/partidos.ts'],
    },
  },
})
```

- [ ] **Step 3: Crear `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Agregar scripts en `package.json`**

Dentro de `"scripts"` agregar:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 5: Agregar tipos de jest-dom en `tsconfig.json`**

En `compilerOptions` agregar `"types": ["@testing-library/jest-dom"]` y en `"exclude"` dejar `["node_modules"]`. Verificar que `"strict": true` está presente.

- [ ] **Step 6: Escribir smoke test**

`__tests__/smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

function Hola() {
  return <h1>Visiovial Rural</h1>
}

test('renderiza un componente con Testing Library', () => {
  render(<Hola />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Visiovial Rural')
})
```

- [ ] **Step 7: Correr tests**

```bash
npm test
```

Expected: `1 passed`.

- [ ] **Step 8: Instalar proveedor de cobertura y verificar**

```bash
npm install -D @vitest/coverage-v8
npm run test:coverage 2>&1 | tail -5
```

Expected: tabla de cobertura sin errores.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "test: configurar Vitest y Testing Library"
```

---

### Task 3: Variables de entorno y clientes Supabase

**Files:**
- Create: `.env.example`, `.env.local`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `lib/supabase/proxy.ts`, `proxy.ts`, `lib/tipos.ts`

- [ ] **Step 1: Instalar dependencias**

```bash
npm install @supabase/ssr @supabase/supabase-js server-only zod
```

- [ ] **Step 2: Crear `.env.example`**

```env
NEXT_PUBLIC_SUPABASE_URL=https://gtuulbdxgtcqybbtocpz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
```

- [ ] **Step 3: Crear `.env.local` con valores reales**

Obtener claves (el token lo provee el usuario en la shell):

```bash
export SUPABASE_ACCESS_TOKEN=<token sbp_ del usuario>
npx --yes supabase projects api-keys --project-ref gtuulbdxgtcqybbtocpz
```

Del JSON tomar `api_key` donde `type` es `publishable` y donde `type` es `secret`. Escribir `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://gtuulbdxgtcqybbtocpz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
SUPABASE_SECRET_KEY=<sb_secret_...>
```

Verificar que git lo ignora:

```bash
git check-ignore .env.local
```

Expected: imprime `.env.local`.

- [ ] **Step 4: Crear `lib/tipos.ts`**

```ts
export type ResultadoAccion<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type Severidad = 'baja' | 'media' | 'alta'

export type TipoFalla =
  | 'bache'
  | 'carcava'
  | 'acumulacion_agua'
  | 'falta_alcantarilla'
  | 'maleza_alta'

export type PuntoFalla = {
  id: string
  tipo_falla: TipoFalla
  severidad: Severidad
  latitud: number
  longitud: number
  fecha: string
  url_evidencia_imagen: string | null
  municipio: string
}

export const ETIQUETA_TIPO_FALLA: Record<TipoFalla, string> = {
  bache: 'Bache',
  carcava: 'Cárcava',
  acumulacion_agua: 'Acumulación de agua',
  falta_alcantarilla: 'Falta de alcantarilla',
  maleza_alta: 'Maleza alta',
}

export const ETIQUETA_SEVERIDAD: Record<Severidad, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}
```

- [ ] **Step 5: Crear `lib/supabase/server.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

export async function crearClienteServidor() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Llamado desde un Server Component: el proxy refresca la sesión.
          }
        },
      },
    },
  )
}
```

`database.types.ts` se genera en Task 4. Hasta entonces crear un placeholder para que compile:

`lib/supabase/database.types.ts`:

```ts
// Placeholder. Se reemplaza con `npm run tipos` en Task 4.
export type Database = Record<string, never>
```

- [ ] **Step 6: Crear `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
```

- [ ] **Step 7: Crear `lib/supabase/admin.ts`**

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/** Cliente con clave secreta. Omite RLS. Solo para código de servidor. */
export function crearClienteAdmin() {
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!clave) {
    throw new Error('Falta SUPABASE_SECRET_KEY en el entorno')
  }
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```

- [ ] **Step 8: Crear `lib/supabase/proxy.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const RUTAS_PROTEGIDAS = ['/dashboard']

export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          respuesta = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // No poner código entre createServerClient y getClaims.
  const { data } = await supabase.auth.getClaims()
  const usuario = data?.claims

  const ruta = request.nextUrl.pathname
  const esProtegida = RUTAS_PROTEGIDAS.some((p) => ruta.startsWith(p))

  if (esProtegida && !usuario) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (ruta === '/login' && usuario) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return respuesta
}
```

- [ ] **Step 9: Crear `proxy.ts` en la raíz**

```ts
import { type NextRequest } from 'next/server'
import { actualizarSesion } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await actualizarSesion(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 10: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: clientes Supabase, proxy de sesión y variables de entorno"
```

---

### Task 4: Migración, script de aplicación y tipos generados

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `scripts/aplicar-sql.mjs`
- Replace: `lib/supabase/database.types.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Copiar el esquema a la migración**

```bash
mkdir -p supabase/migrations
cp docs/database-schema.sql supabase/migrations/0001_schema.sql
```

- [ ] **Step 2: Crear `scripts/aplicar-sql.mjs`**

```js
// Aplica un archivo SQL al proyecto Supabase vía Management API.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/aplicar-sql.mjs supabase/migrations/0001_schema.sql
import { readFile } from 'node:fs/promises'

const PROJECT_REF = 'gtuulbdxgtcqybbtocpz'
const token = process.env.SUPABASE_ACCESS_TOKEN
const archivo = process.argv[2]

if (!token) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno')
  process.exit(1)
}
if (!archivo) {
  console.error('Uso: node scripts/aplicar-sql.mjs <archivo.sql>')
  process.exit(1)
}

const query = await readFile(archivo, 'utf8')
const respuesta = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  },
)

const cuerpo = await respuesta.text()
if (!respuesta.ok) {
  console.error(`Error ${respuesta.status}: ${cuerpo}`)
  process.exit(1)
}
console.log(`OK: ${archivo} aplicado`)
console.log(cuerpo.slice(0, 500))
```

- [ ] **Step 3: Aplicar la migración**

```bash
export SUPABASE_ACCESS_TOKEN=<token sbp_ del usuario>
node scripts/aplicar-sql.mjs supabase/migrations/0001_schema.sql
```

Expected: `OK: supabase/migrations/0001_schema.sql aplicado`.

Si falla a mitad, el endpoint no es transaccional entre sentencias. Para reintentar, primero limpiar con este SQL en un archivo temporal `scripts/tmp-reset.sql` (no commitear):

```sql
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.municipio_actual();
drop function if exists public.rol_actual();
drop policy if exists "evidencia_insert_propio" on storage.objects;
drop policy if exists "evidencia_select" on storage.objects;
drop policy if exists "evidencia_delete_propio" on storage.objects;
delete from storage.buckets where id = 'evidencia-vial';
drop table if exists public.fallas_deteccion;
drop table if exists public.relevamientos;
drop table if exists public.caminos;
drop table if exists public.perfiles;
drop type if exists nivel_severidad;
drop type if exists tipo_falla;
drop type if exists origen_datos;
drop type if exists estado_camino;
drop type if exists rol_usuario;
```

- [ ] **Step 4: Verificar tablas creadas**

Crear `scripts/tmp-check.sql` (no commitear) con:

```sql
select table_name from information_schema.tables where table_schema = 'public' order by 1;
```

```bash
node scripts/aplicar-sql.mjs scripts/tmp-check.sql
rm scripts/tmp-check.sql
```

Expected: `caminos`, `fallas_deteccion`, `perfiles`, `relevamientos`.

- [ ] **Step 5: Desactivar confirmación de email (solo desarrollo)**

Sin esto, `signUp` no crea sesión hasta que el usuario confirme por correo. Para el MVP se autoconfirma.

```bash
curl -s -X PATCH "https://api.supabase.com/v1/projects/gtuulbdxgtcqybbtocpz/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mailer_autoconfirm": true}' | head -c 300
```

Expected: JSON con `"mailer_autoconfirm":true`.

- [ ] **Step 6: Generar tipos**

Agregar script en `package.json`:

```json
"tipos": "supabase gen types typescript --project-id gtuulbdxgtcqybbtocpz --schema public > lib/supabase/database.types.ts"
```

Correr:

```bash
npm install -D supabase
npm run tipos
head -20 lib/supabase/database.types.ts
```

Expected: archivo con `export type Database = { public: { Tables: { caminos: ... } } }` y helpers `Tables`, `TablesInsert`, `Enums`.

- [ ] **Step 7: Verificar tipos del proyecto**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add supabase/ scripts/aplicar-sql.mjs lib/supabase/database.types.ts package.json package-lock.json
git commit -m "feat: migración inicial con RLS, storage y tipos generados"
```

---

### Task 5: Datos de partidos

**Files:**
- Create: `scripts/generar-partidos.mjs`, `lib/partidos.ts`, `__tests__/partidos.test.ts`

- [ ] **Step 1: Escribir el test**

`__tests__/partidos.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { PARTIDOS, buscarPartido } from '@/lib/partidos'

describe('partidos', () => {
  test('hay 135 partidos con slug único', () => {
    expect(PARTIDOS).toHaveLength(135)
    const slugs = new Set(PARTIDOS.map((p) => p.slug))
    expect(slugs.size).toBe(135)
  })

  test('cada partido tiene centroide dentro de la provincia', () => {
    for (const p of PARTIDOS) {
      expect(p.lat).toBeGreaterThan(-41.5)
      expect(p.lat).toBeLessThan(-33)
      expect(p.lng).toBeGreaterThan(-64)
      expect(p.lng).toBeLessThan(-56)
    }
  })

  test('buscarPartido devuelve el partido por slug', () => {
    const p = buscarPartido('carlos-tejedor')
    expect(p?.nombre).toBe('Carlos Tejedor')
  })

  test('buscarPartido devuelve undefined si no existe', () => {
    expect(buscarPartido('no-existe')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

```bash
npm test -- partidos
```

Expected: FAIL, `Cannot find module '@/lib/partidos'`.

- [ ] **Step 3: Crear `scripts/generar-partidos.mjs`**

```js
// Genera lib/partidos.ts desde la API georef (Provincia de Buenos Aires = 06).
import { writeFile } from 'node:fs/promises'

const URL =
  'https://apis.datos.gob.ar/georef/api/departamentos?provincia=06&campos=id,nombre,centroide&max=200&orden=nombre'

function slugificar(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const respuesta = await fetch(URL)
if (!respuesta.ok) {
  console.error(`georef respondió ${respuesta.status}`)
  process.exit(1)
}
const { departamentos } = await respuesta.json()

const filas = departamentos
  .map((d) => ({
    slug: slugificar(d.nombre),
    nombre: d.nombre,
    lat: Number(d.centroide.lat.toFixed(5)),
    lng: Number(d.centroide.lon.toFixed(5)),
  }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

const cuerpo = filas
  .map((p) => `  { slug: '${p.slug}', nombre: ${JSON.stringify(p.nombre)}, lat: ${p.lat}, lng: ${p.lng} },`)
  .join('\n')

const archivo = `// Generado por scripts/generar-partidos.mjs. No editar a mano.
// Fuente: https://apis.datos.gob.ar/georef/api/departamentos?provincia=06

export type Partido = {
  slug: string
  nombre: string
  lat: number
  lng: number
}

export const PARTIDOS: readonly Partido[] = [
${cuerpo}
]

export function buscarPartido(slug: string): Partido | undefined {
  return PARTIDOS.find((p) => p.slug === slug)
}
`

await writeFile('lib/partidos.ts', archivo, 'utf8')
console.log(`OK: ${filas.length} partidos escritos en lib/partidos.ts`)
```

- [ ] **Step 4: Generar el archivo**

```bash
node scripts/generar-partidos.mjs
```

Expected: `OK: 135 partidos escritos en lib/partidos.ts`.

- [ ] **Step 5: Correr tests**

```bash
npm test -- partidos
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add scripts/generar-partidos.mjs lib/partidos.ts __tests__/partidos.test.ts
git commit -m "feat: lista de partidos bonaerenses con centroides"
```

---

### Task 6: Utilidades de dominio: geo, severidad, validaciones

**Files:**
- Create: `lib/geo.ts`, `lib/severidad.ts`, `lib/validaciones.ts`, `__tests__/geo.test.ts`, `__tests__/severidad.test.ts`, `__tests__/validaciones.test.ts`

- [ ] **Step 1: Test de geo**

`__tests__/geo.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { distanciaKm, puntoAleatorioEnRadio } from '@/lib/geo'

describe('distanciaKm', () => {
  test('distancia entre el mismo punto es 0', () => {
    expect(distanciaKm({ lat: -35, lng: -60 }, { lat: -35, lng: -60 })).toBe(0)
  })

  test('un grado de latitud son ~111 km', () => {
    const d = distanciaKm({ lat: -35, lng: -60 }, { lat: -36, lng: -60 })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })
})

describe('puntoAleatorioEnRadio', () => {
  test('genera puntos dentro del radio', () => {
    const centro = { lat: -35.5, lng: -60.2 }
    for (let i = 0; i < 200; i++) {
      const p = puntoAleatorioEnRadio(centro, 15, Math.random)
      expect(distanciaKm(centro, p)).toBeLessThanOrEqual(15.01)
    }
  })

  test('es determinista con un generador fijo', () => {
    const centro = { lat: -35.5, lng: -60.2 }
    const a = puntoAleatorioEnRadio(centro, 10, () => 0.5)
    const b = puntoAleatorioEnRadio(centro, 10, () => 0.5)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

```bash
npm test -- geo
```

Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Crear `lib/geo.ts`**

```ts
export type Coordenada = { lat: number; lng: number }

const RADIO_TIERRA_KM = 6371

function aRadianes(grados: number): number {
  return (grados * Math.PI) / 180
}

/** Distancia haversine en kilómetros. */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const dLat = aRadianes(b.lat - a.lat)
  const dLng = aRadianes(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h))
}

/**
 * Punto uniforme dentro de un círculo de `radioKm` alrededor de `centro`.
 * `aleatorio` devuelve [0, 1). Inyectable para tests.
 */
export function puntoAleatorioEnRadio(
  centro: Coordenada,
  radioKm: number,
  aleatorio: () => number = Math.random,
): Coordenada {
  const distancia = radioKm * Math.sqrt(aleatorio())
  const angulo = 2 * Math.PI * aleatorio()
  const dLat = (distancia / RADIO_TIERRA_KM) * (180 / Math.PI)
  const dLng = dLat / Math.cos(aRadianes(centro.lat))
  return {
    lat: Number((centro.lat + dLat * Math.cos(angulo)).toFixed(6)),
    lng: Number((centro.lng + dLng * Math.sin(angulo)).toFixed(6)),
  }
}
```

- [ ] **Step 4: Correr tests de geo**

```bash
npm test -- geo
```

Expected: 4 passed.

- [ ] **Step 5: Test de severidad**

`__tests__/severidad.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { colorSeveridad, estadoDesdeSeveridades } from '@/lib/severidad'

describe('estadoDesdeSeveridades', () => {
  test('sin fallas es bueno', () => {
    expect(estadoDesdeSeveridades([])).toBe('bueno')
  })
  test('solo bajas es bueno', () => {
    expect(estadoDesdeSeveridades(['baja', 'baja'])).toBe('bueno')
  })
  test('alguna media es regular', () => {
    expect(estadoDesdeSeveridades(['baja', 'media'])).toBe('regular')
  })
  test('una o dos altas es malo', () => {
    expect(estadoDesdeSeveridades(['alta', 'media'])).toBe('malo')
    expect(estadoDesdeSeveridades(['alta', 'alta'])).toBe('malo')
  })
  test('tres o más altas es intransitable', () => {
    expect(estadoDesdeSeveridades(['alta', 'alta', 'alta'])).toBe('intransitable')
  })
})

describe('colorSeveridad', () => {
  test('mapea severidad a color', () => {
    expect(colorSeveridad('alta')).toBe('#dc2626')
    expect(colorSeveridad('media')).toBe('#eab308')
    expect(colorSeveridad('baja')).toBe('#16a34a')
  })
})
```

- [ ] **Step 6: Crear `lib/severidad.ts`**

```ts
import type { Severidad } from './tipos'

export type EstadoCamino = 'bueno' | 'regular' | 'malo' | 'intransitable'

const ALTAS_PARA_INTRANSITABLE = 3

export function estadoDesdeSeveridades(severidades: readonly Severidad[]): EstadoCamino {
  const altas = severidades.filter((s) => s === 'alta').length
  if (altas >= ALTAS_PARA_INTRANSITABLE) return 'intransitable'
  if (altas > 0) return 'malo'
  if (severidades.includes('media')) return 'regular'
  return 'bueno'
}

const COLORES: Record<Severidad, string> = {
  alta: '#dc2626',
  media: '#eab308',
  baja: '#16a34a',
}

export function colorSeveridad(severidad: Severidad): string {
  return COLORES[severidad]
}

export const ETIQUETA_ESTADO: Record<EstadoCamino, string> = {
  bueno: 'Bueno',
  regular: 'Regular',
  malo: 'Malo',
  intransitable: 'Intransitable',
}
```

- [ ] **Step 7: Correr tests de severidad**

```bash
npm test -- severidad
```

Expected: 6 passed.

- [ ] **Step 8: Test de validaciones**

`__tests__/validaciones.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  esquemaCamino,
  esquemaLogin,
  esquemaRegistro,
  esquemaRelevamiento,
  primerError,
} from '@/lib/validaciones'

describe('esquemaLogin', () => {
  test('acepta email y password válidos', () => {
    expect(esquemaLogin.safeParse({ email: 'a@b.com', password: '12345678' }).success).toBe(true)
  })
  test('rechaza email inválido', () => {
    const r = esquemaLogin.safeParse({ email: 'no', password: '12345678' })
    expect(r.success).toBe(false)
  })
})

describe('esquemaRegistro', () => {
  test('exige nombre y partido válido', () => {
    const r = esquemaRegistro.safeParse({
      email: 'a@b.com',
      password: '12345678',
      nombre: 'Ana',
      municipio_id: 'carlos-tejedor',
    })
    expect(r.success).toBe(true)
  })
  test('rechaza partido inexistente', () => {
    const r = esquemaRegistro.safeParse({
      email: 'a@b.com',
      password: '12345678',
      nombre: 'Ana',
      municipio_id: 'narnia',
    })
    expect(r.success).toBe(false)
  })
})

describe('esquemaCamino', () => {
  test('exige nombre_codigo de al menos 2 caracteres', () => {
    expect(esquemaCamino.safeParse({ nombre_codigo: 'A' }).success).toBe(false)
    expect(esquemaCamino.safeParse({ nombre_codigo: 'CR-01' }).success).toBe(true)
  })
})

describe('esquemaRelevamiento', () => {
  test('convierte km desde string y valida origen', () => {
    const r = esquemaRelevamiento.safeParse({
      camino_id: '0d5a3c9a-2f3e-4d1b-9c8a-1b2c3d4e5f60',
      origen_datos: 'formulario',
      km: '12.5',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.km).toBe(12.5)
  })
  test('rechaza km negativos', () => {
    const r = esquemaRelevamiento.safeParse({
      camino_id: '0d5a3c9a-2f3e-4d1b-9c8a-1b2c3d4e5f60',
      origen_datos: 'formulario',
      km: '-1',
    })
    expect(r.success).toBe(false)
  })
})

describe('primerError', () => {
  test('devuelve el primer mensaje legible', () => {
    const r = esquemaLogin.safeParse({ email: 'no', password: '' })
    expect(r.success).toBe(false)
    if (!r.success) expect(primerError(r.error)).toMatch(/email/i)
  })
})
```

- [ ] **Step 9: Crear `lib/validaciones.ts`**

```ts
import { z } from 'zod'
import { buscarPartido } from './partidos'

export const esquemaLogin = z.object({
  email: z.email({ message: 'Email inválido' }),
  password: z.string().min(8, { message: 'La contraseña debe tener al menos 8 caracteres' }),
})

export const esquemaRegistro = esquemaLogin.extend({
  nombre: z.string().trim().min(2, { message: 'Ingresá tu nombre' }),
  municipio_id: z
    .string()
    .refine((slug) => buscarPartido(slug) !== undefined, { message: 'Elegí un partido válido' }),
})

export const esquemaCamino = z.object({
  nombre_codigo: z.string().trim().min(2, { message: 'El nombre o código debe tener al menos 2 caracteres' }),
})

export const ORIGENES_DATOS = ['app_sensor', 'camara_dashcam', 'formulario'] as const

export const esquemaRelevamiento = z.object({
  camino_id: z.uuid({ message: 'Elegí un camino' }),
  origen_datos: z.enum(ORIGENES_DATOS, { message: 'Origen de datos inválido' }),
  km: z.coerce.number().min(0, { message: 'Los km no pueden ser negativos' }).max(1000, { message: 'Km fuera de rango' }),
})

export const esquemaProcesarIa = z.object({
  relevamiento_id: z.uuid(),
})

export function primerError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Datos inválidos'
  const campo = issue.path.join('.')
  return campo ? `${campo}: ${issue.message}` : issue.message
}
```

- [ ] **Step 10: Correr todos los tests**

```bash
npm test
```

Expected: todos pasan (smoke 1, partidos 4, geo 4, severidad 6, validaciones 8).

- [ ] **Step 11: Commit**

```bash
git add lib/geo.ts lib/severidad.ts lib/validaciones.ts __tests__/
git commit -m "feat: utilidades de geo, severidad y validaciones con tests"
```

---

### Task 7: Autenticación

**Files:**
- Create: `app/login/actions.ts`, `app/login/LoginForm.tsx`, `app/login/page.tsx`, `components/Boton.tsx`, `__tests__/login-actions.test.ts`, `__tests__/LoginForm.test.tsx`
- Modify: `app/page.tsx`, `app/layout.tsx`

- [ ] **Step 1: Crear `components/Boton.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario'
  cargando?: boolean
}

export function Boton({ variante = 'primario', cargando = false, children, className = '', ...rest }: Props) {
  const base = 'w-full rounded-xl px-4 py-4 text-lg font-semibold disabled:opacity-60 transition'
  const estilos =
    variante === 'primario'
      ? 'bg-green-700 text-white active:bg-green-800'
      : 'bg-white text-green-800 border-2 border-green-700 active:bg-green-50'
  return (
    <button {...rest} disabled={rest.disabled || cargando} className={`${base} ${estilos} ${className}`}>
      {cargando ? 'Procesando…' : children}
    </button>
  )
}
```

- [ ] **Step 2: Test de Server Actions de auth**

`__tests__/login-actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const signInWithPassword = vi.fn()
const signUp = vi.fn()
const signOut = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { signInWithPassword, signUp, signOut },
  }),
}))

const redirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect }))

const { signIn, signUpAction } = await import('@/app/login/actions')

function formulario(datos: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(datos)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('signIn', () => {
  test('devuelve error de validación sin llamar a Supabase', async () => {
    const r = await signIn(undefined, formulario({ email: 'no', password: 'x' }))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/email/i) })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  test('devuelve el error de Supabase en español', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const r = await signIn(undefined, formulario({ email: 'a@b.com', password: '12345678' }))
    expect(r).toEqual({ ok: false, error: 'Email o contraseña incorrectos' })
  })

  test('redirige al dashboard si entra', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    await signIn(undefined, formulario({ email: 'a@b.com', password: '12345678' }))
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })
})

describe('signUpAction', () => {
  test('envía nombre y municipio en metadata', async () => {
    signUp.mockResolvedValue({ error: null, data: { session: {} } })
    await signUpAction(
      undefined,
      formulario({ email: 'a@b.com', password: '12345678', nombre: 'Ana', municipio_id: 'carlos-tejedor' }),
    )
    expect(signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: '12345678',
      options: { data: { nombre: 'Ana', municipio_id: 'carlos-tejedor' } },
    })
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  test('rechaza partido inválido', async () => {
    const r = await signUpAction(
      undefined,
      formulario({ email: 'a@b.com', password: '12345678', nombre: 'Ana', municipio_id: 'narnia' }),
    )
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/partido/i) })
    expect(signUp).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Correr para verificar que falla**

```bash
npm test -- login-actions
```

Expected: FAIL, módulo `@/app/login/actions` no encontrado.

- [ ] **Step 4: Crear `app/login/actions.ts`**

```ts
'use server'

import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaLogin, esquemaRegistro, primerError } from '@/lib/validaciones'

export type EstadoAuth = ResultadoAccion | undefined

const MENSAJES: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'User already registered': 'Ese email ya está registrado',
  'Email not confirmed': 'Confirmá tu email antes de ingresar',
}

function traducir(mensaje: string): string {
  return MENSAJES[mensaje] ?? `Error de autenticación: ${mensaje}`
}

export async function signIn(_prev: EstadoAuth, formData: FormData): Promise<EstadoAuth> {
  const parseo = esquemaLogin.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.signInWithPassword(parseo.data)
  if (error) return { ok: false, error: traducir(error.message) }

  redirect('/dashboard')
}

export async function signUpAction(_prev: EstadoAuth, formData: FormData): Promise<EstadoAuth> {
  const parseo = esquemaRegistro.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    nombre: formData.get('nombre'),
    municipio_id: formData.get('municipio_id'),
  })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const { email, password, nombre, municipio_id } = parseo.data
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre, municipio_id } },
  })
  if (error) return { ok: false, error: traducir(error.message) }

  if (!data.session) {
    return { ok: true, data: undefined }
  }
  redirect('/dashboard')
}

export async function signOut(): Promise<void> {
  const supabase = await crearClienteServidor()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 5: Correr tests de actions**

```bash
npm test -- login-actions
```

Expected: 5 passed.

- [ ] **Step 6: Test del formulario**

`__tests__/LoginForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/app/login/actions', () => ({
  signIn: vi.fn(),
  signUpAction: vi.fn(),
}))

const { LoginForm } = await import('@/app/login/LoginForm')

describe('LoginForm', () => {
  test('muestra login por defecto', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/partido/i)).not.toBeInTheDocument()
  })

  test('cambia a registro y muestra nombre y partido', async () => {
    render(<LoginForm />)
    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/partido/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /registrarme/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Crear `app/login/LoginForm.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { signIn, signUpAction, type EstadoAuth } from './actions'
import { Boton } from '@/components/Boton'
import { PARTIDOS } from '@/lib/partidos'

const CAMPO = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-lg'

export function LoginForm() {
  const [modo, setModo] = useState<'login' | 'registro'>('login')
  const [estadoLogin, accionLogin, pendienteLogin] = useActionState<EstadoAuth, FormData>(signIn, undefined)
  const [estadoRegistro, accionRegistro, pendienteRegistro] = useActionState<EstadoAuth, FormData>(
    signUpAction,
    undefined,
  )

  const esRegistro = modo === 'registro'
  const estado = esRegistro ? estadoRegistro : estadoLogin
  const pendiente = esRegistro ? pendienteRegistro : pendienteLogin

  return (
    <form action={esRegistro ? accionRegistro : accionLogin} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={esRegistro ? 'new-password' : 'current-password'}
          className={CAMPO}
        />
      </label>

      {esRegistro && (
        <>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Nombre</span>
            <input name="nombre" type="text" required className={CAMPO} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Partido</span>
            <select name="municipio_id" required defaultValue="" className={CAMPO}>
              <option value="" disabled>
                Elegí tu partido
              </option>
              {PARTIDOS.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {estado && !estado.ok && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {estado.error}
        </p>
      )}
      {estado && estado.ok && esRegistro && (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-green-800">
          Cuenta creada. Revisá tu email para confirmarla.
        </p>
      )}

      <Boton type="submit" cargando={pendiente}>
        {esRegistro ? 'Registrarme' : 'Ingresar'}
      </Boton>
      <Boton
        type="button"
        variante="secundario"
        onClick={() => setModo(esRegistro ? 'login' : 'registro')}
      >
        {esRegistro ? 'Ya tengo cuenta' : 'Crear cuenta'}
      </Boton>
    </form>
  )
}
```

- [ ] **Step 8: Crear `app/login/page.tsx`**

```tsx
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold text-green-800">Visiovial Rural</h1>
        <p className="text-gray-600">Relevamiento de caminos rurales</p>
      </div>
      <LoginForm />
    </main>
  )
}
```

- [ ] **Step 9: Reemplazar `app/page.tsx`**

```tsx
import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold text-green-800">Visiovial Rural</h1>
      <p className="text-lg text-gray-600">
        Plataforma de relevamiento del estado de caminos rurales de la Provincia de Buenos Aires.
      </p>
      <Link
        href="/login"
        className="rounded-xl bg-green-700 px-4 py-4 text-lg font-semibold text-white"
      >
        Ingresar
      </Link>
    </main>
  )
}
```

- [ ] **Step 10: Ajustar `app/layout.tsx`**

Reemplazar el `metadata` y el `lang`:

```tsx
export const metadata: Metadata = {
  title: 'Visiovial Rural',
  description: 'Relevamiento del estado de caminos rurales bonaerenses',
}
```

y en `<html lang="es">`. Mantener las fuentes que generó `create-next-app`.

- [ ] **Step 11: Correr tests y build**

```bash
npm test
npm run build 2>&1 | tail -8
```

Expected: tests pasan; build lista `/`, `/login`, `ƒ Proxy`.

- [ ] **Step 12: Prueba manual**

```bash
npm run dev
```

Abrir `http://localhost:3000/login`, crear cuenta con un partido. Debe redirigir a `/dashboard` (404 por ahora, se crea en Task 8). Verificar en Supabase que existe la fila en `perfiles`: crear `scripts/tmp-check.sql` con `select id, nombre, rol, municipio_id from public.perfiles;`, correr `node scripts/aplicar-sql.mjs scripts/tmp-check.sql`, borrar el archivo.

Expected: una fila con el nombre y el slug del partido elegido.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: login, registro y cierre de sesión con Server Actions"
```

---

### Task 8: Dashboard con KPIs

**Files:**
- Create: `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `components/KpiCard.tsx`, `lib/kpis.ts`, `__tests__/KpiCard.test.tsx`, `__tests__/kpis.test.ts`

- [ ] **Step 1: Test de KpiCard**

`__tests__/KpiCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { KpiCard } from '@/components/KpiCard'

test('muestra etiqueta y valor', () => {
  render(<KpiCard etiqueta="Km relevados" valor="12,5" />)
  expect(screen.getByText('Km relevados')).toBeInTheDocument()
  expect(screen.getByText('12,5')).toBeInTheDocument()
})
```

- [ ] **Step 2: Crear `components/KpiCard.tsx`**

```tsx
type Props = { etiqueta: string; valor: string | number }

export function KpiCard({ etiqueta, valor }: Props) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{etiqueta}</p>
      <p className="text-3xl font-bold text-green-800">{valor}</p>
    </div>
  )
}
```

- [ ] **Step 3: Test de cálculo de KPIs**

`__tests__/kpis.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { sumarKm } from '@/lib/kpis'

describe('sumarKm', () => {
  test('suma metadata.km ignorando valores inválidos', () => {
    const filas = [
      { metadata: { km: 10 } },
      { metadata: { km: '5.5' } },
      { metadata: {} },
      { metadata: null },
      { metadata: { km: 'x' } },
    ]
    expect(sumarKm(filas)).toBe(15.5)
  })
})
```

- [ ] **Step 4: Crear `lib/kpis.ts`**

```ts
import type { Json } from './supabase/database.types'

type FilaConMetadata = { metadata: Json | null }

export function sumarKm(filas: readonly FilaConMetadata[]): number {
  let total = 0
  for (const fila of filas) {
    const meta = fila.metadata
    if (meta && typeof meta === 'object' && !Array.isArray(meta) && 'km' in meta) {
      const km = Number(meta.km)
      if (Number.isFinite(km)) total += km
    }
  }
  return Number(total.toFixed(1))
}

export function formatearNumero(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n)
}
```

Si `Json` no está exportado en `database.types.ts` (depende de la versión de la CLI), reemplazar el import por `type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]` local.

- [ ] **Step 5: Correr tests**

```bash
npm test -- Kpi kpis
```

Expected: 2 passed.

- [ ] **Step 6: Crear `app/dashboard/layout.tsx`**

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'
import { buscarPartido } from '@/lib/partidos'
import { signOut } from '@/app/login/actions'

const ENLACES = [
  { href: '/dashboard', etiqueta: 'Inicio' },
  { href: '/dashboard/caminos', etiqueta: 'Caminos' },
  { href: '/dashboard/cargar-viaje', etiqueta: 'Cargar viaje' },
  { href: '/dashboard/mapa', etiqueta: 'Mapa' },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, rol, municipio_id')
    .eq('id', user.id)
    .single()

  const partido = perfil ? buscarPartido(perfil.municipio_id)?.nombre ?? perfil.municipio_id : ''

  return (
    <div className="min-h-dvh bg-gray-50 pb-24">
      <header className="flex items-center justify-between bg-green-800 px-4 py-3 text-white">
        <div>
          <p className="font-semibold">{perfil?.nombre ?? user.email}</p>
          <p className="text-xs opacity-80">
            {partido} · {perfil?.rol ?? 'productor'}
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="rounded-lg bg-green-700 px-3 py-2 text-sm">
            Salir
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t bg-white">
        {ENLACES.map((e) => (
          <Link key={e.href} href={e.href} className="py-4 text-center text-sm font-medium text-green-800">
            {e.etiqueta}
          </Link>
        ))}
      </nav>
    </div>
  )
}
```

- [ ] **Step 7: Crear `app/dashboard/page.tsx`**

```tsx
import { KpiCard } from '@/components/KpiCard'
import { formatearNumero, sumarKm } from '@/lib/kpis'
import { crearClienteServidor } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await crearClienteServidor()

  const [relevamientos, fallas, ultimos] = await Promise.all([
    supabase.from('relevamientos').select('metadata'),
    supabase.from('fallas_deteccion').select('id', { count: 'exact', head: true }),
    supabase
      .from('relevamientos')
      .select('id, fecha, origen_datos, procesado_ia, caminos(nombre_codigo)')
      .order('fecha', { ascending: false })
      .limit(5),
  ])

  const error = relevamientos.error ?? fallas.error ?? ultimos.error
  if (error) {
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudieron cargar los datos: {error.message}</p>
  }

  const km = sumarKm(relevamientos.data ?? [])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Resumen</h1>
      <div className="grid grid-cols-2 gap-4">
        <KpiCard etiqueta="Km relevados" valor={formatearNumero(km)} />
        <KpiCard etiqueta="Fallas activas" valor={fallas.count ?? 0} />
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Últimos reportes</h2>
        {ultimos.data && ultimos.data.length > 0 ? (
          <ul className="divide-y rounded-2xl bg-white shadow-sm">
            {ultimos.data.map((r) => (
              <li key={r.id} className="flex justify-between px-4 py-3">
                <span>{r.caminos?.nombre_codigo ?? 'Sin camino'}</span>
                <span className="text-sm text-gray-500">
                  {new Date(r.fecha).toLocaleDateString('es-AR')} · {r.procesado_ia ? 'procesado' : 'pendiente'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">Todavía no hay relevamientos.</p>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 8: Verificar tipos y build**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -8
```

Expected: sin errores; ruta `/dashboard` listada.

- [ ] **Step 9: Prueba manual**

`npm run dev`, ingresar, ver `/dashboard` con KPIs en 0 y "Todavía no hay relevamientos". Botón Salir vuelve a `/login`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: layout del dashboard y KPIs"
```

---

### Task 9: Gestión de caminos

**Files:**
- Create: `app/dashboard/caminos/page.tsx`, `app/dashboard/caminos/actions.ts`, `app/dashboard/caminos/NuevoCaminoForm.tsx`, `__tests__/caminos-actions.test.ts`

- [ ] **Step 1: Test de la action**

`__tests__/caminos-actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const insert = vi.fn()
const single = vi.fn()
const getUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from: (tabla: string) => {
      if (tabla === 'perfiles') {
        return { select: () => ({ eq: () => ({ single }) }) }
      }
      return { insert }
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { crearCamino } = await import('@/app/dashboard/caminos/actions')

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('crearCamino', () => {
  test('rechaza nombre corto', async () => {
    const fd = new FormData()
    fd.set('nombre_codigo', 'A')
    const r = await crearCamino(undefined, fd)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/2 caracteres/) })
    expect(insert).not.toHaveBeenCalled()
  })

  test('inserta con el municipio del perfil', async () => {
    single.mockResolvedValue({ data: { municipio_id: 'carlos-tejedor', rol: 'municipio' }, error: null })
    insert.mockResolvedValue({ error: null })
    const fd = new FormData()
    fd.set('nombre_codigo', 'CR-01')
    const r = await crearCamino(undefined, fd)
    expect(insert).toHaveBeenCalledWith({ nombre_codigo: 'CR-01', municipio: 'carlos-tejedor' })
    expect(r).toEqual({ ok: true, data: undefined })
  })

  test('devuelve mensaje claro si RLS rechaza', async () => {
    single.mockResolvedValue({ data: { municipio_id: 'carlos-tejedor', rol: 'productor' }, error: null })
    insert.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })
    const fd = new FormData()
    fd.set('nombre_codigo', 'CR-01')
    const r = await crearCamino(undefined, fd)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/permiso/i) })
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

```bash
npm test -- caminos-actions
```

Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Crear `app/dashboard/caminos/actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaCamino, primerError } from '@/lib/validaciones'

export type EstadoAccionCamino = ResultadoAccion | undefined

export async function crearCamino(_prev: EstadoAccionCamino, formData: FormData): Promise<EstadoAccionCamino> {
  const parseo = esquemaCamino.safeParse({ nombre_codigo: formData.get('nombre_codigo') })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a ingresar.' }

  const { data: perfil, error: errorPerfil } = await supabase
    .from('perfiles')
    .select('municipio_id, rol')
    .eq('id', user.id)
    .single()
  if (errorPerfil || !perfil) return { ok: false, error: 'No se encontró tu perfil' }

  const { error } = await supabase
    .from('caminos')
    .insert({ nombre_codigo: parseo.data.nombre_codigo, municipio: perfil.municipio_id })

  if (error) {
    if (error.message.includes('row-level security')) {
      return { ok: false, error: 'No tenés permiso para crear caminos. Pedí el rol municipio o auditor.' }
    }
    return { ok: false, error: `No se pudo crear el camino: ${error.message}` }
  }

  revalidatePath('/dashboard/caminos')
  return { ok: true, data: undefined }
}
```

- [ ] **Step 4: Correr tests**

```bash
npm test -- caminos-actions
```

Expected: 3 passed.

- [ ] **Step 5: Crear `app/dashboard/caminos/NuevoCaminoForm.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { Boton } from '@/components/Boton'
import { crearCamino, type EstadoAccionCamino } from './actions'

export function NuevoCaminoForm() {
  const [estado, accion, pendiente] = useActionState<EstadoAccionCamino, FormData>(crearCamino, undefined)

  return (
    <form action={accion} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Nuevo camino (nombre o código)</span>
        <input
          name="nombre_codigo"
          type="text"
          required
          minLength={2}
          placeholder="Ej: CR-014 Camino a La Elisa"
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg"
        />
      </label>
      {estado && !estado.ok && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {estado.error}
        </p>
      )}
      {estado && estado.ok && (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-green-800">
          Camino creado.
        </p>
      )}
      <Boton type="submit" cargando={pendiente}>
        Agregar camino
      </Boton>
    </form>
  )
}
```

- [ ] **Step 6: Crear `app/dashboard/caminos/page.tsx`**

```tsx
import { ETIQUETA_ESTADO } from '@/lib/severidad'
import { crearClienteServidor } from '@/lib/supabase/server'
import { NuevoCaminoForm } from './NuevoCaminoForm'

type Props = { searchParams: Promise<{ q?: string }> }

export default async function CaminosPage({ searchParams }: Props) {
  const { q = '' } = await searchParams
  const supabase = await crearClienteServidor()

  let consulta = supabase
    .from('caminos')
    .select('id, nombre_codigo, estado_general, ultima_actualizacion')
    .order('nombre_codigo')
  if (q.trim()) consulta = consulta.ilike('nombre_codigo', `%${q.trim()}%`)

  const { data: caminos, error } = await consulta

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Caminos</h1>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o código"
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg"
        />
        <button type="submit" className="rounded-xl bg-green-700 px-4 text-white">
          Buscar
        </button>
      </form>

      {error && <p className="rounded-xl bg-red-50 p-4 text-red-800">Error: {error.message}</p>}

      {caminos && caminos.length === 0 && <p className="text-gray-500">No hay caminos cargados.</p>}

      {caminos && caminos.length > 0 && (
        <ul className="divide-y rounded-2xl bg-white shadow-sm">
          {caminos.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <span className="font-medium">{c.nombre_codigo}</span>
              <span className="text-sm text-gray-600">
                {ETIQUETA_ESTADO[c.estado_general ?? 'regular']}
              </span>
            </li>
          ))}
        </ul>
      )}

      <NuevoCaminoForm />
    </div>
  )
}
```

- [ ] **Step 7: Verificar y probar**

```bash
npx tsc --noEmit && npm test
```

Prueba manual: el usuario registrado tiene rol `productor`, así que crear camino debe mostrar el mensaje de permiso. Promover el usuario con `scripts/tmp-check.sql`:

```sql
update public.perfiles set rol = 'municipio' where nombre = '<nombre del usuario de prueba>';
```

```bash
node scripts/aplicar-sql.mjs scripts/tmp-check.sql && rm scripts/tmp-check.sql
```

Volver a intentar: el camino aparece en la lista.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: lista, buscador y alta de caminos"
```

---

### Task 10: Carga de viaje con evidencia

**Files:**
- Create: `app/dashboard/cargar-viaje/page.tsx`, `app/dashboard/cargar-viaje/actions.ts`, `app/dashboard/cargar-viaje/CargarViajeForm.tsx`, `lib/archivos.ts`, `__tests__/archivos.test.ts`, `__tests__/relevamiento-actions.test.ts`

- [ ] **Step 1: Test de utilidades de archivos**

`__tests__/archivos.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { rutaEvidencia, validarArchivo } from '@/lib/archivos'

describe('validarArchivo', () => {
  test('acepta jpeg de 5 MB', () => {
    const f = new File([new Uint8Array(5 * 1024 * 1024)], 'foto.jpg', { type: 'image/jpeg' })
    expect(validarArchivo(f)).toBeNull()
  })
  test('rechaza tipo no permitido', () => {
    const f = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    expect(validarArchivo(f)).toMatch(/tipo/i)
  })
  test('rechaza más de 100 MB', () => {
    const f = new File([new Uint8Array(1)], 'v.mp4', { type: 'video/mp4' })
    Object.defineProperty(f, 'size', { value: 101 * 1024 * 1024 })
    expect(validarArchivo(f)).toMatch(/100 MB/)
  })
})

describe('rutaEvidencia', () => {
  test('arma uid/relevamiento/timestamp-nombre sin caracteres raros', () => {
    const r = rutaEvidencia('u1', 'r1', 'mi foto ñ.JPG', 1700000000000)
    expect(r).toBe('u1/r1/1700000000000-mi-foto-n.jpg')
  })
})
```

- [ ] **Step 2: Crear `lib/archivos.ts`**

```ts
export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'] as const
export const TAMANO_MAXIMO_BYTES = 100 * 1024 * 1024

export function validarArchivo(archivo: File): string | null {
  if (!(TIPOS_PERMITIDOS as readonly string[]).includes(archivo.type)) {
    return `Tipo no permitido: ${archivo.type || 'desconocido'}. Usá JPG, PNG, WebP, MP4 o MOV.`
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return 'El archivo supera los 100 MB.'
  }
  return null
}

function limpiarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function rutaEvidencia(uid: string, relevamientoId: string, nombre: string, ahora = Date.now()): string {
  return `${uid}/${relevamientoId}/${ahora}-${limpiarNombre(nombre)}`
}
```

- [ ] **Step 3: Correr tests de archivos**

```bash
npm test -- archivos
```

Expected: 4 passed.

- [ ] **Step 4: Test de la action de relevamiento**

`__tests__/relevamiento-actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const getUser = vi.fn()
const insertSingle = vi.fn()
const updateEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from: () => ({
      insert: () => ({ select: () => ({ single: insertSingle }) }),
      update: () => ({ eq: updateEq }),
    }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { crearRelevamiento, registrarArchivos } = await import('@/app/dashboard/cargar-viaje/actions')

const CAMINO = '0d5a3c9a-2f3e-4d1b-9c8a-1b2c3d4e5f60'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('crearRelevamiento', () => {
  test('valida y devuelve el id creado', async () => {
    insertSingle.mockResolvedValue({ data: { id: 'r1' }, error: null })
    const r = await crearRelevamiento({ camino_id: CAMINO, origen_datos: 'formulario', km: '3' })
    expect(r).toEqual({ ok: true, data: { id: 'r1' } })
  })

  test('rechaza origen inválido', async () => {
    const r = await crearRelevamiento({ camino_id: CAMINO, origen_datos: 'otro', km: '3' })
    expect(r.ok).toBe(false)
    expect(insertSingle).not.toHaveBeenCalled()
  })
})

describe('registrarArchivos', () => {
  test('guarda las rutas en metadata', async () => {
    updateEq.mockResolvedValue({ error: null })
    const r = await registrarArchivos('r1', 4.5, ['u1/r1/a.jpg'])
    expect(r).toEqual({ ok: true, data: undefined })
  })
})
```

- [ ] **Step 5: Crear `app/dashboard/cargar-viaje/actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaRelevamiento, primerError } from '@/lib/validaciones'

export type DatosRelevamiento = { camino_id: string; origen_datos: string; km: string }

export async function crearRelevamiento(datos: DatosRelevamiento): Promise<ResultadoAccion<{ id: string }>> {
  const parseo = esquemaRelevamiento.safeParse(datos)
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a ingresar.' }

  const { data, error } = await supabase
    .from('relevamientos')
    .insert({
      usuario_id: user.id,
      camino_id: parseo.data.camino_id,
      origen_datos: parseo.data.origen_datos,
      metadata: { km: parseo.data.km, archivos: [] },
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: `No se pudo crear el relevamiento: ${error?.message ?? 'sin datos'}` }
  return { ok: true, data: { id: data.id } }
}

export async function registrarArchivos(
  relevamientoId: string,
  km: number,
  rutas: string[],
): Promise<ResultadoAccion> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase
    .from('relevamientos')
    .update({ metadata: { km, archivos: rutas } })
    .eq('id', relevamientoId)

  if (error) return { ok: false, error: `No se pudieron registrar los archivos: ${error.message}` }
  revalidatePath('/dashboard')
  return { ok: true, data: undefined }
}
```

- [ ] **Step 6: Correr tests**

```bash
npm test -- relevamiento-actions
```

Expected: 3 passed.

- [ ] **Step 7: Crear `app/dashboard/cargar-viaje/CargarViajeForm.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { Boton } from '@/components/Boton'
import { rutaEvidencia, validarArchivo } from '@/lib/archivos'
import { crearClienteNavegador } from '@/lib/supabase/client'
import { ORIGENES_DATOS } from '@/lib/validaciones'
import { crearRelevamiento, registrarArchivos } from './actions'

type Camino = { id: string; nombre_codigo: string }
type EstadoArchivo = { archivo: File; estado: 'pendiente' | 'subiendo' | 'ok' | 'error'; mensaje?: string }
type Fase = 'formulario' | 'subiendo' | 'procesando' | 'listo' | 'error'

const ETIQUETA_ORIGEN: Record<(typeof ORIGENES_DATOS)[number], string> = {
  formulario: 'Formulario manual',
  camara_dashcam: 'Cámara / dashcam',
  app_sensor: 'App con sensores',
}

const CAMPO = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-lg'

export function CargarViajeForm({ caminos, uid }: { caminos: Camino[]; uid: string }) {
  const router = useRouter()
  const [archivos, setArchivos] = useState<EstadoArchivo[]>([])
  const [fase, setFase] = useState<Fase>('formulario')
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<string | null>(null)

  function agregar(lista: FileList | null) {
    if (!lista) return
    const nuevos: EstadoArchivo[] = Array.from(lista).map((archivo) => {
      const invalido = validarArchivo(archivo)
      return invalido ? { archivo, estado: 'error', mensaje: invalido } : { archivo, estado: 'pendiente' }
    })
    setArchivos((prev) => [...prev, ...nuevos])
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    agregar(e.dataTransfer.files)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    agregar(e.target.files)
    e.target.value = ''
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const km = String(fd.get('km') ?? '0')

    const creado = await crearRelevamiento({
      camino_id: String(fd.get('camino_id') ?? ''),
      origen_datos: String(fd.get('origen_datos') ?? ''),
      km,
    })
    if (!creado.ok) {
      setError(creado.error)
      return
    }

    setFase('subiendo')
    const supabase = crearClienteNavegador()
    const rutas: string[] = []
    const validos = archivos.filter((a) => a.estado !== 'error')

    for (const item of validos) {
      setArchivos((prev) => prev.map((a) => (a === item ? { ...a, estado: 'subiendo' } : a)))
      const ruta = rutaEvidencia(uid, creado.data.id, item.archivo.name)
      const { error: errorSubida } = await supabase.storage.from('evidencia-vial').upload(ruta, item.archivo)
      if (errorSubida) {
        setArchivos((prev) =>
          prev.map((a) => (a === item ? { ...a, estado: 'error', mensaje: errorSubida.message } : a)),
        )
      } else {
        rutas.push(ruta)
        setArchivos((prev) => prev.map((a) => (a === item ? { ...a, estado: 'ok' } : a)))
      }
    }

    const registro = await registrarArchivos(creado.data.id, Number(km), rutas)
    if (!registro.ok) {
      setFase('error')
      setError(registro.error)
      return
    }

    setFase('procesando')
    const respuesta = await fetch('/api/procesar-ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relevamiento_id: creado.data.id }),
    })
    const cuerpo = (await respuesta.json()) as { ok: boolean; fallas?: number; error?: string }
    if (!respuesta.ok || !cuerpo.ok) {
      setFase('error')
      setError(cuerpo.error ?? `Error ${respuesta.status} al procesar`)
      return
    }

    setFase('listo')
    setResumen(`Relevamiento guardado. ${rutas.length} archivo(s) subidos, ${cuerpo.fallas ?? 0} fallas detectadas.`)
    router.refresh()
  }

  if (fase === 'listo') {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-green-800">
          {resumen}
        </p>
        <Boton type="button" onClick={() => router.push('/dashboard/mapa')}>
          Ver en el mapa
        </Boton>
        <Boton type="button" variante="secundario" onClick={() => window.location.reload()}>
          Cargar otro viaje
        </Boton>
      </div>
    )
  }

  const ocupado = fase === 'subiendo' || fase === 'procesando'

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Camino</span>
        <select name="camino_id" required defaultValue="" className={CAMPO} disabled={ocupado}>
          <option value="" disabled>
            Elegí un camino
          </option>
          {caminos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre_codigo}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Origen de los datos</span>
        <select name="origen_datos" required defaultValue="camara_dashcam" className={CAMPO} disabled={ocupado}>
          {ORIGENES_DATOS.map((o) => (
            <option key={o} value={o}>
              {ETIQUETA_ORIGEN[o]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Kilómetros recorridos</span>
        <input name="km" type="number" step="0.1" min="0" max="1000" required className={CAMPO} disabled={ocupado} />
      </label>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="rounded-2xl border-2 border-dashed border-green-700 bg-white p-6 text-center"
      >
        <p className="mb-3 text-gray-600">Arrastrá fotos o videos, o tocá para elegir</p>
        <label className="inline-block cursor-pointer rounded-xl bg-green-700 px-4 py-3 font-semibold text-white">
          Elegir archivos
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            onChange={onChange}
            className="hidden"
            disabled={ocupado}
          />
        </label>
      </div>

      {archivos.length > 0 && (
        <ul className="divide-y rounded-2xl bg-white shadow-sm">
          {archivos.map((a, i) => (
            <li key={`${a.archivo.name}-${i}`} className="flex justify-between px-4 py-2 text-sm">
              <span className="truncate">{a.archivo.name}</span>
              <span className={a.estado === 'error' ? 'text-red-700' : 'text-gray-500'}>
                {a.estado === 'error' ? a.mensaje : a.estado}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {error}
        </p>
      )}

      {fase === 'procesando' && (
        <p role="status" className="rounded-xl bg-yellow-50 px-4 py-3 text-yellow-800">
          Analizando evidencia…
        </p>
      )}

      <Boton type="submit" cargando={ocupado} disabled={caminos.length === 0}>
        Guardar relevamiento
      </Boton>
    </form>
  )
}
```

- [ ] **Step 8: Crear `app/dashboard/cargar-viaje/page.tsx`**

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'
import { CargarViajeForm } from './CargarViajeForm'

export default async function CargarViajePage() {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: caminos, error } = await supabase.from('caminos').select('id, nombre_codigo').order('nombre_codigo')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Cargar viaje</h1>
      {error && <p className="rounded-xl bg-red-50 p-4 text-red-800">Error: {error.message}</p>}
      {caminos && caminos.length === 0 && (
        <p className="rounded-xl bg-yellow-50 p-4 text-yellow-800">
          No hay caminos en tu partido. <Link href="/dashboard/caminos" className="underline">Cargá uno primero.</Link>
        </p>
      )}
      <CargarViajeForm caminos={caminos ?? []} uid={user.id} />
    </div>
  )
}
```

- [ ] **Step 9: Verificar tipos y tests**

```bash
npx tsc --noEmit && npm test
```

Expected: sin errores. (La llamada a `/api/procesar-ia` fallará en runtime hasta Task 11.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: carga de viaje con subida de evidencia a Storage"
```

---

### Task 11: API de simulación IA

**Files:**
- Create: `app/api/procesar-ia/route.ts`, `lib/simulador.ts`, `__tests__/simulador.test.ts`

- [ ] **Step 1: Test del simulador**

`__tests__/simulador.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { generarFallasSimuladas } from '@/lib/simulador'
import { distanciaKm } from '@/lib/geo'

describe('generarFallasSimuladas', () => {
  const centro = { lat: -35.5, lng: -60.2 }

  test('genera entre 2 y 6 fallas dentro de 15 km', () => {
    for (let i = 0; i < 50; i++) {
      const fallas = generarFallasSimuladas(centro, Math.random)
      expect(fallas.length).toBeGreaterThanOrEqual(2)
      expect(fallas.length).toBeLessThanOrEqual(6)
      for (const f of fallas) {
        expect(distanciaKm(centro, { lat: f.latitud, lng: f.longitud })).toBeLessThanOrEqual(15.01)
        expect(['baja', 'media', 'alta']).toContain(f.severidad)
      }
    }
  })

  test('es determinista con generador fijo', () => {
    const a = generarFallasSimuladas(centro, () => 0.3)
    const b = generarFallasSimuladas(centro, () => 0.3)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Crear `lib/simulador.ts`**

```ts
import { puntoAleatorioEnRadio, type Coordenada } from './geo'
import type { Severidad, TipoFalla } from './tipos'

const TIPOS: readonly TipoFalla[] = ['bache', 'carcava', 'acumulacion_agua', 'falta_alcantarilla', 'maleza_alta']
const SEVERIDADES: readonly Severidad[] = ['baja', 'media', 'alta']
const MIN_FALLAS = 2
const MAX_FALLAS = 6
const RADIO_KM = 15

export type FallaSimulada = {
  tipo_falla: TipoFalla
  severidad: Severidad
  latitud: number
  longitud: number
}

function elegir<T>(lista: readonly T[], aleatorio: () => number): T {
  const indice = Math.min(lista.length - 1, Math.floor(aleatorio() * lista.length))
  return lista[indice]
}

export function generarFallasSimuladas(centro: Coordenada, aleatorio: () => number = Math.random): FallaSimulada[] {
  const cantidad = MIN_FALLAS + Math.floor(aleatorio() * (MAX_FALLAS - MIN_FALLAS + 1))
  const fallas: FallaSimulada[] = []
  for (let i = 0; i < cantidad; i++) {
    const punto = puntoAleatorioEnRadio(centro, RADIO_KM, aleatorio)
    fallas.push({
      tipo_falla: elegir(TIPOS, aleatorio),
      severidad: elegir(SEVERIDADES, aleatorio),
      latitud: punto.lat,
      longitud: punto.lng,
    })
  }
  return fallas
}
```

- [ ] **Step 3: Correr tests**

```bash
npm test -- simulador
```

Expected: 2 passed.

- [ ] **Step 4: Crear `app/api/procesar-ia/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { buscarPartido } from '@/lib/partidos'
import { estadoDesdeSeveridades } from '@/lib/severidad'
import { generarFallasSimuladas } from '@/lib/simulador'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/server'
import { esquemaProcesarIa } from '@/lib/validaciones'

export async function POST(request: Request) {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })

  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Cuerpo inválido' }, { status: 400 })
  }
  const parseo = esquemaProcesarIa.safeParse(cuerpo)
  if (!parseo.success) return NextResponse.json({ ok: false, error: 'relevamiento_id inválido' }, { status: 400 })

  // Con el cliente del usuario: RLS garantiza que el relevamiento es visible para él.
  const { data: relevamiento, error: errorRel } = await supabase
    .from('relevamientos')
    .select('id, usuario_id, camino_id, procesado_ia, metadata')
    .eq('id', parseo.data.relevamiento_id)
    .single()
  if (errorRel || !relevamiento) {
    return NextResponse.json({ ok: false, error: 'Relevamiento no encontrado' }, { status: 404 })
  }
  if (relevamiento.usuario_id !== user.id) {
    return NextResponse.json({ ok: false, error: 'El relevamiento no es tuyo' }, { status: 403 })
  }
  if (relevamiento.procesado_ia) {
    return NextResponse.json({ ok: false, error: 'Ya fue procesado' }, { status: 409 })
  }

  const { data: perfil } = await supabase.from('perfiles').select('municipio_id').eq('id', user.id).single()
  const partido = perfil ? buscarPartido(perfil.municipio_id) : undefined
  if (!partido) {
    return NextResponse.json({ ok: false, error: 'Tu perfil no tiene un partido válido' }, { status: 422 })
  }

  const archivos =
    relevamiento.metadata && typeof relevamiento.metadata === 'object' && 'archivos' in relevamiento.metadata
      ? (relevamiento.metadata.archivos as string[])
      : []
  const primeraEvidencia = archivos[0] ?? null

  const fallas = generarFallasSimuladas({ lat: partido.lat, lng: partido.lng }).map((f) => ({
    ...f,
    relevamiento_id: relevamiento.id,
    url_evidencia_imagen: primeraEvidencia,
  }))

  try {
    const admin = crearClienteAdmin()
    const { error: errorFallas } = await admin.from('fallas_deteccion').insert(fallas)
    if (errorFallas) throw new Error(errorFallas.message)

    const { error: errorRelUpd } = await admin
      .from('relevamientos')
      .update({ procesado_ia: true })
      .eq('id', relevamiento.id)
    if (errorRelUpd) throw new Error(errorRelUpd.message)

    if (relevamiento.camino_id) {
      const { error: errorCamino } = await admin
        .from('caminos')
        .update({
          estado_general: estadoDesdeSeveridades(fallas.map((f) => f.severidad)),
          ultima_actualizacion: new Date().toISOString(),
        })
        .eq('id', relevamiento.camino_id)
      if (errorCamino) throw new Error(errorCamino.message)
    }
  } catch (e) {
    console.error('[procesar-ia]', e)
    return NextResponse.json({ ok: false, error: 'Error interno al procesar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, fallas: fallas.length })
}
```

- [ ] **Step 5: Verificar tipos y build**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -10
```

Expected: ruta `/api/procesar-ia` listada.

- [ ] **Step 6: Prueba manual del flujo completo**

`npm run dev`. Ir a Cargar viaje, elegir camino, subir una foto JPG, guardar. Debe terminar en "Relevamiento guardado. 1 archivo(s) subidos, N fallas detectadas." Volver al dashboard: km relevados y fallas activas actualizados; el camino cambió de estado en la lista.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: endpoint de simulación IA que genera fallas georreferenciadas"
```

---

### Task 12: Mapa de fallas

**Files:**
- Create: `components/MapaRelevamiento.tsx`, `components/MapaCliente.tsx`, `app/dashboard/mapa/page.tsx`, `app/dashboard/mapa/Filtros.tsx`, `lib/fallas.ts`, `__tests__/fallas.test.ts`, `__tests__/Filtros.test.tsx`

- [ ] **Step 1: Instalar leaflet**

```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

- [ ] **Step 2: Test de transformación de filas a puntos**

`__tests__/fallas.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { aPuntos, filtrarPuntos, municipiosDe } from '@/lib/fallas'

const filas = [
  {
    id: 'f1',
    tipo_falla: 'bache' as const,
    severidad: 'alta' as const,
    latitud: -35.1,
    longitud: -60.1,
    url_evidencia_imagen: null,
    created_at: '2026-01-01T00:00:00Z',
    relevamientos: { fecha: '2026-01-02T00:00:00Z', caminos: { municipio: 'carlos-tejedor' } },
  },
  {
    id: 'f2',
    tipo_falla: 'maleza_alta' as const,
    severidad: 'baja' as const,
    latitud: -35.2,
    longitud: -60.2,
    url_evidencia_imagen: 'u/r/a.jpg',
    created_at: '2026-01-01T00:00:00Z',
    relevamientos: null,
  },
]

describe('aPuntos', () => {
  test('convierte filas anidadas a puntos planos', () => {
    const puntos = aPuntos(filas)
    expect(puntos[0]).toMatchObject({ id: 'f1', municipio: 'carlos-tejedor', fecha: '2026-01-02T00:00:00Z' })
    expect(puntos[1].municipio).toBe('desconocido')
  })
})

describe('filtrarPuntos', () => {
  test('filtra por tipo y municipio', () => {
    const puntos = aPuntos(filas)
    expect(filtrarPuntos(puntos, { tipo: 'bache' })).toHaveLength(1)
    expect(filtrarPuntos(puntos, { municipio: 'carlos-tejedor' })).toHaveLength(1)
    expect(filtrarPuntos(puntos, {})).toHaveLength(2)
  })
})

describe('municipiosDe', () => {
  test('lista municipios únicos ordenados', () => {
    expect(municipiosDe(aPuntos(filas))).toEqual(['carlos-tejedor', 'desconocido'])
  })
})
```

- [ ] **Step 3: Crear `lib/fallas.ts`**

```ts
import type { PuntoFalla, Severidad, TipoFalla } from './tipos'

export type FilaFalla = {
  id: string
  tipo_falla: TipoFalla
  severidad: Severidad
  latitud: number
  longitud: number
  url_evidencia_imagen: string | null
  created_at: string | null
  relevamientos: { fecha: string; caminos: { municipio: string } | null } | null
}

export type FiltrosFallas = { tipo?: string; municipio?: string }

export function aPuntos(filas: readonly FilaFalla[]): PuntoFalla[] {
  return filas.map((f) => ({
    id: f.id,
    tipo_falla: f.tipo_falla,
    severidad: f.severidad,
    latitud: Number(f.latitud),
    longitud: Number(f.longitud),
    fecha: f.relevamientos?.fecha ?? f.created_at ?? '',
    url_evidencia_imagen: f.url_evidencia_imagen,
    municipio: f.relevamientos?.caminos?.municipio ?? 'desconocido',
  }))
}

export function filtrarPuntos(puntos: readonly PuntoFalla[], filtros: FiltrosFallas): PuntoFalla[] {
  return puntos.filter(
    (p) => (!filtros.tipo || p.tipo_falla === filtros.tipo) && (!filtros.municipio || p.municipio === filtros.municipio),
  )
}

export function municipiosDe(puntos: readonly PuntoFalla[]): string[] {
  return [...new Set(puntos.map((p) => p.municipio))].sort()
}
```

- [ ] **Step 4: Correr tests**

```bash
npm test -- fallas
```

Expected: 3 passed.

- [ ] **Step 5: Test de Filtros**

`__tests__/Filtros.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/dashboard/mapa',
  useSearchParams: () => new URLSearchParams('municipio=carlos-tejedor'),
}))

const { Filtros } = await import('@/app/dashboard/mapa/Filtros')

test('cambiar tipo actualiza la query string conservando municipio', async () => {
  render(<Filtros municipios={['carlos-tejedor']} />)
  await userEvent.selectOptions(screen.getByLabelText(/tipo de falla/i), 'bache')
  expect(push).toHaveBeenCalledWith('/dashboard/mapa?municipio=carlos-tejedor&tipo=bache')
})
```

- [ ] **Step 6: Crear `app/dashboard/mapa/Filtros.tsx`**

```tsx
'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { buscarPartido } from '@/lib/partidos'
import { ETIQUETA_TIPO_FALLA, type TipoFalla } from '@/lib/tipos'

const CAMPO = 'w-full rounded-xl border border-gray-300 px-3 py-2'

export function Filtros({ municipios }: { municipios: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function actualizar(clave: string, valor: string) {
    const siguiente = new URLSearchParams(params.toString())
    if (valor) siguiente.set(clave, valor)
    else siguiente.delete(clave)
    const qs = siguiente.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span>Tipo de falla</span>
        <select
          className={CAMPO}
          value={params.get('tipo') ?? ''}
          onChange={(e) => actualizar('tipo', e.target.value)}
        >
          <option value="">Todas</option>
          {(Object.keys(ETIQUETA_TIPO_FALLA) as TipoFalla[]).map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_FALLA[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Municipio</span>
        <select
          className={CAMPO}
          value={params.get('municipio') ?? ''}
          onChange={(e) => actualizar('municipio', e.target.value)}
        >
          <option value="">Todos</option>
          {municipios.map((m) => (
            <option key={m} value={m}>
              {buscarPartido(m)?.nombre ?? m}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
```

- [ ] **Step 7: Correr test de Filtros**

```bash
npm test -- Filtros
```

Expected: 1 passed.

- [ ] **Step 8: Crear `components/MapaRelevamiento.tsx`**

```tsx
'use client'

import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { colorSeveridad } from '@/lib/severidad'
import { ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_FALLA, type PuntoFalla } from '@/lib/tipos'

type Props = { puntos: PuntoFalla[]; centro: [number, number]; urlsEvidencia: Record<string, string> }

const ZOOM_INICIAL = 10

export function MapaRelevamiento({ puntos, centro, urlsEvidencia }: Props) {
  return (
    <MapContainer center={centro} zoom={ZOOM_INICIAL} className="h-[60dvh] w-full rounded-2xl" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {puntos.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.latitud, p.longitud]}
          radius={9}
          pathOptions={{ color: colorSeveridad(p.severidad), fillColor: colorSeveridad(p.severidad), fillOpacity: 0.8 }}
        >
          <Popup>
            <strong>{ETIQUETA_TIPO_FALLA[p.tipo_falla]}</strong>
            <br />
            Severidad: {ETIQUETA_SEVERIDAD[p.severidad]}
            <br />
            {p.fecha ? new Date(p.fecha).toLocaleDateString('es-AR') : ''}
            {p.url_evidencia_imagen && urlsEvidencia[p.url_evidencia_imagen] && (
              <>
                <br />
                <a href={urlsEvidencia[p.url_evidencia_imagen]} target="_blank" rel="noreferrer">
                  Ver evidencia
                </a>
              </>
            )}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
```

- [ ] **Step 9: Crear `components/MapaCliente.tsx`**

```tsx
'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { MapaRelevamiento } from './MapaRelevamiento'

const Mapa = dynamic(() => import('./MapaRelevamiento').then((m) => m.MapaRelevamiento), {
  ssr: false,
  loading: () => <div className="h-[60dvh] w-full animate-pulse rounded-2xl bg-gray-200" />,
})

export function MapaCliente(props: ComponentProps<typeof MapaRelevamiento>) {
  return <Mapa {...props} />
}
```

- [ ] **Step 10: Crear `app/dashboard/mapa/page.tsx`**

```tsx
import { MapaCliente } from '@/components/MapaCliente'
import { aPuntos, filtrarPuntos, municipiosDe, type FilaFalla } from '@/lib/fallas'
import { buscarPartido } from '@/lib/partidos'
import { crearClienteServidor } from '@/lib/supabase/server'
import { Filtros } from './Filtros'

type Props = { searchParams: Promise<{ tipo?: string; municipio?: string }> }

const CENTRO_PROVINCIA: [number, number] = [-36.6, -60.0]
const SEGUNDOS_URL_FIRMADA = 60 * 60

export default async function MapaPage({ searchParams }: Props) {
  const filtros = await searchParams
  const supabase = await crearClienteServidor()

  const { data, error } = await supabase
    .from('fallas_deteccion')
    .select('id, tipo_falla, severidad, latitud, longitud, url_evidencia_imagen, created_at, relevamientos(fecha, caminos(municipio))')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) {
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudo cargar el mapa: {error.message}</p>
  }

  const todos = aPuntos((data ?? []) as FilaFalla[])
  const puntos = filtrarPuntos(todos, filtros)
  const municipios = municipiosDe(todos)

  const rutas = [...new Set(puntos.map((p) => p.url_evidencia_imagen).filter((r): r is string => Boolean(r)))]
  const urlsEvidencia: Record<string, string> = {}
  if (rutas.length > 0) {
    const { data: firmadas } = await supabase.storage.from('evidencia-vial').createSignedUrls(rutas, SEGUNDOS_URL_FIRMADA)
    for (const f of firmadas ?? []) {
      if (f.path && f.signedUrl) urlsEvidencia[f.path] = f.signedUrl
    }
  }

  const partidoFiltro = filtros.municipio ? buscarPartido(filtros.municipio) : undefined
  const centro: [number, number] = partidoFiltro
    ? [partidoFiltro.lat, partidoFiltro.lng]
    : puntos[0]
      ? [puntos[0].latitud, puntos[0].longitud]
      : CENTRO_PROVINCIA

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Mapa de fallas</h1>
      <Filtros municipios={municipios} />
      <p className="text-sm text-gray-600">
        {puntos.length} falla(s). Rojo: alta · Amarillo: media · Verde: baja.
      </p>
      <MapaCliente puntos={puntos} centro={centro} urlsEvidencia={urlsEvidencia} />
    </div>
  )
}
```

- [ ] **Step 11: Verificar tipos, tests y build**

```bash
npx tsc --noEmit && npm test && npm run build 2>&1 | tail -10
```

Si `tsc` marca que el `select` anidado no coincide con `FilaFalla`, el cast `as FilaFalla[]` cubre la diferencia de tipos entre la inferencia de Supabase y el tipo plano. Si `tsc` marca que `latitud` es `number` pero Supabase lo infiere como `number` (numeric), no hay conflicto. Si lo infiere como `string`, cambiar `latitud: number` por `latitud: number | string` en `FilaFalla` (la conversión ya usa `Number()`).

- [ ] **Step 12: Prueba manual**

`npm run dev`, ir a Mapa. Ver marcadores de colores en el partido del usuario. Filtrar por tipo. Abrir popup y "Ver evidencia".

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: mapa de fallas con marcadores por severidad y filtros"
```

---

### Task 13: Cierre del MVP

**Files:**
- Modify: `README.md`, `docs/step-by-step-guide.md`

- [ ] **Step 1: Lint, tests con cobertura y build**

```bash
npm run lint && npm run test:coverage 2>&1 | tail -20 && npm run build 2>&1 | tail -12
```

Expected: lint sin errores, cobertura de `lib/` ≥ 80%, build OK. Si la cobertura de `lib/` baja de 80%, agregar tests para las funciones sin cubrir antes de seguir.

- [ ] **Step 2: Actualizar README.md**

Reemplazar la sección "Stack" del README por:

```markdown
## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Supabase (Auth, Postgres, Storage), react-leaflet.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con las claves del proyecto Supabase
npm run dev
```

Scripts:

- `npm test`: tests unitarios (Vitest).
- `npm run test:coverage`: cobertura.
- `npm run tipos`: regenera `lib/supabase/database.types.ts` (requiere `SUPABASE_ACCESS_TOKEN`).
- `node scripts/aplicar-sql.mjs <archivo.sql>`: aplica SQL al proyecto (requiere `SUPABASE_ACCESS_TOKEN`).
- `node scripts/generar-partidos.mjs`: regenera `lib/partidos.ts` desde la API georef.

## Roles

Los usuarios nuevos tienen rol `productor`. Para crear caminos hace falta `municipio` o `auditor`; se cambia desde Supabase:

```sql
update public.perfiles set rol = 'municipio' where id = '<uuid>';
```
```

- [ ] **Step 3: Marcar fases completadas en `docs/step-by-step-guide.md`**

Cambiar `- [ ]` por `- [x]` en las fases 0 a 5.

- [ ] **Step 4: Commit y push**

```bash
git add -A
git commit -m "docs: instrucciones de desarrollo y fases completadas"
git push
```

- [ ] **Step 5: Recordatorio al usuario**

Informar: rotar el token `sbp_` usado durante el setup (Supabase → Account → Access Tokens) y, cuando lleguen datos de UBA, abrir fase 6.

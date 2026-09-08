// Da de baja un usuario por completo: borra su evidencia en
// evidencia-vial/{uid}/ (recursivo, por lotes) y su cuenta de auth. Borrar la
// cuenta de auth borra en cascada su perfil y, desde ahí, sus recorridos,
// cobertura, puntos y observaciones (todas las FK apuntan a auth.users o a
// perfiles con on delete cascade).
//
// Uso:
//   node scripts/borrar-usuario.mjs correo@ejemplo.com --dry-run
//   node scripts/borrar-usuario.mjs correo@ejemplo.com
//
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno (o en
// .env.local, igual que scripts/smoke.mjs).
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const REPO = process.cwd()
const require = createRequire(REPO + '/package.json')
const { createClient } = require('@supabase/supabase-js')

export const BUCKET_EVIDENCIA = 'evidencia-vial'
const USUARIOS_POR_PAGINA = 200
const ARCHIVOS_POR_LOTE = 100

function cargarEnvLocal() {
  const ruta = REPO + '/.env.local'
  if (!existsSync(ruta)) return {}
  return Object.fromEntries(
    readFileSync(ruta, 'utf8')
      .split(/\r?\n/)
      .filter((linea) => linea.includes('=') && !linea.trim().startsWith('#'))
      .map((linea) => {
        const i = linea.indexOf('=')
        return [linea.slice(0, i).trim(), linea.slice(i + 1).trim()]
      }),
  )
}

/** Busca un usuario por email paginando `auth.admin.listUsers`. */
export async function buscarUsuarioPorEmail(admin, email) {
  const objetivo = email.trim().toLowerCase()
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: USUARIOS_POR_PAGINA })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const encontrado = data.users.find((u) => (u.email ?? '').toLowerCase() === objetivo)
    if (encontrado) return encontrado
    if (data.users.length < USUARIOS_POR_PAGINA) return null
  }
}

/** Lista (recursiva) todas las rutas de archivo bajo `prefijo` en el bucket. */
export async function listarRutasRecursivo(storage, prefijo) {
  const rutas = []
  const pendientes = [prefijo]
  while (pendientes.length > 0) {
    const actual = pendientes.pop()
    const { data, error } = await storage.list(actual, { limit: 1000 })
    if (error) throw new Error(`storage.list(${actual}): ${error.message}`)
    for (const entrada of data ?? []) {
      const ruta = `${actual}/${entrada.name}`
      // Un "directorio" simulado no tiene `id`; un archivo real sí.
      if (entrada.id) rutas.push(ruta)
      else pendientes.push(ruta)
    }
  }
  return rutas
}

function enLotes(items, tamano) {
  const lotes = []
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano))
  return lotes
}

/** Borra en lotes las rutas dadas del bucket. Devuelve cuántas borró. */
export async function borrarRutas(storage, rutas, tamanoLote = ARCHIVOS_POR_LOTE) {
  for (const lote of enLotes(rutas, tamanoLote)) {
    const { error } = await storage.remove(lote)
    if (error) throw new Error(`storage.remove: ${error.message}`)
  }
  return rutas.length
}

export async function main(argv) {
  const dryRun = argv.includes('--dry-run')
  const email = argv.find((a) => !a.startsWith('--'))

  if (!email) {
    console.error('Uso: node scripts/borrar-usuario.mjs <email> [--dry-run]')
    process.exitCode = 1
    return
  }

  const envArchivo = cargarEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? envArchivo.NEXT_PUBLIC_SUPABASE_URL
  const secreta = process.env.SUPABASE_SECRET_KEY ?? envArchivo.SUPABASE_SECRET_KEY

  if (!url || !secreta) {
    console.error('[borrar-usuario] Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (entorno o .env.local)')
    process.exitCode = 1
    return
  }

  const admin = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } })

  const usuario = await buscarUsuarioPorEmail(admin, email)
  if (!usuario) {
    console.error(`[borrar-usuario] No se encontró ningún usuario con email ${email}`)
    process.exitCode = 1
    return
  }
  console.log(`[borrar-usuario] usuario encontrado: ${usuario.id} (${usuario.email})`)

  const storage = admin.storage.from(BUCKET_EVIDENCIA)
  const rutas = await listarRutasRecursivo(storage, usuario.id)
  console.log(`[borrar-usuario] ${rutas.length} archivo(s) en ${BUCKET_EVIDENCIA}/${usuario.id}/`)

  if (dryRun) {
    rutas.slice(0, 20).forEach((r) => console.log(`  ${r}`))
    if (rutas.length > 20) console.log(`  ... y ${rutas.length - 20} más`)
    console.log(
      `[borrar-usuario] --dry-run: no se borra nada (se borraría el storage de arriba y luego auth.users ${usuario.id}, en cascada sobre perfiles y sus datos)`,
    )
    return
  }

  if (rutas.length > 0) {
    await borrarRutas(storage, rutas)
    console.log(`[borrar-usuario] ${rutas.length} archivo(s) borrados de storage`)
  }

  const { error } = await admin.auth.admin.deleteUser(usuario.id)
  if (error) throw new Error(`auth.admin.deleteUser: ${error.message}`)
  console.log(`[borrar-usuario] usuario ${usuario.id} (${usuario.email}) borrado`)
}

const esEjecutadoDirectamente = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1]

if (esEjecutadoDirectamente) {
  main(process.argv.slice(2)).catch((error) => {
    console.error('[borrar-usuario]', error)
    process.exit(1)
  })
}

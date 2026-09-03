// Asigna `nombre_codigo` a los tramos de public/capas/maipu/caminos.geojson,
// reescribe el archivo con esa propiedad agregada (null para los tramos
// excluidos: calles urbanas de Maipú ciudad) y siembra public.caminos con
// un código por camino, vía la Management API de Supabase.
//
// Uso:
//   node scripts/seed-caminos-maipu.mjs --dry-run   # solo imprime el SQL
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/seed-caminos-maipu.mjs
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirContexto, procesarColeccion } from './lib/asignar-caminos.mjs'
import { aplicarSql } from './lib/management-api.mjs'

// path.join(process.cwd(), ...) en vez de `new URL('../public/...',
// import.meta.url)`: ese patrón lo intercepta la resolución de assets de
// Vite/Vitest para cualquier ruta bajo public/ y deja de ser una URL
// file:// (rompe fileURLToPath al testear este módulo).
const RUTA_CAMINOS = path.join(process.cwd(), 'public/capas/maipu/caminos.geojson')
const RUTA_LOCALIDADES = path.join(process.cwd(), 'public/capas/maipu/localidades.geojson')
const MUNICIPIO = 'maipu'

function escaparSql(texto) {
  return texto.replace(/'/g, "''")
}

/** SQL idempotente: inserta cada código de `public.caminos` para el municipio si no existe ya. */
export function generarSql(codigos, municipio = MUNICIPIO) {
  const valores = codigos.map((c) => `    ('${escaparSql(c)}')`).join(',\n')
  return `insert into public.caminos (nombre_codigo, municipio)
select v.nombre_codigo, '${municipio}'
from (values
${valores}
) as v(nombre_codigo)
where not exists (
  select 1 from public.caminos c
  where c.nombre_codigo = v.nombre_codigo and c.municipio = '${municipio}'
);
`
}

function imprimirResumen(resumen) {
  console.log('[seed-caminos-maipu] tramos y km por código:')
  let totalTramos = 0
  let totalKm = 0
  for (const [codigo, datos] of [...resumen.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${codigo}: ${datos.tramos} tramo(s), ${datos.km.toFixed(1)} km`)
    totalTramos += datos.tramos
    totalKm += datos.km
  }
  console.log(`[seed-caminos-maipu] total: ${totalTramos} tramo(s), ${totalKm.toFixed(1)} km en ${resumen.size} camino(s)`)
}

export async function main(argv) {
  const dryRun = argv.includes('--dry-run')

  const [coleccionCaminos, coleccionLocalidades] = await Promise.all([
    readFile(RUTA_CAMINOS, 'utf8').then((texto) => JSON.parse(texto)),
    readFile(RUTA_LOCALIDADES, 'utf8').then((texto) => JSON.parse(texto)),
  ])

  const contexto = construirContexto(coleccionLocalidades)
  const { coleccion, resumen } = procesarColeccion(coleccionCaminos, contexto)

  await writeFile(RUTA_CAMINOS, JSON.stringify(coleccion), 'utf8')
  console.log(`[seed-caminos-maipu] ${coleccion.features.length} tramo(s) escritos en ${RUTA_CAMINOS} (nombre_codigo)`)

  imprimirResumen(resumen)

  const sql = generarSql([...resumen.keys()].sort())

  if (dryRun) {
    console.log('\n[seed-caminos-maipu] --dry-run: SQL generado (no aplicado)\n')
    console.log(sql)
    return
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    console.error('[seed-caminos-maipu] Falta SUPABASE_ACCESS_TOKEN en el entorno')
    process.exitCode = 1
    return
  }

  const resultado = await aplicarSql(sql, token)
  console.log('\n[seed-caminos-maipu] SQL aplicado:')
  console.log(resultado.slice(0, 1000))
}

const esEjecutadoDirectamente = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1]

if (esEjecutadoDirectamente) {
  main(process.argv.slice(2)).catch((error) => {
    console.error('[seed-caminos-maipu]', error)
    process.exit(1)
  })
}

// Siembra public.tramos con los tramos de public/capas/maipu/caminos.geojson
// que tienen `nombre_codigo` (los excluidos son calles urbanas de Maipú
// ciudad). Cada tramo guarda su geometría LineString ([lng,lat][]), sus km y
// la localidad rural a la que pertenece: el denominador de la cobertura.
//
// Uso:
//   node scripts/seed-tramos.mjs --dry-run   # imprime el SQL y su tamaño
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/seed-tramos.mjs
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirContexto, localidadDeTramo } from './lib/asignar-caminos.mjs'
import { kmDeLineas } from './lib/capas-municipio.mjs'
import { aplicarSql } from './lib/management-api.mjs'

// path.join(process.cwd(), ...) en vez de `new URL('../public/...',
// import.meta.url)`: ese patrón lo intercepta la resolución de assets de
// Vite/Vitest para rutas bajo public/ (ver scripts/seed-caminos-maipu.mjs).
const RUTA_CAMINOS = path.join(process.cwd(), 'public/capas/maipu/caminos.geojson')
const RUTA_LOCALIDADES = path.join(process.cwd(), 'public/capas/maipu/localidades.geojson')
const MUNICIPIO = 'maipu'
// La Management API aplica cada consulta entera: se envía por lotes para no
// depender de un límite de tamaño no documentado.
const TRAMOS_POR_LOTE = 50

function escaparSql(texto) {
  return String(texto).replace(/'/g, "''")
}

/** Filas `{ id, nombre_codigo, localidad, km, geometria }` de la colección de caminos. */
export function tramosDeColeccion(coleccion, contexto) {
  return (coleccion.features ?? [])
    .filter((feature) => Boolean(feature.properties?.nombre_codigo))
    .map((feature) => {
      const coordenadas = feature.geometry?.coordinates ?? []
      return {
        id: String(feature.properties.id),
        nombre_codigo: feature.properties.nombre_codigo,
        localidad: localidadDeTramo(feature, contexto),
        km: Number(kmDeLineas([coordenadas]).toFixed(3)),
        geometria: coordenadas,
      }
    })
}

/** Un `insert ... on conflict (id) do update` idempotente para un lote de tramos. */
export function generarSql(tramos, municipio = MUNICIPIO) {
  const valores = tramos
    .map(
      (t) =>
        `  ('${escaparSql(t.id)}', '${escaparSql(municipio)}', '${escaparSql(t.nombre_codigo)}', ` +
        `'${escaparSql(t.localidad)}', ${t.km}, '${escaparSql(JSON.stringify(t.geometria))}'::jsonb)`,
    )
    .join(',\n')

  return `insert into public.tramos (id, municipio, nombre_codigo, localidad, km, geometria) values
${valores}
on conflict (id) do update set
  municipio = excluded.municipio,
  nombre_codigo = excluded.nombre_codigo,
  localidad = excluded.localidad,
  km = excluded.km,
  geometria = excluded.geometria;
`
}

/** Parte la lista en lotes de `tamano` elementos. */
export function enLotes(items, tamano = TRAMOS_POR_LOTE) {
  const lotes = []
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano))
  return lotes
}

function imprimirResumen(tramos) {
  const porLocalidad = new Map()
  for (const t of tramos) {
    const actual = porLocalidad.get(t.localidad) ?? { tramos: 0, km: 0 }
    porLocalidad.set(t.localidad, { tramos: actual.tramos + 1, km: actual.km + t.km })
  }
  console.log('[seed-tramos] tramos y km por localidad:')
  for (const [localidad, datos] of [...porLocalidad.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${localidad}: ${datos.tramos} tramo(s), ${datos.km.toFixed(1)} km`)
  }
  const km = tramos.reduce((suma, t) => suma + t.km, 0)
  console.log(`[seed-tramos] total: ${tramos.length} tramo(s), ${km.toFixed(1)} km`)
}

export async function main(argv) {
  const dryRun = argv.includes('--dry-run')

  const [coleccionCaminos, coleccionLocalidades] = await Promise.all([
    readFile(RUTA_CAMINOS, 'utf8').then((texto) => JSON.parse(texto)),
    readFile(RUTA_LOCALIDADES, 'utf8').then((texto) => JSON.parse(texto)),
  ])

  const contexto = construirContexto(coleccionLocalidades)
  const tramos = tramosDeColeccion(coleccionCaminos, contexto)
  imprimirResumen(tramos)

  const lotes = enLotes(tramos)
  const sqls = lotes.map((lote) => generarSql(lote))

  if (dryRun) {
    console.log(`\n[seed-tramos] --dry-run: ${sqls.length} lote(s), no aplicado`)
    sqls.forEach((sql, i) => console.log(`  lote ${i + 1}: ${lotes[i].length} tramo(s), ${sql.length} bytes`))
    console.log(`\n${sqls[0]?.slice(0, 600) ?? ''}`)
    return
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    console.error('[seed-tramos] Falta SUPABASE_ACCESS_TOKEN en el entorno')
    process.exitCode = 1
    return
  }

  for (const [i, sql] of sqls.entries()) {
    await aplicarSql(sql, token)
    console.log(`[seed-tramos] lote ${i + 1}/${sqls.length} aplicado (${lotes[i].length} tramo(s))`)
  }
}

const esEjecutadoDirectamente = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1]

if (esEjecutadoDirectamente) {
  main(process.argv.slice(2)).catch((error) => {
    console.error('[seed-tramos]', error)
    process.exit(1)
  })
}

// Configura un proyecto Supabase nuevo (o pone uno existente al día): aplica
// todas las migraciones de supabase/migrations/ en el orden documentado en
// README.md y siembra los datos base del piloto Maipú (caminos y tramos).
//
// El orden importa: 0003a agrega valores al enum tipo_falla que 0003 usa
// (Postgres no permite usar un valor de enum agregado en la misma
// transacción que lo crea), y 0006a agrega los enums de sensor que 0006 usa
// por el mismo motivo.
//
// Uso:
//   node scripts/setup-entorno.mjs --dry-run             # imprime el plan, no aplica nada
//   node scripts/setup-entorno.mjs --solo-migraciones     # aplica solo las migraciones, sin seeds
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/setup-entorno.mjs
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { aplicarSql } from './lib/management-api.mjs'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR_MIGRACIONES = path.join(RAIZ, 'supabase', 'migrations')

/** Orden documentado en README.md § Migraciones. No reordenar sin revisar ahí. */
export const ORDEN_MIGRACIONES = [
  '0001_schema.sql',
  '0002_storage_por_municipio.sql',
  '0003a_tipos_falla.sql',
  '0003_recorridos.sql',
  '0004_recorridos_procesado.sql',
  '0005_fallas_update.sql',
  '0006a_enums_sensor.sql',
  '0006_muestras_sensor.sql',
  '0007_cuadros.sql',
  '0008_seguridad.sql',
  '0009_cupos.sql',
]

/** Orden de siembra: caminos primero (public.caminos), luego tramos (denominador de cobertura). */
export const SEEDS = ['seed-caminos-maipu.mjs', 'seed-tramos.mjs']

function ejecutarSeed(nombre, dryRun) {
  const argumentos = dryRun ? ['--dry-run'] : []
  console.log(`\n[setup-entorno] seed: ${nombre}${dryRun ? ' --dry-run' : ''}`)
  const resultado = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', nombre), ...argumentos], {
    stdio: 'inherit',
    env: process.env,
  })
  if (resultado.status !== 0) {
    throw new Error(`${nombre} terminó con código ${resultado.status}`)
  }
}

export async function main(argv) {
  const dryRun = argv.includes('--dry-run')
  const soloMigraciones = argv.includes('--solo-migraciones')
  const token = process.env.SUPABASE_ACCESS_TOKEN

  if (!dryRun && !token) {
    console.error('[setup-entorno] Falta SUPABASE_ACCESS_TOKEN en el entorno')
    process.exitCode = 1
    return
  }

  console.log(`[setup-entorno] ${ORDEN_MIGRACIONES.length} migración(es), en orden:`)
  ORDEN_MIGRACIONES.forEach((archivo, i) => console.log(`  ${i + 1}. ${archivo}`))

  if (dryRun) {
    console.log('\n[setup-entorno] --dry-run: no se aplica ninguna migración')
    if (soloMigraciones) return
    console.log(`[setup-entorno] seeds (en orden): ${SEEDS.join(', ')}`)
    for (const seed of SEEDS) ejecutarSeed(seed, true)
    return
  }

  for (const [i, archivo] of ORDEN_MIGRACIONES.entries()) {
    const sql = await readFile(path.join(DIR_MIGRACIONES, archivo), 'utf8')
    await aplicarSql(sql, token)
    console.log(`[setup-entorno] ${i + 1}/${ORDEN_MIGRACIONES.length} aplicada: ${archivo}`)
  }

  if (soloMigraciones) {
    console.log('\n[setup-entorno] --solo-migraciones: seeds omitidos')
    return
  }

  for (const seed of SEEDS) ejecutarSeed(seed, false)

  console.log('\n[setup-entorno] listo')
}

const esEjecutadoDirectamente = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1]

if (esEjecutadoDirectamente) {
  main(process.argv.slice(2)).catch((error) => {
    console.error('[setup-entorno]', error)
    process.exit(1)
  })
}

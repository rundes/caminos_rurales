// Regenera lib/supabase/database.types.ts desde el esquema real de Supabase.
// Valida la salida de `supabase gen types` antes de escribir el archivo: si el
// comando falla o devuelve algo inesperado (por ejemplo un error HTML/CLI en
// vez de TypeScript), el archivo existente queda intacto.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/generar-tipos.mjs
import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PROJECT_REF = 'gtuulbdxgtcqybbtocpz'
const DESTINO = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'lib',
  'supabase',
  'database.types.ts',
)

const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno')
  process.exit(1)
}

const resultado = spawnSync(
  'npx',
  ['--yes', 'supabase', 'gen', 'types', 'typescript', '--project-id', PROJECT_REF, '--schema', 'public'],
  { encoding: 'utf8', shell: true, env: process.env },
)

if (resultado.error) {
  console.error(resultado.error.message)
  process.exit(1)
}
if (resultado.status !== 0) {
  console.error(`supabase gen types terminó con código ${resultado.status}`)
  console.error((resultado.stderr ?? '').slice(0, 300))
  process.exit(1)
}

const salida = resultado.stdout ?? ''
const valida = salida.startsWith('export type Json') && salida.includes('public: {')

if (!valida) {
  console.error('La salida de "supabase gen types" no parece TypeScript válido. Primeros 300 caracteres:')
  console.error(salida.slice(0, 300))
  process.exit(1)
}

await writeFile(DESTINO, salida)
console.log(`OK: ${path.relative(process.cwd(), DESTINO)} regenerado (${salida.length} caracteres)`)

// Aplica un archivo SQL al proyecto Supabase vía Management API.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/aplicar-sql.mjs supabase/migrations/0001_schema.sql
import { readFile } from 'node:fs/promises'
import { aplicarSql } from './lib/management-api.mjs'

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

try {
  const cuerpo = await aplicarSql(query, token)
  console.log(`OK: ${archivo} aplicado`)
  console.log(cuerpo.slice(0, 500))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

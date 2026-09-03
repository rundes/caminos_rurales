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

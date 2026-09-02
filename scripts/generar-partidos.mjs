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

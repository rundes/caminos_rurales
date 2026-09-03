// Reproduce la descarga de public/capas/maipu/caminos.geojson desde Overpass.
// No se re-ejecuta automáticamente: el archivo ya está commiteado. Overpass
// devuelve 504 con frecuencia para queries de área grande; el script reintenta.
//
// Uso: node scripts/generar-capas-maipu.mjs
//
// public/capas/maipu/localidades.geojson NO se genera con este script: viene
// de severo_data (polígonos de localidades y POIs de Maipú relevados
// manualmente en un proyecto previo del mismo autor). Se copia tal cual.
import { writeFile } from 'node:fs/promises'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const DESTINO = new URL('../public/capas/maipu/caminos.geojson', import.meta.url)
const REINTENTOS = 3
const ESPERA_REINTENTO_MS = 20_000
const DECIMALES_COORDENADAS = 5

const QUERY = `
[out:json][timeout:120];
area["name"="Partido de Maipú"]["boundary"="administrative"]->.a;
( way["highway"~"^(secondary|tertiary|unclassified|track)$"](area.a); );
out geom;
`

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function consultarOverpass() {
  for (let intento = 1; intento <= REINTENTOS; intento += 1) {
    const respuesta = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: QUERY,
    })
    if (respuesta.ok) return respuesta.json()

    console.error(`[generar-capas-maipu] intento ${intento}/${REINTENTOS} falló: ${respuesta.status}`)
    if (intento < REINTENTOS) await esperar(ESPERA_REINTENTO_MS)
  }
  throw new Error('Overpass no respondió tras los reintentos')
}

function redondear(numero) {
  return Number(numero.toFixed(DECIMALES_COORDENADAS))
}

function aFeatureCollection(datosOverpass) {
  const features = (datosOverpass.elements ?? [])
    .filter((el) => el.type === 'way' && Array.isArray(el.geometry))
    .map((el) => ({
      type: 'Feature',
      properties: {
        id: el.id,
        name: el.tags?.name ?? null,
        ref: el.tags?.ref ?? null,
        highway: el.tags?.highway ?? null,
        surface: el.tags?.surface ?? null,
      },
      geometry: {
        type: 'LineString',
        coordinates: el.geometry.map((pt) => [redondear(pt.lon), redondear(pt.lat)]),
      },
    }))
  return { type: 'FeatureCollection', features }
}

async function main() {
  const datos = await consultarOverpass()
  const coleccion = aFeatureCollection(datos)
  await writeFile(DESTINO, JSON.stringify(coleccion))
  console.log(`[generar-capas-maipu] ${coleccion.features.length} tramos escritos en ${DESTINO.pathname}`)
}

main().catch((error) => {
  console.error('[generar-capas-maipu]', error)
  process.exit(1)
})

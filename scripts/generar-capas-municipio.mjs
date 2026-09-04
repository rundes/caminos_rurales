// Genera las capas GeoJSON de un municipio (partido de la Provincia de
// Buenos Aires): límite administrativo (Overpass) y red vial provincial
// (recorte de data/red-vial-provincial.geojson, fuente IGN/DVP). Con
// --osm además reproduce la descarga de caminos OSM (secundario/terciario/
// no clasificado/huella) que antes hacía scripts/generar-capas-maipu.mjs.
//
// Uso:
//   node scripts/generar-capas-municipio.mjs <slug> [--osm]
//
// Ejemplo: node scripts/generar-capas-municipio.mjs maipu
//
// Si Overpass no responde (504 tras reintentos) para el límite, se usa el
// limite.geojson existente en disco (si lo hay) y se avisa por consola.
//
// public/capas/<slug>/localidades.geojson NO se genera con este script:
// cuando existe viene de una fuente relevada aparte (ver
// generar-capas-maipu.mjs para el caso de Maipú).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensamblarAnillo, kmDeLineas, nombrePartidoOsm, recortarRedProvincial } from './lib/capas-municipio.mjs'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const REINTENTOS = 3
const ESPERA_REINTENTO_MS = 20_000
const DECIMALES_COORDENADAS = 5
const RUTA_RED_PROVINCIAL_ORIGEN = new URL('../data/red-vial-provincial.geojson', import.meta.url)

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function redondear(numero) {
  return Number(numero.toFixed(DECIMALES_COORDENADAS))
}

async function consultarOverpass(query, etiqueta) {
  let ultimoError = null
  for (let intento = 1; intento <= REINTENTOS; intento += 1) {
    try {
      const respuesta = await fetch(OVERPASS_URL, {
        method: 'POST',
        // Apache delante de Overpass devuelve 406 a peticiones sin User-Agent/Accept
        // explícitos (el fetch de Node/undici no manda Accept por defecto).
        headers: { 'Content-Type': 'text/plain', 'User-Agent': 'caminos-rurales/1.0', Accept: '*/*' },
        body: query,
      })
      if (respuesta.ok) return respuesta.json()
      ultimoError = new Error(`HTTP ${respuesta.status}`)
    } catch (error) {
      ultimoError = error
    }

    console.error(`[generar-capas-municipio] ${etiqueta}: intento ${intento}/${REINTENTOS} falló (${ultimoError.message})`)
    if (intento < REINTENTOS) await esperar(ESPERA_REINTENTO_MS)
  }
  throw new Error(`Overpass no respondió tras los reintentos (${etiqueta}): ${ultimoError?.message ?? ''}`)
}

function queryLimite(nombrePartido) {
  return `[out:json][timeout:120];\nrelation["boundary"="administrative"]["name"="${nombrePartido}"];\nout geom;`
}

function relacionALimite(datosOverpass, slug, nombrePartido) {
  const relacion = (datosOverpass.elements ?? []).find((el) => el.type === 'relation')
  if (!relacion) throw new Error(`No se encontró la relación de límite para "${nombrePartido}"`)

  const waysExteriores = (relacion.members ?? [])
    .filter((m) => m.type === 'way' && m.role === 'outer' && Array.isArray(m.geometry))
    .map((m) => m.geometry.map((pt) => [redondear(pt.lon), redondear(pt.lat)]))

  const anillo = ensamblarAnillo(waysExteriores)

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: nombrePartido, osm_id: relacion.id, slug },
        geometry: { type: 'Polygon', coordinates: [anillo] },
      },
    ],
  }
}

/** Límite del partido: intenta Overpass, si falla usa el archivo existente en disco. */
async function obtenerLimite(slug, nombrePartido, destino) {
  try {
    const datos = await consultarOverpass(queryLimite(nombrePartido), 'límite')
    const coleccion = relacionALimite(datos, slug, nombrePartido)
    await writeFile(fileURLToPath(destino), JSON.stringify(coleccion))
    console.log(`[generar-capas-municipio] límite escrito en ${fileURLToPath(destino)}`)
    return coleccion
  } catch (error) {
    console.error('[generar-capas-municipio] no se pudo obtener el límite desde Overpass:', error.message)
    try {
      const existente = JSON.parse(await readFile(fileURLToPath(destino), 'utf8'))
      console.log(`[generar-capas-municipio] usando el límite existente en ${fileURLToPath(destino)} (sin regenerar)`)
      return existente
    } catch {
      throw new Error(`No se pudo obtener el límite de "${nombrePartido}" (Overpass falló y no hay archivo previo)`)
    }
  }
}

async function generarRedProvincial(limite, destino) {
  const anillo = limite.features[0]?.geometry?.coordinates?.[0]
  if (!anillo) throw new Error('El límite no tiene un anillo exterior válido')

  const origen = JSON.parse(await readFile(fileURLToPath(RUTA_RED_PROVINCIAL_ORIGEN), 'utf8'))
  const recortada = recortarRedProvincial(origen, anillo)
  await writeFile(fileURLToPath(destino), JSON.stringify(recortada))
  console.log(`[generar-capas-municipio] red provincial escrita en ${fileURLToPath(destino)}`)
  return recortada
}

function imprimirResumenRed(coleccion) {
  const porRuta = new Map()
  for (const feature of coleccion.features) {
    const clave = `RP ${feature.properties.ruta} · ${feature.properties.tipo} · ${feature.properties.superficie}`
    const km = kmDeLineas(feature.geometry.coordinates)
    porRuta.set(clave, (porRuta.get(clave) ?? 0) + km)
  }

  console.log(`[generar-capas-municipio] red provincial: ${coleccion.features.length} feature(s)`)
  for (const [clave, km] of [...porRuta.entries()].sort()) {
    console.log(`  ${clave}: ${km.toFixed(1)} km`)
  }
}

function aFeatureCollectionCaminos(datosOverpass) {
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

async function generarCaminosOsm(nombrePartido, destino) {
  const query = `
[out:json][timeout:120];
area["name"="${nombrePartido}"]["boundary"="administrative"]->.a;
( way["highway"~"^(secondary|tertiary|unclassified|track)$"](area.a); );
out geom;
`
  const datos = await consultarOverpass(query, 'caminos')
  const coleccion = aFeatureCollectionCaminos(datos)
  await writeFile(fileURLToPath(destino), JSON.stringify(coleccion))
  console.log(`[generar-capas-municipio] ${coleccion.features.length} tramo(s) de caminos escritos en ${fileURLToPath(destino)}`)
  return coleccion
}

export async function main(argv) {
  const [slug, ...flags] = argv
  if (!slug) {
    console.error('Uso: node scripts/generar-capas-municipio.mjs <slug> [--osm]')
    process.exitCode = 1
    return
  }

  const conOsm = flags.includes('--osm')
  const dirDestino = new URL(`../public/capas/${slug}/`, import.meta.url)
  await mkdir(fileURLToPath(dirDestino), { recursive: true })

  const nombrePartido = await nombrePartidoOsm(slug)

  const limite = await obtenerLimite(slug, nombrePartido, new URL('limite.geojson', dirDestino))
  const red = await generarRedProvincial(limite, new URL('red-provincial.geojson', dirDestino))
  imprimirResumenRed(red)

  if (conOsm) {
    await generarCaminosOsm(nombrePartido, new URL('caminos.geojson', dirDestino))
  }
}

const esEjecutadoDirectamente = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])

if (esEjecutadoDirectamente) {
  main(process.argv.slice(2)).catch((error) => {
    console.error('[generar-capas-municipio]', error)
    process.exit(1)
  })
}

// Lógica pura (sin red) para generar capas de un municipio: límite del
// partido, recorte de la red vial provincial y utilidades geométricas.
// Consumida por scripts/generar-capas-municipio.mjs y testeada en
// __tests__/capas-municipio.test.ts.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const RUTA_PARTIDOS_TS = new URL('../../lib/partidos.ts', import.meta.url)
const RADIO_TIERRA_KM = 6371
const EPSILON_CIERRE = 1e-7

const TIPOS_RED = { 40: 'ruta provincial', 47: 'autovía' }
const SUPERFICIES_RED = { 1: 'pavimentado', 2: 'consolidado', 3: 'tierra' }

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Nombre del partido tal como aparece en OSM ("Partido de <Nombre>") a
 * partir del slug, leyendo lib/partidos.ts como texto (los scripts son
 * .mjs planos y no pueden importar el módulo TypeScript directamente).
 */
export async function nombrePartidoOsm(slug, rutaPartidosTs = RUTA_PARTIDOS_TS) {
  const texto = await readFile(fileURLToPath(rutaPartidosTs), 'utf8')
  const regex = new RegExp(`slug: '${escaparRegex(slug)}', nombre: "([^"]+)"`)
  const coincidencia = texto.match(regex)
  if (!coincidencia) throw new Error(`No se encontró el partido "${slug}" en lib/partidos.ts`)
  return `Partido de ${coincidencia[1]}`
}

function puntosIguales(a, b) {
  return Math.abs(a[0] - b[0]) < EPSILON_CIERRE && Math.abs(a[1] - b[1]) < EPSILON_CIERRE
}

/**
 * Encadena tramos (ways) de un límite administrativo en un anillo cerrado,
 * probando ambas orientaciones de cada tramo. Lanza si no se puede cerrar.
 */
export function ensamblarAnillo(ways) {
  if (!Array.isArray(ways) || ways.length === 0) {
    throw new Error('No hay tramos para ensamblar el anillo')
  }

  const restantes = ways.map((tramo) => tramo.slice())
  const anillo = restantes.shift().slice()

  while (restantes.length > 0) {
    const extremo = anillo[anillo.length - 1]
    const indice = restantes.findIndex((tramo) => puntosIguales(extremo, tramo[0]) || puntosIguales(extremo, tramo[tramo.length - 1]))

    if (indice === -1) {
      throw new Error('No se pudo ensamblar el anillo: hay tramos desconectados')
    }

    const tramo = restantes[indice]
    if (puntosIguales(extremo, tramo[0])) {
      anillo.push(...tramo.slice(1))
    } else {
      anillo.push(...tramo.slice(0, -1).reverse())
    }
    restantes.splice(indice, 1)
  }

  if (!puntosIguales(anillo[0], anillo[anillo.length - 1])) {
    throw new Error('El anillo ensamblado no cierra (primer y último punto distintos)')
  }

  return anillo
}

/** Ray casting: `punto` es [lng, lat]; `anillo` es un array cerrado de [lng, lat]. */
export function puntoEnPoligono(punto, anillo) {
  const [lng, lat] = punto
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    const cruza = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (cruza) dentro = !dentro
  }
  return dentro
}

/**
 * Recorta las líneas de un feature MultiLineString a lo que cae dentro de
 * `anillo`, conservando un vértice vecino de borde a cada lado de cada
 * corrida para que el trazo llegue visualmente al límite. Descarta
 * corridas de menos de 2 vértices. Devuelve un array de líneas
 * (cada una un array de [lng, lat]).
 */
export function recortarLineas(feature, anillo) {
  const lineas = feature?.geometry?.coordinates ?? []
  const resultado = []

  for (const linea of lineas) {
    const dentro = linea.map((punto) => puntoEnPoligono(punto, anillo))
    let i = 0
    while (i < linea.length) {
      if (!dentro[i]) {
        i += 1
        continue
      }
      let fin = i
      while (fin + 1 < linea.length && dentro[fin + 1]) fin += 1

      const inicio = i > 0 ? i - 1 : i
      const final = fin + 1 < linea.length ? fin + 1 : fin
      const segmento = linea.slice(inicio, final + 1)
      if (segmento.length >= 2) resultado.push(segmento)

      i = fin + 1
    }
  }

  return resultado
}

/** Decodifica las propiedades crudas de un tramo de la red vial provincial (IGN/DVP). */
export function decodificarRed(props) {
  return {
    gid: props.gid,
    ruta: props.rtn,
    tipo: TIPOS_RED[props.typ] ?? String(props.typ),
    superficie: SUPERFICIES_RED[props.rst] ?? String(props.rst),
    fuente: props.fdc,
  }
}

function aRadianes(grados) {
  return (grados * Math.PI) / 180
}

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const dLat = aRadianes(lat2 - lat1)
  const dLng = aRadianes(lng2 - lng1)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aRadianes(lat1)) * Math.cos(aRadianes(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h))
}

/** Suma en kilómetros la longitud de un array de líneas (cada una un array de [lng, lat]). */
export function kmDeLineas(lineas) {
  let total = 0
  for (const linea of lineas) {
    for (let i = 1; i < linea.length; i += 1) {
      total += haversineKm(linea[i - 1], linea[i])
    }
  }
  return total
}

/**
 * Recorta la colección completa de la red vial provincial contra el
 * anillo del partido: un feature MultiLineString por tramo de entrada que
 * intersecte, con propiedades decodificadas.
 */
export function recortarRedProvincial(coleccion, anillo) {
  const features = []
  for (const feature of coleccion.features) {
    const segmentos = recortarLineas(feature, anillo)
    if (segmentos.length === 0) continue
    features.push({
      type: 'Feature',
      properties: decodificarRed(feature.properties),
      geometry: { type: 'MultiLineString', coordinates: segmentos },
    })
  }
  return { type: 'FeatureCollection', features }
}

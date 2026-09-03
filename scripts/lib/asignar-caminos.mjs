// Lógica pura (sin red ni filesystem) para asignar `nombre_codigo` a los
// tramos de caminos.geojson de un municipio: normalización de nombres OSM,
// exclusión de tramos urbanos y agrupación de tramos sin nombre por
// localidad rural más cercana. Consumida por scripts/seed-caminos-maipu.mjs
// y testeada en __tests__/seed-caminos.test.ts.
//
// Reutiliza puntoEnPoligono y kmDeLineas de ./capas-municipio.mjs en vez de
// duplicarlos (ese archivo lo lee en paralelo un revisor de otro commit;
// no se modifica acá).
import { kmDeLineas, puntoEnPoligono } from './capas-municipio.mjs'

// "Camino provincial secundario 066-0X" / "Camino Secundario 066-0X" → "066-0X"
// (también cubre "039-08").
const REGEX_CAMINO_SECUNDARIO = /^Camino (?:provincial secundario|Secundario) (\d{3}-\d{2})$/
// "Ruta Provincial 62" → "RP 62"
const REGEX_RUTA_PROVINCIAL = /^Ruta Provincial (\d+)$/

const HIGHWAYS_URBANOS = new Set(['tertiary', 'secondary'])

export const NOMBRES_POLIGONOS_URBANOS = [
  'Villa Italia',
  'Villa Vanelli',
  'Barrio Belgrano',
  'Barrio Centro',
  'Barrio Alvarado',
  'Barrio Unión',
]

// La fuente (severo_data) tiene el nombre con un typo ("Domigo"); la
// etiqueta de salida usa la grafía correcta.
export const ETIQUETAS_POLIGONOS_RURALES = {
  'Barrio Santo Domigo': 'Santo Domingo',
  'Barrio Segurola': 'Segurola',
  'Barrio Monsalvo': 'Monsalvo',
  'Las Armas': 'Las Armas',
}

// Centroide del partido de Maipú (cabecera), tomado de lib/partidos.ts
// (buscarPartido('maipu')): no hay polígono propio de "Maipú" en
// localidades.geojson, así que se usa el centroide oficial del partido
// como referencia de la cabecera para los tramos vecinales sin localidad
// rural cercana.
export const CENTROIDE_MAIPU_CABECERA = [-57.58612, -36.88693]
export const ETIQUETA_CABECERA = 'Maipú'

function distanciaKmEntre(a, b) {
  return kmDeLineas([[a, b]])
}

/** Normaliza un nombre OSM a su código de camino; null/nombres sin patrón conocido se devuelven tal cual. */
export function normalizarNombre(nombre) {
  if (!nombre) return null
  const ruta = nombre.match(REGEX_RUTA_PROVINCIAL)
  if (ruta) return `RP ${ruta[1]}`
  const secundario = nombre.match(REGEX_CAMINO_SECUNDARIO)
  if (secundario) return secundario[1]
  return nombre
}

function interpolar(a, b, fraccion) {
  return [a[0] + (b[0] - a[0]) * fraccion, a[1] + (b[1] - a[1]) * fraccion]
}

/**
 * Punto medio de una línea GeoJSON (`[lng, lat]`) por longitud recorrida:
 * interpola dentro del tramo donde se alcanza la mitad de la distancia total.
 */
export function puntoMedio(linea) {
  if (!Array.isArray(linea) || linea.length === 0) throw new Error('La línea no tiene puntos')
  if (linea.length === 1) return linea[0]

  const total = kmDeLineas([linea])
  if (total === 0) return linea[0]

  const objetivo = total / 2
  let acumulado = 0
  for (let i = 1; i < linea.length; i += 1) {
    const tramo = distanciaKmEntre(linea[i - 1], linea[i])
    if (acumulado + tramo >= objetivo) {
      const fraccion = tramo === 0 ? 0 : (objetivo - acumulado) / tramo
      return interpolar(linea[i - 1], linea[i], fraccion)
    }
    acumulado += tramo
  }
  return linea[linea.length - 1]
}

/** true si el punto cae dentro de alguno de los polígonos urbanos. */
export function esUrbano(punto, poligonosUrbanos) {
  return poligonosUrbanos.some(({ anillo }) => puntoEnPoligono(punto, anillo))
}

/**
 * true si el tramo es una calle urbana con nombre (highway secundario/
 * terciario, con nombre que no empieza con "Camino"/"Ruta" — los caminos
 * rurales con código siempre tienen uno de esos dos prefijos en OSM).
 * Complementa `esUrbano` para tramos cuyo punto medio cae justo fuera del
 * polígono relevado (linde del pueblo) pero que igual son calle de pueblo,
 * no camino rural: Rivadavia, Alsina, Hipólito Yrigoyen, Avenida Ayacucho,
 * Avenida La Plata, etc.
 */
export function esCalleUrbana(propiedades) {
  const nombre = propiedades?.name
  if (!nombre) return false
  if (!HIGHWAYS_URBANOS.has(propiedades.highway)) return false
  if (/^(Camino|Ruta)/.test(nombre)) return false
  return true
}

function promedio(numeros) {
  return numeros.reduce((suma, n) => suma + n, 0) / numeros.length
}

/** Centroide simple (promedio de vértices) de un anillo GeoJSON cerrado. */
export function centroideAnillo(anillo) {
  const puntos = anillo.slice(0, -1)
  return [promedio(puntos.map((p) => p[0])), promedio(puntos.map((p) => p[1]))]
}

/** Localidad (de `localidades`, cada una `{ label, centroide }`) más cercana al punto. */
export function localidadMasCercana(punto, localidades) {
  let mejor = null
  let mejorDistancia = Infinity
  for (const localidad of localidades) {
    const distancia = distanciaKmEntre(punto, localidad.centroide)
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia
      mejor = localidad
    }
  }
  return mejor
}

/**
 * Arma el contexto geográfico (polígonos urbanos y localidades rurales con
 * su centroide, incluida la cabecera) a partir de localidades.geojson.
 */
export function construirContexto(coleccionLocalidades) {
  const poligonos = (coleccionLocalidades.features ?? []).filter(
    (f) => f.geometry?.type === 'Polygon' && typeof f.properties?.name === 'string',
  )

  const poligonosUrbanos = poligonos
    .filter((f) => NOMBRES_POLIGONOS_URBANOS.includes(f.properties.name))
    .map((f) => ({ nombre: f.properties.name, anillo: f.geometry.coordinates[0] }))

  const localidadesRurales = poligonos
    .filter((f) => f.properties.name in ETIQUETAS_POLIGONOS_RURALES)
    .map((f) => ({
      label: ETIQUETAS_POLIGONOS_RURALES[f.properties.name],
      centroide: centroideAnillo(f.geometry.coordinates[0]),
    }))

  localidadesRurales.push({ label: ETIQUETA_CABECERA, centroide: CENTROIDE_MAIPU_CABECERA })

  return { poligonosUrbanos, localidadesRurales }
}

/**
 * `nombre_codigo` para un tramo, o `null` si debe excluirse (calle urbana).
 * Tramos sin nombre se agrupan como "Caminos vecinales - <localidad>".
 */
export function asignarNombreCodigo(feature, contexto) {
  const propiedades = feature.properties ?? {}
  const linea = feature.geometry?.coordinates ?? []
  const punto = puntoMedio(linea)

  if (esUrbano(punto, contexto.poligonosUrbanos)) return null
  if (esCalleUrbana(propiedades)) return null

  const normalizado = normalizarNombre(propiedades.name)
  if (normalizado) return normalizado

  const localidad = localidadMasCercana(punto, contexto.localidadesRurales)
  return `Caminos vecinales - ${localidad.label}`
}

/**
 * Procesa la colección completa: devuelve una copia con `nombre_codigo` en
 * cada feature (null para excluidos) y un resumen `{ tramos, km }` por
 * código (excluye los null).
 */
export function procesarColeccion(coleccion, contexto) {
  const features = coleccion.features.map((feature) => {
    const nombreCodigo = asignarNombreCodigo(feature, contexto)
    return { ...feature, properties: { ...feature.properties, nombre_codigo: nombreCodigo } }
  })

  const resumen = new Map()
  for (const feature of features) {
    const codigo = feature.properties.nombre_codigo
    if (!codigo) continue
    const km = kmDeLineas([feature.geometry.coordinates])
    const actual = resumen.get(codigo) ?? { tramos: 0, km: 0 }
    resumen.set(codigo, { tramos: actual.tramos + 1, km: actual.km + km })
  }

  return { coleccion: { ...coleccion, features }, resumen }
}

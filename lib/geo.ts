export type Coordenada = { lat: number; lng: number }

/** Punto en formato GeoJSON: `[lng, lat]`. */
export type PuntoGeoJSON = [number, number]

const RADIO_TIERRA_KM = 6371

function aRadianes(grados: number): number {
  return (grados * Math.PI) / 180
}

/** Distancia haversine en kilómetros. */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const dLat = aRadianes(b.lat - a.lat)
  const dLng = aRadianes(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h))
}

/**
 * Punto uniforme dentro de un círculo de `radioKm` alrededor de `centro`.
 * `aleatorio` devuelve [0, 1). Inyectable para tests.
 */
export function puntoAleatorioEnRadio(
  centro: Coordenada,
  radioKm: number,
  aleatorio: () => number = Math.random,
): Coordenada {
  const distancia = radioKm * Math.sqrt(aleatorio())
  const angulo = 2 * Math.PI * aleatorio()
  const dLat = (distancia / RADIO_TIERRA_KM) * (180 / Math.PI)
  const dLng = dLat / Math.cos(aRadianes(centro.lat))
  return {
    lat: Number((centro.lat + dLat * Math.cos(angulo)).toFixed(6)),
    lng: Number((centro.lng + dLng * Math.sin(angulo)).toFixed(6)),
  }
}

/**
 * Ray casting: `p` es la coordenada a probar; `anillo` es un polígono
 * cerrado en formato GeoJSON (`[lng, lat]` por vértice, primer y último
 * punto iguales).
 */
export function puntoEnPoligono(p: Coordenada, anillo: PuntoGeoJSON[]): boolean {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    const cruza = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi
    if (cruza) dentro = !dentro
  }
  return dentro
}

function interpolar(a: PuntoGeoJSON, b: PuntoGeoJSON, fraccion: number): Coordenada {
  return { lng: a[0] + (b[0] - a[0]) * fraccion, lat: a[1] + (b[1] - a[1]) * fraccion }
}

/**
 * Punto medio de una polilínea por longitud recorrida (no por índice de
 * vértice): interpola dentro del tramo donde se alcanza la mitad de la
 * distancia total.
 */
export function puntoMedio(linea: PuntoGeoJSON[]): Coordenada {
  if (linea.length === 0) throw new Error('La línea no tiene puntos')
  if (linea.length === 1) return { lng: linea[0][0], lat: linea[0][1] }

  const distanciaTramo = (a: PuntoGeoJSON, b: PuntoGeoJSON): number =>
    distanciaKm({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] })

  const total = linea.slice(1).reduce((acumulado, punto, i) => acumulado + distanciaTramo(linea[i], punto), 0)
  if (total === 0) return { lng: linea[0][0], lat: linea[0][1] }

  const objetivo = total / 2
  let acumulado = 0
  for (let i = 1; i < linea.length; i += 1) {
    const tramo = distanciaTramo(linea[i - 1], linea[i])
    if (acumulado + tramo >= objetivo) {
      const fraccion = tramo === 0 ? 0 : (objetivo - acumulado) / tramo
      return interpolar(linea[i - 1], linea[i], fraccion)
    }
    acumulado += tramo
  }
  return { lng: linea[linea.length - 1][0], lat: linea[linea.length - 1][1] }
}

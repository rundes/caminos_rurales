import type { Coordenada } from './geo'
import { distanciaKm } from './geo'

export type TramoGeometria = { id: string; km: number; geometria: [number, number][] }

type OpcionesCobertura = { radioM: number; umbral: number; pasoM: number }

const OPCIONES_COBERTURA_DEFECTO: OpcionesCobertura = { radioM: 40, umbral: 0.6, pasoM: 50 }

function puntoADistancia(pts: readonly Coordenada[], cum: readonly number[], objetivoM: number): Coordenada {
  for (let i = 1; i < cum.length; i += 1) {
    if (cum[i] >= objetivoM - 1e-6) {
      const largoSegmento = cum[i] - cum[i - 1]
      const fraccion = largoSegmento === 0 ? 0 : (objetivoM - cum[i - 1]) / largoSegmento
      return {
        lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * fraccion,
        lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * fraccion,
      }
    }
  }
  return pts[pts.length - 1]
}

/** Muestrea puntos cada `pasoM` metros a lo largo de una línea, incluyendo inicio y fin. */
export function muestrearLinea(coords: readonly [number, number][], pasoM = 50): Coordenada[] {
  if (coords.length === 0) return []
  const pts: Coordenada[] = coords.map(([lng, lat]) => ({ lat, lng }))
  if (pts.length === 1) return [pts[0]]

  const cum: number[] = [0]
  for (let i = 1; i < pts.length; i += 1) {
    cum.push(cum[i - 1] + distanciaKm(pts[i - 1], pts[i]) * 1000)
  }
  const total = cum[cum.length - 1]
  if (total === 0) return [pts[0]]

  const resultado: Coordenada[] = []
  const pasos = Math.floor(total / pasoM)
  for (let i = 0; i <= pasos; i += 1) {
    resultado.push(puntoADistancia(pts, cum, i * pasoM))
  }
  if (pasos * pasoM < total - 1e-6) {
    resultado.push(pts[pts.length - 1])
  }
  return resultado
}

/**
 * Índice espacial simple (grilla de celdas de `celdaGrados` grados) para
 * responder rápido si hay un punto de `puntos` cerca de una coordenada dada.
 */
export function crearIndice(
  puntos: readonly Coordenada[],
  celdaGrados = 0.001,
): { hayCercano(p: Coordenada, radioM: number): boolean } {
  const grilla = new Map<string, Coordenada[]>()
  const claveCelda = (lat: number, lng: number): string =>
    `${Math.floor(lat / celdaGrados)}:${Math.floor(lng / celdaGrados)}`

  for (const p of puntos) {
    const clave = claveCelda(p.lat, p.lng)
    const celda = grilla.get(clave)
    if (celda) celda.push(p)
    else grilla.set(clave, [p])
  }

  return {
    hayCercano(p: Coordenada, radioM: number): boolean {
      const celdaLat = Math.floor(p.lat / celdaGrados)
      const celdaLng = Math.floor(p.lng / celdaGrados)
      for (let dLat = -1; dLat <= 1; dLat += 1) {
        for (let dLng = -1; dLng <= 1; dLng += 1) {
          const candidatos = grilla.get(`${celdaLat + dLat}:${celdaLng + dLng}`)
          if (!candidatos) continue
          for (const c of candidatos) {
            if (distanciaKm(p, c) * 1000 <= radioM) return true
          }
        }
      }
      return false
    },
  }
}

/**
 * Calcula qué tramos quedaron cubiertos por un track: un tramo se considera
 * cubierto si al menos `umbral` de sus muestras (cada `pasoM` metros) tienen
 * un punto del track a menos de `radioM` metros.
 */
export function calcularCobertura(
  track: readonly Coordenada[],
  tramos: readonly TramoGeometria[],
  opciones: OpcionesCobertura = OPCIONES_COBERTURA_DEFECTO,
): { cubiertos: string[]; fraccionPorTramo: Record<string, number> } {
  const cubiertos: string[] = []
  const fraccionPorTramo: Record<string, number> = {}

  if (track.length === 0) {
    for (const tramo of tramos) fraccionPorTramo[tramo.id] = 0
    return { cubiertos, fraccionPorTramo }
  }

  const indice = crearIndice(track)
  for (const tramo of tramos) {
    const muestras = muestrearLinea(tramo.geometria, opciones.pasoM)
    if (muestras.length === 0) {
      fraccionPorTramo[tramo.id] = 0
      continue
    }
    const cercanas = muestras.filter((m) => indice.hayCercano(m, opciones.radioM)).length
    const fraccion = cercanas / muestras.length
    fraccionPorTramo[tramo.id] = fraccion
    if (fraccion >= opciones.umbral) cubiertos.push(tramo.id)
  }

  return { cubiertos, fraccionPorTramo }
}

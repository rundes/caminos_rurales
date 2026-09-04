import { muestrearLinea, type TramoGeometria } from '../cobertura'
import { distanciaKm, type Coordenada } from '../geo'
import { PASO_MUESTREO_TRAMO_M, RADIO_TRAMO_M } from './umbrales'

export type AsignadorTramos = {
  /** Id del tramo más cercano dentro del radio, o null si no hay ninguno. */
  tramoDe(p: Coordenada): string | null
}

/** Lado de la celda de la grilla, en grados (~111 m sobre el ecuador). */
const CELDA_GRADOS = 0.001

/** Metros que mide aproximadamente un grado de latitud. */
const METROS_POR_GRADO = 111_320

type PuntoTramo = Coordenada & { tramoId: string }

function clave(lat: number, lng: number): string {
  return `${Math.floor(lat / CELDA_GRADOS)}:${Math.floor(lng / CELDA_GRADOS)}`
}

/**
 * Índice de puntos muestreados sobre la geometría de los tramos para asignar
 * una coordenada al tramo más cercano. Es la contracara de `crearIndice` de
 * cobertura: allá el índice es del track y se pregunta por tramo; acá el índice
 * es de los tramos y se pregunta por punto.
 */
export function crearAsignadorTramos(
  tramos: readonly TramoGeometria[],
  radioM: number = RADIO_TRAMO_M,
): AsignadorTramos {
  const grilla = new Map<string, PuntoTramo[]>()

  for (const tramo of tramos) {
    for (const p of muestrearLinea(tramo.geometria, PASO_MUESTREO_TRAMO_M)) {
      const k = clave(p.lat, p.lng)
      const celda = grilla.get(k)
      const punto: PuntoTramo = { ...p, tramoId: tramo.id }
      if (celda) celda.push(punto)
      else grilla.set(k, [punto])
    }
  }

  // Cuántos anillos de celdas hay que mirar para cubrir el radio pedido.
  const anillos = Math.max(1, Math.ceil(radioM / (CELDA_GRADOS * METROS_POR_GRADO)))

  return {
    tramoDe(p: Coordenada): string | null {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null
      const celdaLat = Math.floor(p.lat / CELDA_GRADOS)
      const celdaLng = Math.floor(p.lng / CELDA_GRADOS)
      let mejorId: string | null = null
      let mejorM = Infinity

      for (let dLat = -anillos; dLat <= anillos; dLat += 1) {
        for (let dLng = -anillos; dLng <= anillos; dLng += 1) {
          const candidatos = grilla.get(`${celdaLat + dLat}:${celdaLng + dLng}`)
          if (!candidatos) continue
          for (const c of candidatos) {
            const metros = distanciaKm(p, c) * 1000
            if (metros <= radioM && metros < mejorM) {
              mejorM = metros
              mejorId = c.tramoId
            }
          }
        }
      }

      return mejorId
    },
  }
}

import { puntoAleatorioEnRadio, type Coordenada } from './geo'
import type { Severidad, TipoFalla } from './tipos'

const TIPOS: readonly TipoFalla[] = ['bache', 'carcava', 'acumulacion_agua', 'falta_alcantarilla', 'maleza_alta']
const SEVERIDADES: readonly Severidad[] = ['baja', 'media', 'alta']
const MIN_FALLAS = 2
const MAX_FALLAS = 6
const RADIO_KM = 15

export type FallaSimulada = {
  tipo_falla: TipoFalla
  severidad: Severidad
  latitud: number
  longitud: number
}

function elegir<T>(lista: readonly T[], aleatorio: () => number): T {
  const indice = Math.min(lista.length - 1, Math.floor(aleatorio() * lista.length))
  return lista[indice]
}

export function generarFallasSimuladas(centro: Coordenada, aleatorio: () => number = Math.random): FallaSimulada[] {
  const cantidad = MIN_FALLAS + Math.floor(aleatorio() * (MAX_FALLAS - MIN_FALLAS + 1))
  const fallas: FallaSimulada[] = []
  for (let i = 0; i < cantidad; i++) {
    const punto = puntoAleatorioEnRadio(centro, RADIO_KM, aleatorio)
    fallas.push({
      tipo_falla: elegir(TIPOS, aleatorio),
      severidad: elegir(SEVERIDADES, aleatorio),
      latitud: punto.lat,
      longitud: punto.lng,
    })
  }
  return fallas
}

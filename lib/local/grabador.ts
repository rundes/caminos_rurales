import { distanciaKm } from '@/lib/geo'
import { filtrarPunto, type PuntoGps } from '@/lib/track'

export type EstadoGrabacion = 'inactivo' | 'grabando' | 'pausado' | 'finalizado'

/** Estado inmutable del grabador de recorridos. Todas las transiciones son puras. */
export type Grabador = {
  estado: EstadoGrabacion
  recorridoId: string | null
  inicio: number | null
  fin: number | null
  ultimo: PuntoGps | null
  km: number
  puntosGps: PuntoGps[]
}

export const GRABADOR_INICIAL: Grabador = {
  estado: 'inactivo',
  recorridoId: null,
  inicio: null,
  fin: null,
  ultimo: null,
  km: 0,
  puntosGps: [],
}

/** Arranca un recorrido nuevo. `ahora` en milisegundos epoch. */
export function iniciar(recorridoId: string, ahora: number): Grabador {
  return { ...GRABADOR_INICIAL, estado: 'grabando', recorridoId, inicio: ahora, puntosGps: [] }
}

/**
 * Retoma un recorrido guardado en el dispositivo, reconstruyendo km y último
 * punto a partir de los puntos ya persistidos.
 */
export function retomar(recorridoId: string, inicio: number, puntos: readonly PuntoGps[]): Grabador {
  let km = 0
  for (let i = 1; i < puntos.length; i += 1) km += distanciaKm(puntos[i - 1], puntos[i])
  return {
    estado: 'grabando',
    recorridoId,
    inicio,
    fin: null,
    ultimo: puntos.length > 0 ? puntos[puntos.length - 1] : null,
    km,
    puntosGps: [...puntos],
  }
}

/**
 * Incorpora un punto GPS si el grabador está grabando y el punto pasa el
 * filtro de precisión y distancia mínima. Si se descarta devuelve el mismo
 * objeto de estado, así quien llama puede detectarlo por identidad.
 */
export function agregarPunto(grabador: Grabador, punto: PuntoGps): Grabador {
  if (grabador.estado !== 'grabando') return grabador
  if (!filtrarPunto(grabador.ultimo, punto)) return grabador

  const km = grabador.ultimo ? grabador.km + distanciaKm(grabador.ultimo, punto) : grabador.km
  return { ...grabador, ultimo: punto, km, puntosGps: [...grabador.puntosGps, punto] }
}

export function pausar(grabador: Grabador): Grabador {
  if (grabador.estado !== 'grabando') return grabador
  return { ...grabador, estado: 'pausado' }
}

export function reanudar(grabador: Grabador): Grabador {
  if (grabador.estado !== 'pausado') return grabador
  return { ...grabador, estado: 'grabando' }
}

export function finalizar(grabador: Grabador, ahora: number): Grabador {
  if (grabador.estado !== 'grabando' && grabador.estado !== 'pausado') return grabador
  return { ...grabador, estado: 'finalizado', fin: ahora }
}

/** Milisegundos transcurridos desde el inicio (o hasta el fin si ya terminó). */
export function duracionMs(grabador: Grabador, ahora: number): number {
  if (grabador.inicio === null) return 0
  return Math.max(0, (grabador.fin ?? ahora) - grabador.inicio)
}

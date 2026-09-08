import { distanciaKm } from '@/lib/geo'
import { filtrarPunto, type PuntoGps } from '@/lib/track'

export type EstadoGrabacion = 'inactivo' | 'grabando' | 'pausado' | 'finalizado'

/**
 * Estado inmutable del grabador de recorridos. Todas las transiciones son
 * puras. No guarda el track: los puntos viven en un `ref` del hook (y en
 * IndexedDB), acá solo queda el agregado que la UI necesita pintar.
 */
export type Grabador = {
  estado: EstadoGrabacion
  recorridoId: string | null
  inicio: number | null
  fin: number | null
  ultimo: PuntoGps | null
  km: number
  cantidad: number
  /**
   * Índices (sobre el array de puntos aceptados, 0-based) donde arranca un
   * segmento nuevo del track porque hubo una pausa de por medio. El mapa usa
   * esto para no dibujar una línea recta entre el punto de antes de pausar y
   * el de después de reanudar: puede haber metros o cuadras de diferencia y
   * unirlos con una recta mostraría un camino que nunca se recorrió.
   */
  cortes: readonly number[]
}

export const GRABADOR_INICIAL: Grabador = {
  estado: 'inactivo',
  recorridoId: null,
  inicio: null,
  fin: null,
  ultimo: null,
  km: 0,
  cantidad: 0,
  cortes: [],
}

/**
 * Umbral de "sin señal" para tratar un hueco como una interrupción real de
 * la grabación (app en 2° plano, pantalla bloqueada, o zona sin GPS) y no
 * como una demora normal de una lectura. `useGrabadorGps.OPCIONES_GPS.timeout`
 * ya le da 20 s a cada lectura antes de que `watchPosition` reporte un error
 * de timeout (y siga reintentando); 30 s deja un margen de 10 s por encima de
 * eso para no marcar como interrupción una única lectura lenta pero real, y
 * es corto en relación a la duración típica de un recorrido para no dejar
 * pasar huecos grandes sin cortar.
 */
export const UMBRAL_INTERRUPCION_MS = 30_000

/** Arranca un recorrido nuevo. `ahora` en milisegundos epoch. */
export function iniciar(recorridoId: string, ahora: number): Grabador {
  return { ...GRABADOR_INICIAL, estado: 'grabando', recorridoId, inicio: ahora }
}

/**
 * Retoma un recorrido guardado en el dispositivo, reconstruyendo km y último
 * punto a partir de los puntos ya persistidos.
 *
 * Si pasó más que `UMBRAL_INTERRUPCION_MS` entre el último punto guardado y
 * `ahora`, la app estuvo en 2° plano o cerrada el tiempo suficiente como para
 * que la interrupción sea real (no hay watchdog en memoria corriendo mientras
 * la app está cerrada): se agrega un corte justo después del último punto
 * guardado, así el tramo no recorrido no se dibuja como una recta ni cuenta
 * como cubierto. Si el hueco es corto, se sigue tratando como un solo
 * segmento continuo.
 */
export function retomar(
  recorridoId: string,
  inicio: number,
  puntos: readonly PuntoGps[],
  ahora: number = Date.now(),
): Grabador {
  let km = 0
  for (let i = 1; i < puntos.length; i += 1) km += distanciaKm(puntos[i - 1], puntos[i])
  const ultimo = puntos.length > 0 ? puntos[puntos.length - 1] : null
  const huboInterrupcion = ultimo !== null && ahora - ultimo.t > UMBRAL_INTERRUPCION_MS
  return {
    estado: 'grabando',
    recorridoId,
    inicio,
    fin: null,
    ultimo,
    km,
    cantidad: puntos.length,
    cortes: huboInterrupcion ? [puntos.length] : [],
  }
}

/**
 * Incorpora un punto GPS si el grabador está grabando y el punto pasa el
 * filtro de precisión y distancia mínima. Si se descarta devuelve el mismo
 * objeto de estado, así quien llama puede detectarlo por identidad. En pausa
 * nunca acepta puntos.
 */
export function agregarPunto(grabador: Grabador, punto: PuntoGps): Grabador {
  if (grabador.estado !== 'grabando') return grabador
  if (!filtrarPunto(grabador.ultimo, punto)) return grabador

  const km = grabador.ultimo ? grabador.km + distanciaKm(grabador.ultimo, punto) : grabador.km
  return { ...grabador, ultimo: punto, km, cantidad: grabador.cantidad + 1 }
}

export function pausar(grabador: Grabador): Grabador {
  if (grabador.estado !== 'grabando') return grabador
  return { ...grabador, estado: 'pausado' }
}

export function reanudar(grabador: Grabador): Grabador {
  if (grabador.estado !== 'pausado') return grabador
  // El corte se registra en `cantidad`: es el índice del próximo punto que se
  // acepte, así que separa exactamente lo grabado antes de pausar de lo que
  // venga después. Si no se aceptó ningún punto todavía no hay nada que cortar.
  const cortes = grabador.cantidad > 0 ? [...grabador.cortes, grabador.cantidad] : grabador.cortes
  return { ...grabador, estado: 'grabando', cortes }
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

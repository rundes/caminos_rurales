import { distanciaKm } from '@/lib/geo'
import { derivarCortes, filtrarPunto, kmDeTrack, UMBRAL_INTERRUPCION_MS, type PuntoGps } from '@/lib/track'

export { UMBRAL_INTERRUPCION_MS }

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
   * unirlos con una recta mostraría un camino que nunca se recorrió. Se corta
   * en cada pausado manual sin importar cuánto haya durado (ver `reanudar`),
   * a diferencia de los kilómetros: esos se calculan aparte, derivando los
   * cortes de los timestamps de los puntos (`lib/track.ts#derivarCortes`),
   * igual que hace el servidor — así hay una sola definición de "corte" para
   * kilómetros, cliente y servidor, y no depende de este campo (pensado para
   * el dibujo del mapa, no para puntuar).
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
  // Mismo cálculo que al cerrar el recorrido (`cerrarRecorrido`) y en el
  // servidor: no bridgea los huecos de tiempo que hubo dentro de lo ya
  // grabado (pausas o interrupciones previas a este relanzamiento).
  const km = kmDeTrack(puntos, derivarCortes(puntos))
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

  // Mismo umbral que `derivarCortes`/`cerrarRecorrido`/el servidor: si pasó
  // más de `UMBRAL_INTERRUPCION_MS` desde el último punto aceptado (una
  // pausa manual larga, o una interrupción que el watchdog todavía no
  // reconoció), el contador en vivo tampoco bridgea ese hueco con una recta.
  // `ultimo` se actualiza igual, para que el mapa siga mostrando la posición real.
  const huboCorte = grabador.ultimo !== null && punto.t - grabador.ultimo.t > UMBRAL_INTERRUPCION_MS
  const km = grabador.ultimo && !huboCorte ? grabador.km + distanciaKm(grabador.ultimo, punto) : grabador.km
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

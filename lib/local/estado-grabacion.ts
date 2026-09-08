/**
 * Store mínimo (fuera de React) con el estado actual de la grabación, para
 * que `NavDashboard` sepa si hay un recorrido en curso sin tener que levantar
 * `useGrabadorGps` hasta el layout: los dos viven en ramas distintas del
 * árbol (la nav en el layout, el grabador en la página de inicio), así que un
 * módulo compartido es más simple que subir el estado.
 */

export type EstadoGrabacionGlobal = 'inactivo' | 'grabando' | 'pausado'

let estadoActual: EstadoGrabacionGlobal = 'inactivo'
const oyentes = new Set<() => void>()

/** Lo llama `useGrabadorGps` cada vez que cambia el estado del grabador. */
export function fijarEstadoGrabacion(siguiente: EstadoGrabacionGlobal): void {
  if (siguiente === estadoActual) return
  estadoActual = siguiente
  oyentes.forEach((oyente) => oyente())
}

export function obtenerEstadoGrabacion(): EstadoGrabacionGlobal {
  return estadoActual
}

/** Snapshot del server para `useSyncExternalStore`: en el servidor nunca hay grabación. */
export function obtenerEstadoGrabacionServidor(): EstadoGrabacionGlobal {
  return 'inactivo'
}

export function suscribirEstadoGrabacion(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

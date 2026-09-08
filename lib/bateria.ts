/**
 * Lógica pura del aviso de batería (`components/recorrido/AvisoBateria.tsx`).
 * Grabar GPS, cámara y mantener la pantalla prendida gasta batería rápido:
 * el aviso se ve antes de arrancar un recorrido para que la persona pueda
 * buscar un cargador de auto a tiempo.
 */

export type NivelBateria = {
  /** 0 a 1, como lo informa la Battery Status API. */
  nivel: number
  cargando: boolean
}

/** Debajo de este nivel el aviso se pone más serio: puede no alcanzar para todo el recorrido. */
const UMBRAL_BAJO = 0.2

/** Nivel bajo de batería, ignorando el umbral mientras está cargando: enchufado, no hay apuro. */
export function esNivelBajo(estado: NivelBateria): boolean {
  return Number.isFinite(estado.nivel) && estado.nivel < UMBRAL_BAJO && !estado.cargando
}

/**
 * Mensaje del aviso. Sin `estado` (dispositivo sin Battery Status API, como
 * iOS) el mensaje es genérico: no hay nivel que mostrar, pero la advertencia
 * sigue siendo válida.
 */
export function mensajeBateria(estado: NivelBateria | null): string {
  const sugerencia = 'Usá un cargador de auto si podés.'
  if (!estado) {
    return `GPS, cámara y pantalla prendida gastan batería rápido. ${sugerencia}`
  }
  const porcentaje = Math.round(estado.nivel * 100)
  if (esNivelBajo(estado)) {
    return `Batería al ${porcentaje}%: puede no alcanzar para todo el recorrido. ${sugerencia}`
  }
  return `Batería al ${porcentaje}%. GPS, cámara y pantalla prendida la gastan rápido. ${sugerencia}`
}

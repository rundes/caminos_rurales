import type { CalidadSegmento } from './tipos'

const COLORES: Record<CalidadSegmento, string> = {
  bueno: '#16a34a',
  regular: '#eab308',
  malo: '#f97316',
  intransitable: '#dc2626',
  sin_dato: '#9ca3af',
}

/** Color del estado estimado de un tramo/segmento, para el toggle "Estado estimado" del mapa. */
export function colorCalidad(calidad: CalidadSegmento): string {
  return COLORES[calidad]
}

export const ETIQUETA_CALIDAD: Record<CalidadSegmento, string> = {
  bueno: 'Bueno',
  regular: 'Regular',
  malo: 'Malo',
  intransitable: 'Intransitable',
  sin_dato: 'Sin datos',
}

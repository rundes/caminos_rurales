import type { Severidad } from './tipos'

export type EstadoCamino = 'bueno' | 'regular' | 'malo' | 'intransitable'

const ALTAS_PARA_INTRANSITABLE = 3

export function estadoDesdeSeveridades(severidades: readonly Severidad[]): EstadoCamino {
  const altas = severidades.filter((s) => s === 'alta').length
  if (altas >= ALTAS_PARA_INTRANSITABLE) return 'intransitable'
  if (altas > 0) return 'malo'
  if (severidades.includes('media')) return 'regular'
  return 'bueno'
}

const COLORES: Record<Severidad, string> = {
  alta: '#dc2626',
  media: '#eab308',
  baja: '#16a34a',
}

export function colorSeveridad(severidad: Severidad): string {
  return COLORES[severidad]
}

export const ETIQUETA_ESTADO: Record<EstadoCamino, string> = {
  bueno: 'Bueno',
  regular: 'Regular',
  malo: 'Malo',
  intransitable: 'Intransitable',
}

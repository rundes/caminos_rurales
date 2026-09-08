import type { RugosidadTramo } from './sensores/tipos'
import type { TramoResumen } from './tramos-consultas'

export type TramoListado = TramoResumen & { calidad: RugosidadTramo['calidad'] }

export type OrdenTramos = 'km' | 'visita'

/** Cruza el resumen por tramo con la rugosidad estimada (calidad "sin_dato" si no hay muestras todavía). */
export function combinarTramos(
  resumen: readonly TramoResumen[],
  rugosidad: Record<string, RugosidadTramo>,
): TramoListado[] {
  return resumen.map((t) => ({ ...t, calidad: rugosidad[t.id]?.calidad ?? 'sin_dato' }))
}

/** Filtra por nombre/código, sin distinguir mayúsculas/acentos de más ni de menos. */
export function buscarTramos(tramos: readonly TramoListado[], q: string | undefined): TramoListado[] {
  const buscado = q?.trim().toLowerCase()
  if (!buscado) return [...tramos]
  return tramos.filter((t) => t.nombre_codigo.toLowerCase().includes(buscado))
}

/** Orden por km descendente, por última visita más reciente primero, o alfabético por defecto. */
export function ordenarTramos(tramos: readonly TramoListado[], orden: string | undefined): TramoListado[] {
  const copia = [...tramos]
  if (orden === 'km') return copia.sort((a, b) => b.km - a.km)
  if (orden === 'visita') return copia.sort((a, b) => (b.ultimaVisita ?? '').localeCompare(a.ultimaVisita ?? ''))
  return copia.sort((a, b) => a.nombre_codigo.localeCompare(b.nombre_codigo))
}

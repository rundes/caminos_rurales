import type { RugosidadTramo } from './sensores/tipos'
import { kmDeTrack } from './track'
import type { TramoResumen } from './tramos-consultas'

export type TramoListado = TramoResumen & { calidad: RugosidadTramo['calidad'] }

export type OrdenTramos = 'km' | 'visita'

/**
 * Km de una geometría `[lng, lat][]` (formato de `tramos.geometria`), con el
 * mismo haversine que el resto de la app (`kmDeTrack`, `lib/track.ts`) en vez
 * de un tercero — usado tanto en vivo mientras se dibuja el tramo (cliente)
 * como para calcular el `km` real al guardar (servidor, `actions.ts`): el
 * cliente nunca manda un `km`, siempre se deriva acá de los puntos dibujados.
 */
export function kmDeGeometria(geometria: readonly [number, number][]): number {
  const puntos = geometria.map(([lng, lat]) => ({ lat, lng }))
  return Number(kmDeTrack(puntos).toFixed(3))
}

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

import type { Json } from './supabase/database.types'

type FilaConMetadata = { metadata: Json | null }

export function sumarKm(filas: readonly FilaConMetadata[]): number {
  let total = 0
  for (const fila of filas) {
    const meta = fila.metadata
    if (meta && typeof meta === 'object' && !Array.isArray(meta) && 'km' in meta) {
      const km = Number(meta.km)
      if (Number.isFinite(km)) total += km
    }
  }
  return Number(total.toFixed(1))
}

export function formatearNumero(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n)
}

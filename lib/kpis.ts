import type { Json } from './supabase/database.types'

type FilaConMetadata = { metadata: Json | null }

function extraerKm(meta: Json | null): number {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || !('km' in meta)) return 0
  const valor = meta.km
  if (typeof valor !== 'number' && typeof valor !== 'string') return 0
  const km = Number(valor)
  return Number.isFinite(km) && km >= 0 ? km : 0
}

export function sumarKm(filas: readonly FilaConMetadata[]): number {
  const total = filas.reduce((acumulado, fila) => acumulado + extraerKm(fila.metadata), 0)
  return Number(total.toFixed(1))
}

export function formatearNumero(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n)
}

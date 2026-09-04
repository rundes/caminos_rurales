type FilaConKm = { km: number | string | null }

function aKm(valor: number | string | null): number {
  if (valor === null) return 0
  const km = Number(valor)
  return Number.isFinite(km) && km >= 0 ? km : 0
}

/** Suma los km de un conjunto de recorridos (Postgres devuelve `numeric` como string). */
export function sumarKm(filas: readonly FilaConKm[]): number {
  const total = filas.reduce((acumulado, fila) => acumulado + aKm(fila.km), 0)
  return Number(total.toFixed(1))
}

export function formatearNumero(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n)
}

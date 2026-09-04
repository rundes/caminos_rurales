import type { FilaRanking } from './cobertura-consultas'

export type ResultadoRanking = {
  top: FilaRanking[]
  propia: FilaRanking | null
  mostrarPropiaAparte: boolean
}

/**
 * Separa el top del ranking de la fila del usuario actual: si el usuario no
 * está en el top se devuelve aparte en `propia` con `mostrarPropiaAparte`.
 * Si el usuario todavía no tiene puntos (sin fila propia), `propia` es null.
 */
export function seleccionarRanking(filas: readonly FilaRanking[], userId: string, top = 10): ResultadoRanking {
  const topFilas = filas.slice(0, top)
  const propia = filas.find((f) => f.usuario_id === userId) ?? null
  const mostrarPropiaAparte = Boolean(propia && propia.posicion > top)

  return { top: topFilas, propia, mostrarPropiaAparte }
}

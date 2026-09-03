import type { ResultadoRecorrido } from '@/app/dashboard/recorrido/actions'
import type { DestinoSubida } from '@/lib/almacenamiento/tipos'
import type { ResultadoAccion } from '@/lib/tipos'
import type { BaseLocal } from './tipos'

/** Espera entre reintentos, en milisegundos. El último valor se repite. */
export const BACKOFF_MS = [5_000, 30_000, 120_000] as const
export const MAX_INTENTOS = 20

/**
 * Todo lo que la sincronización necesita del mundo exterior. Se inyecta para
 * que los tests puedan correr sin IndexedDB, sin red y sin server actions.
 */
export type DepsSincronizacion = {
  db: BaseLocal
  prepararSubida: (
    recorridoId: string,
    nombre: string,
    contentType: string,
    observacionId?: string,
  ) => Promise<ResultadoAccion<DestinoSubida>>
  finalizarRecorrido: (payload: unknown) => Promise<ResultadoRecorrido>
  subir: (destino: DestinoSubida, archivo: Blob) => Promise<void>
  comprimir: (archivo: File) => Promise<File>
  ahora: () => number
}

export type ResultadoSincronizacion = ResultadoRecorrido

/** Espera del intento número `intentos` (1 = primer fallo). */
export function esperaBackoff(intentos: number): number {
  const indice = Math.min(Math.max(intentos, 1), BACKOFF_MS.length) - 1
  return BACKOFF_MS[indice]
}

/**
 * Un fallo definitivo no se reintenta nunca: el payload es inválido, el
 * recorrido es de otra persona o el track no es plausible. Reintentar daría
 * siempre lo mismo y llenaría la cola de basura.
 */
export function esDefinitivo(resultado: ResultadoRecorrido): boolean {
  return !resultado.ok && 'definitivo' in resultado && resultado.definitivo === true
}

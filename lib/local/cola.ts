import type { ResumenRecorrido } from '@/app/dashboard/recorrido/actions'
import { MAX_INTENTOS, type DepsSincronizacion } from './deps'
import { sincronizarRecorrido } from './sincronizacion'
import type { ItemCola, RecorridoLocal } from './tipos'

export type ResultadoCola = {
  procesados: number
  /** Items que todavía se van a reintentar: los que agotaron intentos no cuentan. */
  pendientes: number
  /** Resumen del servidor por recorrido subido en esta pasada. */
  resumenes: Record<string, ResumenRecorrido>
}

/**
 * Items de la cola que ya cumplieron su espera y todavía tienen intentos.
 * `propios` son los ids de recorrido del usuario en sesión: lo que no está ahí
 * (incluida la base v1, sin `usuarioId`) se considera ajeno y no se procesa.
 */
export function itemsVencidos<T extends ItemCola>(
  items: readonly T[],
  ahora: number,
  propios: ReadonlySet<string>,
): T[] {
  return items.filter(
    (i) => propios.has(i.recorridoId) && i.intentos < MAX_INTENTOS && i.proximoIntento <= ahora,
  )
}

/** Vuelve a encolar los recorridos finalizados del usuario que perdieron su item de cola. */
async function reencolarHuerfanos(
  recorridos: readonly RecorridoLocal[],
  cola: readonly ItemCola[],
  deps: DepsSincronizacion,
): Promise<void> {
  const encolados = new Set(cola.map((i) => i.recorridoId))
  for (const recorrido of recorridos) {
    if (recorrido.estado !== 'finalizado' || encolados.has(recorrido.id)) continue
    await deps.db.encolar(recorrido.id)
  }
}

/** Marca en error los recorridos del usuario cuyos items ya agotaron los intentos. */
async function marcarAgotados(
  recorridos: readonly RecorridoLocal[],
  cola: readonly ItemCola[],
  deps: DepsSincronizacion,
): Promise<void> {
  const porId = new Map(recorridos.map((r) => [r.id, r]))
  for (const item of cola) {
    if (item.intentos < MAX_INTENTOS) continue
    const recorrido = porId.get(item.recorridoId)
    if (!recorrido || recorrido.estado === 'error') continue
    await deps.db.guardarRecorrido({ ...recorrido, estado: 'error', ultimoError: item.ultimoError })
  }
}

/**
 * Procesa secuencialmente los recorridos encolados del usuario cuyo backoff ya
 * venció. Antes reencola los finalizados que quedaron sin item de cola, y al
 * final marca en error los que agotaron los intentos.
 */
export async function procesarCola(
  deps: DepsSincronizacion,
  usuarioId: string,
): Promise<ResultadoCola> {
  const propios = await deps.db.listarRecorridos(usuarioId)
  await reencolarHuerfanos(propios, await deps.db.listarCola(), deps)

  const ids = new Set(propios.map((r) => r.id))
  const vencidos = itemsVencidos(await deps.db.listarCola(), deps.ahora(), ids)

  const resumenes: Record<string, ResumenRecorrido> = {}
  let procesados = 0
  for (const item of vencidos) {
    const resultado = await sincronizarRecorrido(item.recorridoId, deps)
    procesados += 1
    if (resultado.ok) resumenes[item.recorridoId] = resultado.data
  }

  const restantes = (await deps.db.listarCola()).filter((i) => ids.has(i.recorridoId))
  await marcarAgotados(await deps.db.listarRecorridos(usuarioId), restantes, deps)

  return {
    procesados,
    pendientes: restantes.filter((i) => i.intentos < MAX_INTENTOS).length,
    resumenes,
  }
}

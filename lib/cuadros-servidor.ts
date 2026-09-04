import type { TramoGeometria } from './cobertura'
import { puntosPorCuadros } from './juego'
import type { ClienteAdmin, ClienteServidor, Contexto } from './recorrido-servidor'
import { crearAsignadorTramos, type AsignadorTramos } from './sensores/asignacion'
import type { CuadroPayload } from './validaciones'

/** Fila de `cuadros`: una foto ya subida, georreferenciada y con su tramo. */
export type FilaCuadro = {
  recorrido_id: string
  usuario_id: string
  tramo_id: string | null
  t: string
  latitud: number
  longitud: number
  rumbo: number | null
  velocidad_kmh: number | null
  ruta: string
}

/** Motivo con el que se registran los puntos por cuadros de cámara. */
export const MOTIVO_CUADROS = 'cuadros'

export const ERROR_RUTA_AJENA = 'Ruta de cuadro fuera del recorrido'

/**
 * La ruta la elige el cliente al pedir la URL firmada, así que el servidor la
 * vuelve a verificar antes de guardarla: un payload modificado no puede
 * apuntar a un objeto de otra persona o de otro recorrido.
 */
export function prefijoRuta(ctx: Contexto): string {
  return `${ctx.usuarioId}/${ctx.recorridoId}/`
}

/**
 * Filas de `cuadros` para el lote, cada una asignada al tramo más cercano.
 * Rechaza el lote entero si alguna ruta no cuelga del usuario y el recorrido.
 */
export function filasCuadros(
  ctx: Contexto,
  cuadros: readonly CuadroPayload[],
  asignador: AsignadorTramos,
): FilaCuadro[] {
  const prefijo = prefijoRuta(ctx)

  return cuadros.map((c) => {
    if (!c.ruta.startsWith(prefijo)) throw new Error(ERROR_RUTA_AJENA)
    return {
      recorrido_id: ctx.recorridoId,
      usuario_id: ctx.usuarioId,
      tramo_id: asignador.tramoDe(c),
      t: new Date(c.t).toISOString(),
      latitud: c.lat,
      longitud: c.lng,
      rumbo: c.rumbo,
      velocidad_kmh: c.velocidadKmh,
      ruta: c.ruta,
    }
  })
}

/**
 * Guarda el lote con el cliente del usuario (las políticas exigen que el
 * recorrido sea suyo). El upsert por `(recorrido_id, t)` hace que un reintento
 * de la cola de subida no duplique cuadros.
 */
export async function guardarCuadros(
  supabase: ClienteServidor,
  ctx: Contexto,
  cuadros: readonly CuadroPayload[],
  tramos: readonly TramoGeometria[],
): Promise<number> {
  const filas = filasCuadros(ctx, cuadros, crearAsignadorTramos(tramos))
  if (filas.length === 0) return 0

  const { error } = await supabase
    .from('cuadros')
    .upsert(filas, { onConflict: 'recorrido_id,t' })
  if (error) throw new Error(error.message)
  return filas.length
}

/**
 * Recalcula los puntos por cuadros del recorrido sobre el total guardado y
 * reemplaza el evento anterior. Es idempotente: la cola sube en lotes y cada
 * llamada deja el mismo estado final que dejaría una sola con todo junto.
 */
export async function recalcularPuntosCuadros(
  admin: ClienteAdmin,
  ctx: Contexto,
): Promise<number> {
  const { count, error } = await admin
    .from('cuadros')
    .select('id', { count: 'exact', head: true })
    .eq('recorrido_id', ctx.recorridoId)
  if (error) throw new Error(error.message)

  const { error: errorBorrado } = await admin
    .from('puntos_eventos')
    .delete()
    .eq('recorrido_id', ctx.recorridoId)
    .eq('motivo', MOTIVO_CUADROS)
  if (errorBorrado) throw new Error(errorBorrado.message)

  const total = count ?? 0
  const puntos = puntosPorCuadros(total)
  if (puntos <= 0) return 0

  const { error: errorInsert } = await admin.from('puntos_eventos').insert({
    usuario_id: ctx.usuarioId,
    municipio: ctx.municipio,
    recorrido_id: ctx.recorridoId,
    motivo: MOTIVO_CUADROS,
    puntos,
  })
  if (errorInsert) throw new Error(errorInsert.message)
  return puntos
}

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
 * Ventana temporal del recorrido contra la que se valida cada cuadro
 * (inicio/fin como ISO string, tal como los devuelve `buscarRecorrido`).
 */
export type VentanaRecorrido = { inicio: string; fin: string }

/** Espaciado mínimo entre cuadros consecutivos (lote y ya guardados). Antitrampa: farmeo por ráfaga. */
export const ESPACIADO_MINIMO_CUADRO_MS = 5000

/** Margen fuera de [inicio, fin] tolerado por deriva de reloj entre cliente y servidor. */
const MARGEN_VENTANA_RECORRIDO_MS = 60 * 1000

/** Techo defensivo de cuadros ya guardados que se leen para chequear espaciado. */
const LIMITE_CUADROS_EXISTENTES = 2000

/** Lanzado cuando un lote de cuadros no es físicamente plausible; el mensaje es el motivo técnico. */
export class ErrorPlausibilidadCuadros extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'ErrorPlausibilidadCuadros'
  }
}

export type ResultadoPlausibilidad = { ok: true } | { ok: false; motivo: string }

/** Cantidad máxima de cuadros plausible para un recorrido de esta duración (uno cada `ESPACIADO_MINIMO_CUADRO_MS`). */
export function maxCuadrosPorDuracion(duracionMs: number): number {
  return Math.floor(duracionMs / ESPACIADO_MINIMO_CUADRO_MS) + 1
}

/**
 * Plausibilidad barata de un lote de cuadros, antes de escribirlo:
 * - cada `t` debe caer dentro de la ventana del recorrido (+/- margen de reloj);
 * - el espaciado entre cuadros consecutivos (lote + ya guardados, sin duplicados
 *   exactos para no romper el reintento idempotente) debe ser >= al mínimo;
 * - la cantidad total no puede superar la que la duración del recorrido admite.
 * Es pura: no toca la base, así se puede testear y reusar sin mocks.
 */
export function validarPlausibilidadCuadros(
  cuadros: readonly CuadroPayload[],
  recorrido: VentanaRecorrido,
  existentesT: readonly string[],
): ResultadoPlausibilidad {
  const inicioMs = Date.parse(recorrido.inicio)
  const finMs = Date.parse(recorrido.fin)
  const desde = inicioMs - MARGEN_VENTANA_RECORRIDO_MS
  const hasta = finMs + MARGEN_VENTANA_RECORRIDO_MS

  for (const c of cuadros) {
    if (c.t < desde || c.t > hasta) {
      return { ok: false, motivo: `cuadro fuera de la ventana del recorrido (t=${c.t})` }
    }
  }

  const existentesMs = existentesT.map((t) => Date.parse(t))
  // Set: un reintento del mismo lote trae los mismos `t` que ya están guardados
  // (el upsert es idempotente); no cuenta como un cuadro nuevo pegado al anterior.
  const combinados = [...new Set([...existentesMs, ...cuadros.map((c) => c.t)])].sort((a, b) => a - b)

  for (let i = 1; i < combinados.length; i++) {
    if (combinados[i] - combinados[i - 1] < ESPACIADO_MINIMO_CUADRO_MS) {
      return {
        ok: false,
        motivo: `espaciado insuficiente entre cuadros (${combinados[i - 1]} y ${combinados[i]})`,
      }
    }
  }

  const maxCuadros = maxCuadrosPorDuracion(finMs - inicioMs)
  if (combinados.length > maxCuadros) {
    return {
      ok: false,
      motivo: `tope de cuadros por duración del recorrido superado (${combinados.length} > ${maxCuadros})`,
    }
  }

  return { ok: true }
}

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
 *
 * Antitrampa: antes de escribir se valida la plausibilidad del lote contra la
 * ventana del recorrido y el espaciado mínimo (ver `validarPlausibilidadCuadros`).
 * Un lote implausible se rechaza entero, sin escribir nada.
 */
export async function guardarCuadros(
  supabase: ClienteServidor,
  ctx: Contexto,
  cuadros: readonly CuadroPayload[],
  tramos: readonly TramoGeometria[],
  ventana: VentanaRecorrido,
): Promise<number> {
  const filas = filasCuadros(ctx, cuadros, crearAsignadorTramos(tramos))
  if (filas.length === 0) return 0

  const { data: existentes, error: errorExistentes } = await supabase
    .from('cuadros')
    .select('t')
    .eq('recorrido_id', ctx.recorridoId)
    .limit(LIMITE_CUADROS_EXISTENTES)
  if (errorExistentes) throw new Error(errorExistentes.message)
  const existentesT = ((existentes ?? []) as { t: string }[]).map((f) => f.t)

  const plausibilidad = validarPlausibilidadCuadros(cuadros, ventana, existentesT)
  if (!plausibilidad.ok) throw new ErrorPlausibilidadCuadros(plausibilidad.motivo)

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

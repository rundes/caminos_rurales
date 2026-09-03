import type { ResumenRecorrido } from '@/app/dashboard/recorrido/actions'
import type { DestinoSubida } from '@/lib/almacenamiento/tipos'
import { valorParaGuardar } from '@/lib/almacenamiento/tipos'
import { simplificar, type PuntoGps } from '@/lib/track'
import type { ResultadoAccion } from '@/lib/tipos'
import type { Observacion, RecorridoPayload } from '@/lib/validaciones'
import type { BaseLocal, ObservacionLocal, RecorridoLocal, TipoEvidencia } from './tipos'

/** Espera entre reintentos, en milisegundos. El último valor se repite. */
export const BACKOFF_MS = [5_000, 30_000, 120_000] as const
export const MAX_INTENTOS = 20
export const TOLERANCIA_SIMPLIFICADO_M = 10

const ERROR_SIN_RECORRIDO = 'No se encontró el recorrido guardado en el dispositivo.'
const ERROR_SIN_TRACK = 'El recorrido no tiene puntos suficientes para subirse.'

export type DepsSincronizacion = {
  db: BaseLocal
  prepararSubida: (
    recorridoId: string,
    nombre: string,
    contentType: string,
  ) => Promise<ResultadoAccion<DestinoSubida>>
  finalizarRecorrido: (payload: unknown) => Promise<ResultadoAccion<ResumenRecorrido>>
  subir: (destino: DestinoSubida, archivo: Blob) => Promise<void>
  comprimir: (archivo: File) => Promise<File>
  ahora: () => number
}

export type ResultadoSincronizacion = ResultadoAccion<ResumenRecorrido>

function tipoEvidencia(contentType: string): TipoEvidencia {
  return contentType.startsWith('video/') ? 'video' : 'imagen'
}

/** Espera del intento número `intentos` (1 = primer fallo). */
export function esperaBackoff(intentos: number): number {
  const indice = Math.min(Math.max(intentos, 1), BACKOFF_MS.length) - 1
  return BACKOFF_MS[indice]
}

async function subirEvidencia(
  observacion: ObservacionLocal,
  deps: DepsSincronizacion,
): Promise<ObservacionLocal> {
  const blob = observacion.archivo
  if (!blob || observacion.estadoSubida === 'subida') return observacion

  const nombre = observacion.nombreArchivo ?? `${observacion.id}.jpg`
  const tipoOriginal = observacion.tipoArchivo ?? blob.type ?? 'image/jpeg'
  const original = new File([blob], nombre, { type: tipoOriginal })
  const archivo = tipoOriginal.startsWith('image/') ? await deps.comprimir(original) : original

  const preparada = await deps.prepararSubida(observacion.recorridoId, archivo.name, archivo.type)
  if (!preparada.ok) throw new Error(preparada.error)

  await deps.subir(preparada.data, archivo)

  const subida: ObservacionLocal = {
    ...observacion,
    archivo: undefined,
    evidencia: { ruta: valorParaGuardar(preparada.data), tipo: tipoEvidencia(archivo.type) },
    estadoSubida: 'subida',
  }
  await deps.db.guardarObservacion(subida)
  return subida
}

function aObservacionPayload(observacion: ObservacionLocal): Observacion {
  return {
    id: observacion.id,
    tipo_falla: observacion.tipo_falla,
    severidad: observacion.severidad,
    latitud: observacion.latitud,
    longitud: observacion.longitud,
    ...(observacion.descripcion ? { descripcion: observacion.descripcion } : {}),
    ...(observacion.evidencia ? { evidencia: observacion.evidencia } : {}),
  }
}

async function armarPayload(
  recorrido: RecorridoLocal,
  observaciones: readonly ObservacionLocal[],
  deps: DepsSincronizacion,
): Promise<RecorridoPayload> {
  const puntos = await deps.db.listarPuntos(recorrido.id)
  if (puntos.length < 2) throw new Error(ERROR_SIN_TRACK)

  const track = simplificar(puntos as PuntoGps[], TOLERANCIA_SIMPLIFICADO_M).map(
    (p): [number, number] => [p.lat, p.lng],
  )

  return {
    id: recorrido.id,
    inicio: recorrido.inicio,
    fin: recorrido.fin ?? new Date(deps.ahora()).toISOString(),
    puntosGps: puntos.length,
    track,
    observaciones: observaciones.map(aObservacionPayload),
  }
}

/** Anota el fallo en la cola con backoff y marca el recorrido en error al agotar los intentos. */
async function registrarFallo(
  recorrido: RecorridoLocal,
  mensaje: string,
  deps: DepsSincronizacion,
): Promise<void> {
  const item = (await deps.db.obtenerItemCola(recorrido.id)) ?? {
    recorridoId: recorrido.id,
    intentos: 0,
    proximoIntento: 0,
  }
  const intentos = item.intentos + 1

  await deps.db.guardarItemCola({
    recorridoId: recorrido.id,
    intentos,
    proximoIntento: deps.ahora() + esperaBackoff(intentos),
    ultimoError: mensaje,
  })
  await deps.db.guardarRecorrido({
    ...recorrido,
    estado: intentos >= MAX_INTENTOS ? 'error' : 'finalizado',
  })
}

/**
 * Sube las evidencias pendientes de un recorrido y lo cierra en el servidor.
 * En caso de éxito lo marca `subido` y lo saca de la cola; si falla anota el
 * intento con backoff creciente y lo deja para el próximo pase.
 */
export async function sincronizarRecorrido(
  recorridoId: string,
  deps: DepsSincronizacion,
): Promise<ResultadoSincronizacion> {
  const recorrido = await deps.db.obtenerRecorrido(recorridoId)
  if (!recorrido) {
    await deps.db.borrarItemCola(recorridoId)
    return { ok: false, error: ERROR_SIN_RECORRIDO }
  }

  try {
    await deps.db.guardarRecorrido({ ...recorrido, estado: 'subiendo' })

    const guardadas = await deps.db.listarObservaciones(recorridoId)
    const observaciones: ObservacionLocal[] = []
    for (const observacion of guardadas) {
      observaciones.push(await subirEvidencia(observacion, deps))
    }

    const payload = await armarPayload(recorrido, observaciones, deps)
    const resultado = await deps.finalizarRecorrido(payload)
    if (!resultado.ok) {
      await registrarFallo(recorrido, resultado.error, deps)
      return resultado
    }

    await deps.db.guardarRecorrido({ ...recorrido, estado: 'subido' })
    await deps.db.borrarItemCola(recorridoId)
    return resultado
  } catch (error) {
    console.error('[sincronizacion]', error)
    const mensaje = error instanceof Error ? error.message : 'Error desconocido'
    await registrarFallo(recorrido, mensaje, deps)
    return { ok: false, error: mensaje }
  }
}

export type ResultadoCola = {
  procesados: number
  pendientes: number
  ultimoResumen: ResumenRecorrido | null
}

/** Items de la cola que ya cumplieron su espera y todavía tienen intentos. */
export function itemsVencidos<T extends { intentos: number; proximoIntento: number }>(
  items: readonly T[],
  ahora: number,
): T[] {
  return items.filter((i) => i.intentos < MAX_INTENTOS && i.proximoIntento <= ahora)
}

/** Procesa secuencialmente los recorridos encolados cuyo backoff ya venció. */
export async function procesarCola(deps: DepsSincronizacion): Promise<ResultadoCola> {
  const vencidos = itemsVencidos(await deps.db.listarCola(), deps.ahora())

  let ultimoResumen: ResumenRecorrido | null = null
  let procesados = 0
  for (const item of vencidos) {
    const resultado = await sincronizarRecorrido(item.recorridoId, deps)
    procesados += 1
    if (resultado.ok) ultimoResumen = resultado.data
  }

  const restantes = await deps.db.listarCola()
  return { procesados, pendientes: restantes.length, ultimoResumen }
}

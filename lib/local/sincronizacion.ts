import {
  esDefinitivo,
  esperaBackoff,
  MAX_INTENTOS,
  type DepsSincronizacion,
  type ResultadoSincronizacion,
} from './deps'
import { subirEvidencia } from './evidencias'
import { armarPayload } from './payload'
import type { ObservacionLocal, RecorridoLocal } from './tipos'

export {
  BACKOFF_MS,
  MAX_INTENTOS,
  esDefinitivo,
  esperaBackoff,
  type DepsSincronizacion,
  type ResultadoSincronizacion,
} from './deps'
export {
  MAX_IMPACTOS_PAYLOAD,
  MAX_MUESTRAS_PAYLOAD,
  MAX_PUNTOS_PAYLOAD,
  TOLERANCIA_SIMPLIFICADO_M,
} from './payload'

const ERROR_SIN_RECORRIDO = 'No se encontró el recorrido guardado en el dispositivo.'

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
  const agotado = intentos >= MAX_INTENTOS

  await deps.db.guardarItemCola({
    recorridoId: recorrido.id,
    intentos,
    proximoIntento: deps.ahora() + esperaBackoff(intentos),
    ultimoError: mensaje,
  })
  await deps.db.guardarRecorrido({
    ...recorrido,
    estado: agotado ? 'error' : 'finalizado',
    ...(agotado ? { ultimoError: mensaje } : {}),
  })
}

/** Un rechazo definitivo cierra el recorrido en error y lo saca de la cola: no se reintenta. */
async function registrarDefinitivo(
  recorrido: RecorridoLocal,
  mensaje: string,
  deps: DepsSincronizacion,
): Promise<void> {
  await deps.db.guardarRecorrido({ ...recorrido, estado: 'error', ultimoError: mensaje })
  await deps.db.borrarItemCola(recorrido.id)
}

/**
 * Sube las evidencias pendientes de un recorrido y lo cierra en el servidor.
 * En caso de éxito lo marca `subido` y lo saca de la cola; si falla anota el
 * intento con backoff creciente y lo deja para el próximo pase. Un fallo
 * definitivo no se reintenta.
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
      if (esDefinitivo(resultado)) await registrarDefinitivo(recorrido, resultado.error, deps)
      else await registrarFallo(recorrido, resultado.error, deps)
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

import { valorParaGuardar, type DestinoSubida } from '@/lib/almacenamiento/tipos'
import { TIPO_CUADRO } from '@/lib/camara/captura'
import type { EstadoRed } from '@/lib/camara/red'
import { LOTE_CUADROS } from '@/lib/camara/umbrales'
import type { ResultadoAccion } from '@/lib/tipos'
import { esperaBackoff, MAX_INTENTOS } from './deps'
import type { BaseCuadros, CuadroGuardado, ItemColaCuadros } from './tipos'

/** Nombre del archivo; la ruta la arma el servidor con el `observacionId`. */
export const NOMBRE_CUADRO = 'cuadro.jpg'

export const ERROR_SIN_BLOB = 'El cuadro ya no tiene la imagen guardada en el dispositivo.'

/** Un cuadro tal como lo espera la Server Action. */
export type CuadroSubido = {
  t: number
  lat: number
  lng: number
  rumbo: number | null
  velocidadKmh: number | null
  ruta: string
}

/** Lo que el servidor puede devolver al registrar un lote de cuadros. */
export type RespuestaCuadros =
  | ResultadoAccion<{ registrados: number; puntos: number }>
  | { ok: false; error: string; definitivo: true }

/**
 * Firma local de la Server Action `registrarCuadros`. Se inyecta para que la
 * cola no dependa de `actions.ts` (que no se puede importar en los tests).
 */
export type RegistrarCuadros = (entrada: unknown) => Promise<RespuestaCuadros>

export type DepsCuadros = {
  db: BaseCuadros
  prepararSubida: (
    recorridoId: string,
    nombre: string,
    contentType: string,
    observacionId?: string,
  ) => Promise<ResultadoAccion<DestinoSubida>>
  subir: (destino: DestinoSubida, archivo: Blob) => Promise<void>
  registrarCuadros: RegistrarCuadros
  ahora: () => number
  red: () => EstadoRed
}

export type ResultadoColaCuadros = {
  /** Recorridos con cuadros esperando subirse que todavía tienen reintentos. */
  pendientes: number
  /** Cuadros efectivamente subidos en esta pasada. */
  subidos: number
  /**
   * Cuadros que quedaron en error, por recorrido: se dieron por perdidos (o el
   * servidor los rechazó de forma definitiva) y la UI lo avisa. Solo aparecen
   * los recorridos con al menos uno.
   */
  errorCuadros: Record<string, number>
}

/** Rechazo del servidor que no tiene sentido reintentar. */
class FalloDefinitivo extends Error {}

/** ¿El servidor marcó el rechazo como definitivo? */
function esDefinitivo(respuesta: RespuestaCuadros): boolean {
  return !respuesta.ok && 'definitivo' in respuesta && respuesta.definitivo === true
}

/**
 * Da por perdidos los cuadros pendientes de un recorrido: quedan en `error`
 * (la fila se conserva para contarlos, el blob se libera) y el item sale de la
 * cola. Devuelve cuántos descartó.
 */
async function descartarCuadros(recorridoId: string, deps: DepsCuadros): Promise<number> {
  const descartados = await deps.db.marcarCuadrosEnError(recorridoId)
  await deps.db.borrarItemColaCuadros(recorridoId)
  return descartados
}

/** Anota el fallo en la cola de cuadros con el mismo backoff que la cola principal. */
async function registrarFallo(
  recorridoId: string,
  mensaje: string,
  deps: DepsCuadros,
): Promise<void> {
  const item = (await deps.db.obtenerItemColaCuadros(recorridoId)) ?? {
    recorridoId,
    intentos: 0,
    proximoIntento: 0,
  }
  const intentos = item.intentos + 1
  await deps.db.guardarItemColaCuadros({
    recorridoId,
    intentos,
    proximoIntento: deps.ahora() + esperaBackoff(intentos),
    ultimoError: mensaje,
  })
}

/** Sube un cuadro y devuelve la fila que hay que registrar en el servidor. */
async function subirCuadro(
  cuadro: CuadroGuardado,
  recorridoId: string,
  deps: DepsCuadros,
): Promise<CuadroSubido> {
  if (!cuadro.blob) throw new Error(ERROR_SIN_BLOB)

  // El `t` hace la ruta determinística: un reintento pisa el mismo objeto en
  // vez de dejar copias huérfanas en el bucket.
  const preparada = await deps.prepararSubida(
    recorridoId,
    NOMBRE_CUADRO,
    TIPO_CUADRO,
    `cuadro-${cuadro.t}`,
  )
  if (!preparada.ok) throw new Error(preparada.error)

  await deps.subir(preparada.data, cuadro.blob)

  return {
    t: cuadro.t,
    lat: cuadro.lat,
    lng: cuadro.lng,
    rumbo: cuadro.rumbo,
    velocidadKmh: cuadro.velocidadKmh,
    ruta: valorParaGuardar(preparada.data),
  }
}

/**
 * Sube todos los cuadros pendientes de un recorrido en lotes de
 * `LOTE_CUADROS`: PUT por cuadro y una sola llamada a `registrarCuadros` por
 * lote. Al terminar el recorrido sale de la cola; si algo falla queda con
 * backoff y se retoma donde había llegado (los ya subidos no se repiten).
 */
async function subirCuadrosDe(recorridoId: string, deps: DepsCuadros): Promise<number> {
  let subidos = 0
  try {
    for (;;) {
      const lote = (await deps.db.listarCuadros(recorridoId, 'pendiente')).slice(0, LOTE_CUADROS)
      if (lote.length === 0) break

      const filas: CuadroSubido[] = []
      const ids: number[] = []
      for (const cuadro of lote) {
        // Un cuadro sin imagen (blob liberado a mano, base vieja) no se puede
        // subir: se marca en error para que salga de los pendientes.
        if (!cuadro.blob) {
          await deps.db.marcarCuadro(cuadro.id, 'error')
          continue
        }
        filas.push(await subirCuadro(cuadro, recorridoId, deps))
        ids.push(cuadro.id)
      }
      if (filas.length === 0) continue

      const resultado = await deps.registrarCuadros({ recorridoId, cuadros: filas })
      if (!resultado.ok) {
        throw esDefinitivo(resultado)
          ? new FalloDefinitivo(resultado.error)
          : new Error(resultado.error)
      }

      for (let i = 0; i < ids.length; i += 1) {
        await deps.db.marcarCuadro(ids[i], 'subida', filas[i].ruta)
      }
      // Los blobs ya no hacen falta: liberan el espacio del dispositivo.
      await deps.db.borrarCuadrosSubidos(recorridoId)
      subidos += filas.length
    }
    await deps.db.borrarItemColaCuadros(recorridoId)
  } catch (error) {
    console.error('[cuadros]', error)
    const mensaje = error instanceof Error ? error.message : 'Error desconocido'
    // Un rechazo definitivo no se reintenta: los cuadros quedan en error y el
    // recorrido sale de la cola. Cualquier otro fallo espera su backoff.
    if (error instanceof FalloDefinitivo) await descartarCuadros(recorridoId, deps)
    else await registrarFallo(recorridoId, mensaje, deps)
  }
  return subidos
}

/**
 * Los recorridos que agotaron los intentos salen de la cola con sus cuadros en
 * error: si no, `pendientes` seguiría contando cuadros que ya nadie va a subir.
 */
async function descartarAgotados(
  cola: readonly ItemColaCuadros[],
  propios: ReadonlySet<string>,
  deps: DepsCuadros,
): Promise<void> {
  for (const item of cola) {
    if (!propios.has(item.recorridoId) || item.intentos < MAX_INTENTOS) continue
    console.error('[cuadros]', item.recorridoId, item.ultimoError ?? 'intentos agotados')
    await descartarCuadros(item.recorridoId, deps)
  }
}

/** Cuadros en error por recorrido, para que el resumen pueda avisarlo. */
async function contarErrores(
  recorridos: readonly string[],
  deps: DepsCuadros,
): Promise<Record<string, number>> {
  const errores: Record<string, number> = {}
  for (const recorridoId of recorridos) {
    const enError = await deps.db.contarCuadros(recorridoId, 'error')
    if (enError > 0) errores[recorridoId] = enError
  }
  return errores
}

/** Vuelve a encolar los recorridos ya subidos que tienen cuadros sin item de cola. */
async function reencolarHuerfanos(
  recorridosSubidos: readonly string[],
  cola: readonly ItemColaCuadros[],
  deps: DepsCuadros,
): Promise<void> {
  const encolados = new Set(cola.map((i) => i.recorridoId))
  for (const recorridoId of recorridosSubidos) {
    if (encolados.has(recorridoId)) continue
    if ((await deps.db.contarCuadros(recorridoId, 'pendiente')) === 0) continue
    await deps.db.encolarCuadros(recorridoId)
  }
}

/**
 * Sube los cuadros de los recorridos del usuario que ya se subieron al
 * servidor. Solo se procesan los propios: la cola local puede tener
 * recorridos de otra sesión y esos nunca se tocan. Con la red no permitida
 * (preferencia WiFi y datos móviles) no se sube nada, pero se informan los
 * pendientes para que la UI los muestre. Al final, los recorridos que agotaron
 * los intentos se dan por perdidos.
 */
export async function procesarColaCuadros(
  deps: DepsCuadros,
  usuarioId: string,
): Promise<ResultadoColaCuadros> {
  const propios = await deps.db.listarRecorridos(usuarioId)
  const ids = new Set(propios.map((r) => r.id))
  const subidosEnServidor = propios.filter((r) => r.estado === 'subido').map((r) => r.id)

  await reencolarHuerfanos(subidosEnServidor, await deps.db.listarColaCuadros(), deps)

  let subidos = 0
  if (deps.red().permitida) {
    const ahora = deps.ahora()
    const listos = new Set(subidosEnServidor)
    const vencidos = (await deps.db.listarColaCuadros()).filter(
      (i) => listos.has(i.recorridoId) && i.intentos < MAX_INTENTOS && i.proximoIntento <= ahora,
    )
    for (const item of vencidos) {
      subidos += await subirCuadrosDe(item.recorridoId, deps)
    }
  }

  await descartarAgotados(await deps.db.listarColaCuadros(), ids, deps)

  const restantes = (await deps.db.listarColaCuadros()).filter((i) => ids.has(i.recorridoId))
  return {
    pendientes: restantes.filter((i) => i.intentos < MAX_INTENTOS).length,
    subidos,
    errorCuadros: await contarErrores(subidosEnServidor, deps),
  }
}

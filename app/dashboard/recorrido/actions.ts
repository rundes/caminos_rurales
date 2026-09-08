'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { obtenerProveedor } from '@/lib/almacenamiento'
import { revalidarMunicipio } from '@/lib/cache'
import type { DestinoSubida } from '@/lib/almacenamiento/tipos'
import { TIPOS_PERMITIDOS, rutaEvidencia } from '@/lib/archivos'
import { ErrorPlausibilidadCuadros, guardarCuadros, recalcularPuntosCuadros } from '@/lib/cuadros-servidor'
import { consumirCupo, CUPO_RECORRIDOS_DIA, CUPO_SUBIDAS_DIA } from '@/lib/cupos'
import {
  ERROR_SESION,
  buscarRecorrido,
  coordenadasDeTrack,
  liberarProcesamiento,
  procesarRecorrido,
  reclamarProcesamiento,
  resumenGuardado,
  sesionYMunicipio,
  tramosDeMunicipio,
  type Contexto,
  type ResumenRecorrido,
} from '@/lib/recorrido-servidor'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/server'
import { derivarCortes, derivarCortesPorDistancia, evaluarPlausibilidad, kmDeTrack, unionCortes } from '@/lib/track'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaCuadros, esquemaRecorrido, primerError } from '@/lib/validaciones'

export type { ResumenRecorrido } from '@/lib/recorrido-servidor'

/**
 * Resultado de `finalizarRecorrido`. Un fallo marcado `definitivo` no se
 * reintenta nunca: el payload es inválido, el recorrido es de otra persona o
 * el track no es físicamente plausible. Reintentarlo daría siempre lo mismo.
 */
export type ResultadoRecorrido =
  | ResultadoAccion<ResumenRecorrido>
  | { ok: false; error: string; definitivo: true }

const ERROR_GENERICO = 'No se pudo guardar el recorrido. Intentá de nuevo.'
const ERROR_AJENO = 'Ese recorrido ya fue registrado por otra persona.'
const ERROR_IMPLAUSIBLE = 'El recorrido no pudo validarse. Verificá el GPS y volvé a intentar.'
const ERROR_CUPO_RECORRIDOS = 'Alcanzaste el máximo de recorridos por día. Volvé a intentar mañana.'

/** Código Postgres de violación de unicidad (`unique_violation`). */
const CODIGO_DUPLICADO = '23505'

function revalidarDashboard(municipio: string): void {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/mapa')
  revalidatePath('/dashboard/ranking')
  // Los agregados por municipio del mapa (tramos, cuadros por tramo) se
  // cachean aparte con `unstable_cache` (ver `lib/cache.ts`): `revalidatePath`
  // no los alcanza, así que un recorrido nuevo tiene que invalidar su tag.
  revalidarMunicipio(municipio)
}

/**
 * Cierra un recorrido: guarda el track, calcula cobertura, observaciones,
 * muestras de sensores, impactos, puntos e insignias.
 *
 * Antitrampa: antes de escribir nada se evalúa la plausibilidad física del
 * track (velocidad media, velocidad entre muestras, precisión y km totales).
 *
 * Idempotente por `id` (lo genera el cliente). El recorrido se marca con
 * `procesado_at` antes de arrancar el post-procesado, no después: la carrera
 * la resuelve `reclamarProcesamiento` (update atómico `where procesado_at is
 * null`), así que entre dos envíos concurrentes del mismo recorrido gana uno
 * solo. Concretamente:
 * - si ya existe y está procesado, devuelve el resumen recalculado sin escribir;
 * - si existe pero no está procesado, se intenta reclamar: si se pierde la
 *   carrera (ya lo reclamó otro envío) se devuelve el resumen recalculado; si
 *   se gana, se procesa y, si algo falla, se libera el sello para poder
 *   reintentar.
 *
 * Antitrampa: un recorrido nuevo (no una reentrega) consume el cupo diario de
 * recorridos del usuario; sin cupo, el rechazo es definitivo.
 */
export async function finalizarRecorrido(payload: unknown): Promise<ResultadoRecorrido> {
  const parseo = esquemaRecorrido.safeParse(payload)
  if (!parseo.success) return { ok: false, error: primerError(parseo.error), definitivo: true }
  const datos = parseo.data

  // Antitrampa: los cortes del track no salen de lo que declare el cliente
  // (podría ocultar una pausa mandando cortes de menos, o inventar una para
  // recortar km de más) sino de dos señales que el propio servidor deriva,
  // y de las que toma la unión (alcanza con que una sola detecte el corte):
  // - por tiempo (`derivarCortes`), con el mismo umbral que usa el watchdog
  //   del grabador, a partir de los timestamps de `datos.puntos`. Solo se
  //   aplica cuando `puntos` tiene la misma cantidad de elementos que
  //   `track`: es como los arma siempre el cliente real (`armarPayload`,
  //   mismo array simplificado para ambos, así que quedan índice a índice
  //   alineados); si no coinciden no hay forma confiable de mapear un corte
  //   de `puntos` a un índice de `track`, así que esta señal no aporta nada
  //   (mismo comportamiento que sin `puntos`, ver la nota de `esquemaRecorrido`).
  // - por distancia (`derivarCortesPorDistancia`), directo sobre la
  //   geometría de `track`: no depende de `puntos` en absoluto, así que un
  //   payload que lo omite o lo desalinea a propósito para esquivar el corte
  //   por tiempo no logra nada — un salto de varios kilómetros entre dos
  //   puntos consecutivos del track sigue sin acreditarse.
  const trackCoords = coordenadasDeTrack(datos.track)
  const cortesTiempo =
    datos.puntos && datos.puntos.length === datos.track.length ? derivarCortes(datos.puntos) : []
  const cortesDistancia = derivarCortesPorDistancia(trackCoords)
  const cortes = unionCortes(cortesTiempo, cortesDistancia)
  const kmCrudo = kmDeTrack(trackCoords, cortes)
  const plausibilidad = evaluarPlausibilidad({
    km: kmCrudo,
    inicio: new Date(datos.inicio),
    fin: new Date(datos.fin),
    puntos: datos.puntos,
  })
  if (!plausibilidad.ok) {
    console.error('[recorrido] implausible', plausibilidad.motivos)
    return { ok: false, error: ERROR_IMPLAUSIBLE, definitivo: true }
  }

  const supabase = await crearClienteServidor()
  const sesion = await sesionYMunicipio(supabase)
  if ('error' in sesion) return { ok: false, error: sesion.error }

  const ctx: Contexto = { ...sesion, recorridoId: datos.id }
  const km = Number(kmCrudo.toFixed(3))

  try {
    const admin = crearClienteAdmin()

    let existente = await buscarRecorrido(supabase, datos.id)
    if (existente && existente.usuario_id !== ctx.usuarioId) {
      return { ok: false, error: ERROR_AJENO, definitivo: true }
    }

    if (!existente) {
      // Antitrampa: tope diario de recorridos nuevos. Una reentrega del mismo
      // recorrido (existente ya insertado) no consume cupo de nuevo.
      const cupoOk = await consumirCupo(supabase, 'recorridos', CUPO_RECORRIDOS_DIA)
      if (!cupoOk) return { ok: false, error: ERROR_CUPO_RECORRIDOS, definitivo: true }

      const { error: errorInsert } = await supabase.from('recorridos').insert({
        id: datos.id,
        usuario_id: ctx.usuarioId,
        municipio: ctx.municipio,
        inicio: datos.inicio,
        fin: datos.fin,
        km,
        puntos_gps: datos.puntosGps,
        track: datos.track,
        estado: 'finalizado',
      })
      if (errorInsert) {
        // Carrera: dos envíos del mismo recorrido llegaron a la vez. El perdedor
        // relee la fila y sigue por la rama idempotente.
        if (errorInsert.code !== CODIGO_DUPLICADO) throw new Error(errorInsert.message)
        existente = await buscarRecorrido(supabase, datos.id)
        if (!existente) throw new Error(errorInsert.message)
        if (existente.usuario_id !== ctx.usuarioId) {
          return { ok: false, error: ERROR_AJENO, definitivo: true }
        }
      }
    }

    const kmGuardado = existente ? existente.km : km
    if (existente?.procesado_at) {
      return { ok: true, data: await resumenGuardado(supabase, admin, ctx, kmGuardado) }
    }

    // Sella el recorrido *antes* de procesarlo: si otro envío concurrente ya lo
    // reclamó, no hay 0 filas que perder tiempo reprocesando.
    const reclamado = await reclamarProcesamiento(admin, ctx.recorridoId)
    if (!reclamado) {
      return { ok: true, data: await resumenGuardado(supabase, admin, ctx, kmGuardado) }
    }

    try {
      const resumen = await procesarRecorrido(supabase, admin, ctx, datos, kmGuardado)
      revalidarDashboard(ctx.municipio)
      return { ok: true, data: resumen }
    } catch (error) {
      // El procesamiento quedó a medias: libera el sello para que un
      // reintento pueda reclamarlo y reprocesarlo desde cero.
      await liberarProcesamiento(admin, ctx.recorridoId)
      throw error
    }
  } catch (error) {
    console.error('[recorrido]', error)
    return { ok: false, error: ERROR_GENERICO }
  }
}

/** Lo que devuelve `registrarCuadros`: cuántos se guardaron y los puntos del recorrido. */
export type RegistroCuadros = { registrados: number; puntos: number }

/**
 * Resultado de `registrarCuadros`. Igual que `finalizarRecorrido`, un fallo
 * marcado `definitivo` no se reintenta: el payload es inválido, el recorrido
 * no existe o es de otra persona, o el lote no es plausible. Reintentarlo
 * daría siempre lo mismo y dejaría los cuadros dando vueltas para siempre.
 */
export type ResultadoCuadros =
  | ResultadoAccion<RegistroCuadros>
  | { ok: false; error: string; definitivo: true }

const ERROR_CUADROS = 'No se pudieron registrar los cuadros. Intentá de nuevo.'
const ERROR_CUADROS_SIN_RECORRIDO = 'Ese recorrido ya no está disponible.'
const ERROR_CUADROS_AJENOS = 'Ese recorrido es de otra persona.'
const ERROR_CUADROS_IMPLAUSIBLES = 'Los cuadros no pudieron validarse.'

/**
 * Registra un lote de cuadros de cámara ya subidos al almacenamiento: los
 * asigna al tramo más cercano, los guarda con el cliente del usuario y
 * recalcula los puntos por cuadros del recorrido.
 *
 * Idempotente: el upsert por `(recorrido_id, t)` y el recálculo sobre el total
 * guardado hacen que reenviar un lote no duplique filas ni puntos.
 */
export async function registrarCuadros(entrada: unknown): Promise<ResultadoCuadros> {
  const parseo = esquemaCuadros.safeParse(entrada)
  if (!parseo.success) return { ok: false, error: primerError(parseo.error), definitivo: true }
  const datos = parseo.data

  const supabase = await crearClienteServidor()
  const sesion = await sesionYMunicipio(supabase)
  if ('error' in sesion) return { ok: false, error: sesion.error }

  const ctx: Contexto = { ...sesion, recorridoId: datos.recorridoId }

  try {
    const recorrido = await buscarRecorrido(supabase, ctx.recorridoId)
    // Sin recorrido no hay nada que registrar: la cola sube los cuadros recién
    // después de que el recorrido quedó guardado, así que si no está es que se
    // borró. Reintentar no lo va a traer de vuelta.
    if (!recorrido) return { ok: false, error: ERROR_CUADROS_SIN_RECORRIDO, definitivo: true }
    if (recorrido.usuario_id !== ctx.usuarioId) {
      return { ok: false, error: ERROR_CUADROS_AJENOS, definitivo: true }
    }

    const admin = crearClienteAdmin()
    const tramos = await tramosDeMunicipio(admin, ctx.municipio)
    const registrados = await guardarCuadros(supabase, ctx, datos.cuadros, tramos, {
      inicio: recorrido.inicio,
      fin: recorrido.fin,
    })
    const puntos = await recalcularPuntosCuadros(admin, ctx)

    revalidatePath('/dashboard/mapa')
    return { ok: true, data: { registrados, puntos } }
  } catch (error) {
    console.error('[cuadros]', error)
    if (error instanceof ErrorPlausibilidadCuadros) {
      return { ok: false, error: ERROR_CUADROS_IMPLAUSIBLES, definitivo: true }
    }
    return { ok: false, error: ERROR_CUADROS }
  }
}

/**
 * El `observacionId` termina en la ruta de almacenamiento (ver `rutaEvidencia`):
 * un formato laxo dejaría que un payload modificado meta `/` o `..` y escriba
 * fuera del prefijo `{uid}/{recorridoId}/` que las políticas verifican.
 * `rutaEvidencia` además sanitiza el valor, en capas (defensa en profundidad).
 */
const REGEX_OBSERVACION_ID = /^[A-Za-z0-9-]{1,80}$/

const esquemaSubida = z.object({
  recorridoId: z.uuid({ message: 'Recorrido sin identificador válido' }),
  nombre: z.string().trim().min(1).max(200, { message: 'Nombre de archivo inválido' }),
  contentType: z.enum(TIPOS_PERMITIDOS, { message: 'Tipo de archivo no permitido' }),
  observacionId: z
    .string()
    .regex(REGEX_OBSERVACION_ID, { message: 'Identificador de observación inválido' })
    .optional(),
})

const ERROR_CUPO_SUBIDAS = 'Alcanzaste el máximo de subidas por día. Volvé a intentar mañana.'

/**
 * Devuelve una URL firmada para subir una evidencia del recorrido con un
 * `PUT` directo desde el navegador. El proveedor sale de `ALMACENAMIENTO`.
 *
 * Antitrampa: consume el cupo diario de subidas del usuario; sin cupo, el
 * rechazo es definitivo (no tiene sentido reintentar hasta el día siguiente).
 */
export async function prepararSubida(
  recorridoId: string,
  nombre: string,
  contentType: string,
  observacionId?: string,
): Promise<ResultadoAccion<DestinoSubida> | { ok: false; error: string; definitivo: true }> {
  const parseo = esquemaSubida.safeParse({ recorridoId, nombre, contentType, observacionId })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: ERROR_SESION }

  const cupoOk = await consumirCupo(supabase, 'subidas', CUPO_SUBIDAS_DIA)
  if (!cupoOk) return { ok: false, error: ERROR_CUPO_SUBIDAS, definitivo: true }

  try {
    const ruta = rutaEvidencia(user.id, parseo.data.recorridoId, parseo.data.nombre, parseo.data.observacionId)
    const destino = await obtenerProveedor().prepararSubida(ruta, parseo.data.contentType)
    return { ok: true, data: destino }
  } catch (error) {
    console.error('[recorrido]', error)
    return { ok: false, error: 'No se pudo preparar la subida de la evidencia.' }
  }
}

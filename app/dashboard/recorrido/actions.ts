'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { obtenerProveedor } from '@/lib/almacenamiento'
import type { DestinoSubida } from '@/lib/almacenamiento/tipos'
import { TIPOS_PERMITIDOS, rutaEvidencia } from '@/lib/archivos'
import { ErrorPlausibilidadCuadros, guardarCuadros, recalcularPuntosCuadros } from '@/lib/cuadros-servidor'
import {
  ERROR_SESION,
  buscarRecorrido,
  coordenadasDeTrack,
  marcarProcesado,
  procesarRecorrido,
  resumenGuardado,
  sesionYMunicipio,
  tramosDeMunicipio,
  type Contexto,
  type ResumenRecorrido,
} from '@/lib/recorrido-servidor'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/server'
import { evaluarPlausibilidad, kmDeTrack } from '@/lib/track'
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

/** Código Postgres de violación de unicidad (`unique_violation`). */
const CODIGO_DUPLICADO = '23505'

function revalidarDashboard(): void {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/mapa')
  revalidatePath('/dashboard/ranking')
}

/**
 * Cierra un recorrido: guarda el track, calcula cobertura, observaciones,
 * muestras de sensores, impactos, puntos e insignias.
 *
 * Antitrampa: antes de escribir nada se evalúa la plausibilidad física del
 * track (velocidad media, velocidad entre muestras, precisión y km totales).
 *
 * Idempotente por `id` (lo genera el cliente). El recorrido se marca con
 * `procesado_at` recién cuando terminó todo el post-procesado, así que:
 * - si ya existe y está procesado, devuelve el resumen recalculado sin escribir;
 * - si existe pero quedó a medias (`procesado_at` null, por un fallo previo o
 *   por una carrera entre dos envíos), se reprocesa; cada paso es idempotente.
 */
export async function finalizarRecorrido(payload: unknown): Promise<ResultadoRecorrido> {
  const parseo = esquemaRecorrido.safeParse(payload)
  if (!parseo.success) return { ok: false, error: primerError(parseo.error), definitivo: true }
  const datos = parseo.data

  const kmCrudo = kmDeTrack(coordenadasDeTrack(datos.track))
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

    const resumen = await procesarRecorrido(supabase, admin, ctx, datos, kmGuardado)
    await marcarProcesado(admin, ctx.recorridoId)
    revalidarDashboard()
    return { ok: true, data: resumen }
  } catch (error) {
    console.error('[recorrido]', error)
    return { ok: false, error: ERROR_GENERICO }
  }
}

/** Lo que devuelve `registrarCuadros`: cuántos se guardaron y los puntos del recorrido. */
export type RegistroCuadros = { registrados: number; puntos: number }
export type ResultadoCuadros = ResultadoAccion<RegistroCuadros>

const ERROR_CUADROS = 'No se pudieron registrar los cuadros. Intentá de nuevo.'
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
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }
  const datos = parseo.data

  const supabase = await crearClienteServidor()
  const sesion = await sesionYMunicipio(supabase)
  if ('error' in sesion) return { ok: false, error: sesion.error }

  const ctx: Contexto = { ...sesion, recorridoId: datos.recorridoId }

  try {
    const recorrido = await buscarRecorrido(supabase, ctx.recorridoId)
    // Sin recorrido no hay nada que registrar: la cola sube los cuadros recién
    // después de que el recorrido quedó guardado.
    if (!recorrido) return { ok: false, error: ERROR_CUADROS }
    if (recorrido.usuario_id !== ctx.usuarioId) {
      return { ok: false, error: ERROR_CUADROS_AJENOS }
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
      return { ok: false, error: ERROR_CUADROS_IMPLAUSIBLES }
    }
    return { ok: false, error: ERROR_CUADROS }
  }
}

const esquemaSubida = z.object({
  recorridoId: z.uuid({ message: 'Recorrido sin identificador válido' }),
  nombre: z.string().trim().min(1).max(200, { message: 'Nombre de archivo inválido' }),
  contentType: z.enum(TIPOS_PERMITIDOS, { message: 'Tipo de archivo no permitido' }),
})

/**
 * Devuelve una URL firmada para subir una evidencia del recorrido con un
 * `PUT` directo desde el navegador. El proveedor sale de `ALMACENAMIENTO`.
 */
export async function prepararSubida(
  recorridoId: string,
  nombre: string,
  contentType: string,
  observacionId?: string,
): Promise<ResultadoAccion<DestinoSubida>> {
  const parseo = esquemaSubida.safeParse({ recorridoId, nombre, contentType })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: ERROR_SESION }

  try {
    const ruta = rutaEvidencia(user.id, parseo.data.recorridoId, parseo.data.nombre, observacionId)
    const destino = await obtenerProveedor().prepararSubida(ruta, parseo.data.contentType)
    return { ok: true, data: destino }
  } catch (error) {
    console.error('[recorrido]', error)
    return { ok: false, error: 'No se pudo preparar la subida de la evidencia.' }
  }
}

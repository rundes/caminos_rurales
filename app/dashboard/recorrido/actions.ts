'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { obtenerProveedor } from '@/lib/almacenamiento'
import type { DestinoSubida } from '@/lib/almacenamiento/tipos'
import { TIPOS_PERMITIDOS, rutaEvidencia } from '@/lib/archivos'
import { calcularCobertura } from '@/lib/cobertura'
import { calcularPuntos, evaluarInsignias, limitarPorTopeDiario, totalPuntos } from '@/lib/juego'
import {
  aCoberturaPorLocalidad,
  clasificarTramos,
  contarConEvidencia,
  coordenadasDeTrack,
  filaObservacion,
  fraccionCubierta,
  kmDeTramos,
  partirCobertura,
  type FilaCoberturaLocalidad,
  type ParticionCobertura,
  type TramoMunicipio,
} from '@/lib/recorrido-servidor'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/server'
import { evaluarPlausibilidad, kmDeTrack } from '@/lib/track'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaRecorrido, primerError, type RecorridoPayload } from '@/lib/validaciones'

type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>
type ClienteAdmin = ReturnType<typeof crearClienteAdmin>

export type ResumenRecorrido = {
  km: number
  tramosNuevos: number
  tramosRepetidos: number
  puntos: number
  insignias: string[]
  /** Fracción de km del municipio ya relevados, entre 0 y 1. */
  coberturaMunicipio: number
}

type Contexto = { usuarioId: string; municipio: string; recorridoId: string }

/**
 * Resultado de `finalizarRecorrido`. Un fallo marcado `definitivo` no se
 * reintenta nunca: el payload es inválido, el recorrido es de otra persona o
 * el track no es físicamente plausible. Reintentarlo daría siempre lo mismo.
 */
export type ResultadoRecorrido =
  | ResultadoAccion<ResumenRecorrido>
  | { ok: false; error: string; definitivo: true }

const ERROR_SESION = 'Sesión vencida. Volvé a ingresar.'
const ERROR_PERFIL = 'No se pudo cargar tu perfil'
const ERROR_SIN_MUNICIPIO = 'Tu perfil no tiene un partido asignado'
const ERROR_GENERICO = 'No se pudo guardar el recorrido. Intentá de nuevo.'
const ERROR_AJENO = 'Ese recorrido ya fue registrado por otra persona.'
const ERROR_IMPLAUSIBLE = 'El recorrido no pudo validarse. Verificá el GPS y volvé a intentar.'

/** Código Postgres de violación de unicidad (`unique_violation`). */
const CODIGO_DUPLICADO = '23505'

/** Los tramos de un municipio casi no cambian: se cachean por proceso. */
const TTL_TRAMOS_MS = 10 * 60 * 1000
const cacheTramos = new Map<string, { expira: number; tramos: TramoMunicipio[] }>()

/**
 * Techo defensivo de filas leídas de `cobertura_tramos`: evita el límite
 * implícito de PostgREST (1000) en municipios con muchos recorridos.
 */
const MAX_FILAS_COBERTURA = 20000

/**
 * Ventana anti-farmeo: un tramo repetido no da puntos si el mismo usuario ya
 * lo cubrió dentro de las últimas 24 h.
 */
const VENTANA_REPETIDO_MS = 24 * 60 * 60 * 1000

async function sesionYMunicipio(
  supabase: ClienteServidor,
): Promise<{ usuarioId: string; municipio: string } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: ERROR_SESION }

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('municipio_id')
    .eq('id', user.id)
    .maybeSingle()
  if (error) {
    console.error('[recorrido]', error.message)
    return { error: ERROR_PERFIL }
  }
  if (!perfil?.municipio_id) return { error: ERROR_SIN_MUNICIPIO }

  return { usuarioId: user.id, municipio: perfil.municipio_id }
}

async function tramosDeMunicipio(admin: ClienteAdmin, municipio: string): Promise<TramoMunicipio[]> {
  const enCache = cacheTramos.get(municipio)
  if (enCache && enCache.expira > Date.now()) return enCache.tramos

  const { data, error } = await admin
    .from('tramos')
    .select('id, km, geometria, localidad')
    .eq('municipio', municipio)
  if (error) throw new Error(error.message)

  const tramos: TramoMunicipio[] = (data ?? []).map((t) => ({
    id: t.id,
    km: Number(t.km),
    localidad: t.localidad,
    geometria: t.geometria as [number, number][],
  }))
  cacheTramos.set(municipio, { expira: Date.now() + TTL_TRAMOS_MS, tramos })
  return tramos
}

async function tramosYaCubiertos(admin: ClienteAdmin, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data, error } = await admin
    .from('cobertura_tramos')
    .select('tramo_id')
    .in('tramo_id', [...ids])
    .limit(MAX_FILAS_COBERTURA)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((f) => f.tramo_id))
}

/** Tramos que el propio usuario ya cubrió dentro de la ventana anti-farmeo, restringido a `ids`. */
async function tramosCubiertosRecientePorUsuario(
  admin: ClienteAdmin,
  usuarioId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const desde = new Date(Date.now() - VENTANA_REPETIDO_MS).toISOString()
  const { data, error } = await admin
    .from('cobertura_tramos')
    .select('tramo_id')
    .eq('usuario_id', usuarioId)
    .in('tramo_id', [...ids])
    .gte('created_at', desde)
    .limit(MAX_FILAS_COBERTURA)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((f) => f.tramo_id))
}

async function coberturaPorLocalidad(
  supabase: ClienteServidor,
  municipio: string,
): Promise<FilaCoberturaLocalidad[]> {
  const { data, error } = await supabase.rpc('cobertura_municipio', { p_municipio: municipio })
  if (error) throw new Error(error.message)
  return (data ?? []) as FilaCoberturaLocalidad[]
}

type ParticionConPuntos = ParticionCobertura & { kmRepetidosConPuntos: number }

async function guardarCobertura(
  admin: ClienteAdmin,
  ctx: Contexto,
  datos: RecorridoPayload,
): Promise<ParticionConPuntos> {
  const tramos = await tramosDeMunicipio(admin, ctx.municipio)
  const { cubiertos } = calcularCobertura(coordenadasDeTrack(datos.track), tramos)
  const previos = await tramosYaCubiertos(admin, cubiertos)
  const previosUsuarioReciente = await tramosCubiertosRecientePorUsuario(admin, ctx.usuarioId, cubiertos)
  const particion = partirCobertura(tramos, cubiertos, previos)
  const clasificacion = clasificarTramos(cubiertos, previos, previosUsuarioReciente)
  const kmRepetidosConPuntos = kmDeTramos(tramos, clasificacion.repetidosConPuntos)

  if (cubiertos.length > 0) {
    const { error } = await admin.from('cobertura_tramos').upsert(
      cubiertos.map((tramo_id) => ({
        tramo_id,
        recorrido_id: ctx.recorridoId,
        usuario_id: ctx.usuarioId,
      })),
      { onConflict: 'tramo_id,recorrido_id', ignoreDuplicates: true },
    )
    if (error) throw new Error(error.message)
  }

  return { ...particion, kmRepetidosConPuntos }
}

async function guardarObservaciones(
  supabase: ClienteServidor,
  ctx: Contexto,
  datos: RecorridoPayload,
): Promise<void> {
  if (datos.observaciones.length === 0) return
  const filas = datos.observaciones.map((o) => filaObservacion(ctx.recorridoId, o))
  // Upsert por `id` (lo genera el cliente): un reprocesamiento no duplica filas.
  const { error } = await supabase
    .from('fallas_deteccion')
    .upsert(filas, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

/** Puntos que el usuario ya sumó en las últimas 24 h (para el tope diario). */
async function puntosDelDia(admin: ClienteAdmin, usuarioId: string): Promise<number> {
  const desde = new Date(Date.now() - VENTANA_REPETIDO_MS).toISOString()
  const { data, error } = await admin
    .from('puntos_eventos')
    .select('puntos')
    .eq('usuario_id', usuarioId)
    .gte('created_at', desde)
    .limit(MAX_FILAS_COBERTURA)
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((suma, e) => suma + Number(e.puntos), 0)
}

async function guardarPuntos(
  admin: ClienteAdmin,
  ctx: Contexto,
  particion: ParticionConPuntos,
  observacionesConEvidencia: number,
): Promise<number> {
  // Idempotencia: un reprocesamiento no debe duplicar los eventos del recorrido.
  const { error: errorBorrado } = await admin
    .from('puntos_eventos')
    .delete()
    .eq('recorrido_id', ctx.recorridoId)
  if (errorBorrado) throw new Error(errorBorrado.message)

  const eventos = calcularPuntos({
    kmNuevos: particion.kmNuevos,
    // Solo cuentan para puntos los repetidos que el usuario no cubrió en las últimas 24 h (anti-farmeo).
    kmRepetidos: particion.kmRepetidosConPuntos,
    observacionesConEvidencia,
  })
  if (eventos.length === 0) return 0

  // Antitrampa: tope diario de puntos por usuario. El excedente se trunca.
  const previos = await puntosDelDia(admin, ctx.usuarioId)
  const limitados = limitarPorTopeDiario(eventos, previos)
  const total = totalPuntos(limitados)
  if (total < totalPuntos(eventos)) {
    console.warn('[recorrido] tope diario de puntos alcanzado', {
      usuarioId: ctx.usuarioId,
      recorridoId: ctx.recorridoId,
      previos,
      solicitados: totalPuntos(eventos),
      otorgados: total,
    })
  }
  if (limitados.length === 0) return 0

  const { error } = await admin.from('puntos_eventos').insert(
    limitados.map((e) => ({
      usuario_id: ctx.usuarioId,
      municipio: ctx.municipio,
      recorrido_id: ctx.recorridoId,
      motivo: e.motivo,
      puntos: e.puntos,
    })),
  )
  if (error) throw new Error(error.message)
  return total
}

async function totalesUsuario(
  admin: ClienteAdmin,
  usuarioId: string,
): Promise<{ km: number; recorridos: number; logros: string[] }> {
  const { data: recorridos, error: errorRecorridos } = await admin
    .from('recorridos')
    .select('km')
    .eq('usuario_id', usuarioId)
  if (errorRecorridos) throw new Error(errorRecorridos.message)

  const { data: logros, error: errorLogros } = await admin
    .from('logros')
    .select('codigo')
    .eq('usuario_id', usuarioId)
  if (errorLogros) throw new Error(errorLogros.message)

  return {
    km: (recorridos ?? []).reduce((suma, r) => suma + Number(r.km), 0),
    recorridos: (recorridos ?? []).length,
    logros: (logros ?? []).map((l) => l.codigo),
  }
}

async function guardarInsignias(
  admin: ClienteAdmin,
  ctx: Contexto,
  filas: readonly FilaCoberturaLocalidad[],
): Promise<string[]> {
  const totales = await totalesUsuario(admin, ctx.usuarioId)
  const nuevas = evaluarInsignias({
    esPrimerRecorrido: totales.recorridos <= 1,
    kmTotalesUsuario: totales.km,
    coberturaPorLocalidad: aCoberturaPorLocalidad(filas),
    yaObtenidas: totales.logros,
  })
  if (nuevas.length === 0) return []

  const { error } = await admin.from('logros').upsert(
    nuevas.map((codigo) => ({ usuario_id: ctx.usuarioId, codigo })),
    { onConflict: 'usuario_id,codigo', ignoreDuplicates: true },
  )
  if (error) throw new Error(error.message)
  return nuevas
}

async function procesarRecorrido(
  supabase: ClienteServidor,
  admin: ClienteAdmin,
  ctx: Contexto,
  datos: RecorridoPayload,
  km: number,
): Promise<ResumenRecorrido> {
  const particion = await guardarCobertura(admin, ctx, datos)
  await guardarObservaciones(supabase, ctx, datos)
  const puntos = await guardarPuntos(admin, ctx, particion, contarConEvidencia(datos.observaciones))
  const filas = await coberturaPorLocalidad(supabase, ctx.municipio)
  const insignias = await guardarInsignias(admin, ctx, filas)

  return {
    km,
    tramosNuevos: particion.nuevos.length,
    tramosRepetidos: particion.repetidos.length,
    puntos,
    insignias,
    coberturaMunicipio: fraccionCubierta(filas),
  }
}

/** Reparte los tramos de un recorrido ya guardado entre primeros y repetidos. */
async function clasificarCoberturaGuardada(
  admin: ClienteAdmin,
  recorridoId: string,
): Promise<{ nuevos: number; repetidos: number }> {
  const { data: propios, error } = await admin
    .from('cobertura_tramos')
    .select('tramo_id')
    .eq('recorrido_id', recorridoId)
  if (error) throw new Error(error.message)

  const ids = (propios ?? []).map((f) => f.tramo_id)
  if (ids.length === 0) return { nuevos: 0, repetidos: 0 }

  const { data: todas, error: errorTodas } = await admin
    .from('cobertura_tramos')
    .select('tramo_id, recorrido_id, created_at')
    .in('tramo_id', ids)
    .limit(MAX_FILAS_COBERTURA)
  if (errorTodas) throw new Error(errorTodas.message)

  const primera = new Map<string, { recorrido_id: string; created_at: string }>()
  for (const fila of todas ?? []) {
    const actual = primera.get(fila.tramo_id)
    if (!actual || fila.created_at < actual.created_at) {
      primera.set(fila.tramo_id, { recorrido_id: fila.recorrido_id, created_at: fila.created_at })
    }
  }

  const nuevos = ids.filter((id) => primera.get(id)?.recorrido_id === recorridoId).length
  return { nuevos, repetidos: ids.length - nuevos }
}

/**
 * Resumen reducido para una reentrega del mismo recorrido: se recalcula desde
 * la base. Las insignias vuelven vacías porque `logros` no registra con qué
 * recorrido se otorgaron (ya se otorgaron en la primera llamada).
 */
async function resumenGuardado(
  supabase: ClienteServidor,
  admin: ClienteAdmin,
  ctx: Contexto,
  km: number,
): Promise<ResumenRecorrido> {
  const { nuevos, repetidos } = await clasificarCoberturaGuardada(admin, ctx.recorridoId)

  const { data: eventos, error } = await admin
    .from('puntos_eventos')
    .select('puntos')
    .eq('recorrido_id', ctx.recorridoId)
  if (error) throw new Error(error.message)

  const filas = await coberturaPorLocalidad(supabase, ctx.municipio)
  return {
    km,
    tramosNuevos: nuevos,
    tramosRepetidos: repetidos,
    puntos: (eventos ?? []).reduce((suma, e) => suma + Number(e.puntos), 0),
    insignias: [],
    coberturaMunicipio: fraccionCubierta(filas),
  }
}

/** Fila mínima de `recorridos` que necesita el flujo de finalización. */
type RecorridoExistente = { usuario_id: string; km: number; procesado_at: string | null }

async function buscarRecorrido(
  supabase: ClienteServidor,
  id: string,
): Promise<RecorridoExistente | null> {
  const { data, error } = await supabase
    .from('recorridos')
    .select('id, usuario_id, km, procesado_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    usuario_id: data.usuario_id,
    km: Number(data.km),
    procesado_at: data.procesado_at ?? null,
  }
}

/** Sella el recorrido como procesado. Es la última escritura del flujo. */
async function marcarProcesado(admin: ClienteAdmin, recorridoId: string): Promise<void> {
  const { error } = await admin
    .from('recorridos')
    .update({ procesado_at: new Date().toISOString() })
    .eq('id', recorridoId)
  if (error) throw new Error(error.message)
}

function revalidarDashboard(): void {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/mapa')
  revalidatePath('/dashboard/ranking')
}

/**
 * Cierra un recorrido: guarda el track, calcula cobertura, observaciones,
 * puntos e insignias.
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

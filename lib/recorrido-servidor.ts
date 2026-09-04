import { calcularCobertura, type TramoGeometria } from './cobertura'
import type { Coordenada } from './geo'
import {
  calcularPuntos,
  evaluarInsignias,
  kmConSensores,
  limitarPorTopeDiario,
  totalPuntos,
  type CoberturaLocalidad,
} from './juego'
import { guardarSensores, sensoresGuardados } from './recorrido-sensores-servidor'
import { normalizarMuestra } from './sensores/calidad'
import type { CalidadSegmento } from './sensores/tipos'
import type { crearClienteAdmin } from './supabase/admin'
import type { crearClienteServidor } from './supabase/server'
import type { Observacion, RecorridoPayload } from './validaciones'

export type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>
export type ClienteAdmin = ReturnType<typeof crearClienteAdmin>

/** Identidad del recorrido que se está procesando. */
export type Contexto = { usuarioId: string; municipio: string; recorridoId: string }

export type TramoMunicipio = TramoGeometria & { localidad: string }

/** Fila que devuelve la función SQL `cobertura_municipio(p_municipio)`. */
export type FilaCoberturaLocalidad = {
  localidad: string
  tramos: number
  cubiertos: number
  km: number
  km_cubiertos: number
}

export type ParticionCobertura = {
  nuevos: string[]
  repetidos: string[]
  kmNuevos: number
  kmRepetidos: number
}

/** Convierte el track del payload (`[lat, lng][]`) a coordenadas. */
export function coordenadasDeTrack(track: readonly [number, number][]): Coordenada[] {
  return track.map(([lat, lng]) => ({ lat, lng }))
}

/**
 * Separa los tramos cubiertos por este recorrido entre los que nadie había
 * cubierto antes en el municipio y los repetidos, sumando sus km.
 */
export function partirCobertura(
  tramos: readonly TramoMunicipio[],
  cubiertos: readonly string[],
  yaCubiertos: ReadonlySet<string>,
): ParticionCobertura {
  const porId = new Map(tramos.map((t) => [t.id, t]))
  const particion: ParticionCobertura = { nuevos: [], repetidos: [], kmNuevos: 0, kmRepetidos: 0 }

  for (const id of cubiertos) {
    const km = porId.get(id)?.km ?? 0
    if (yaCubiertos.has(id)) {
      particion.repetidos.push(id)
      particion.kmRepetidos += km
    } else {
      particion.nuevos.push(id)
      particion.kmNuevos += km
    }
  }

  return particion
}

export type ClasificacionTramos = {
  nuevos: string[]
  repetidosConPuntos: string[]
  repetidosSinPuntos: string[]
}

/**
 * Separa los tramos cubiertos en nuevos (nadie los había cubierto en el
 * municipio) y repetidos; entre los repetidos distingue los que dan puntos de
 * los que no. Anti-farmeo: un repetido no da puntos si el mismo usuario ya
 * cubrió ese tramo en las últimas 24 h (`previosUsuarioReciente`).
 */
export function clasificarTramos(
  cubiertos: readonly string[],
  previosMunicipio: ReadonlySet<string>,
  previosUsuarioReciente: ReadonlySet<string>,
): ClasificacionTramos {
  const nuevos: string[] = []
  const repetidosConPuntos: string[] = []
  const repetidosSinPuntos: string[] = []

  for (const id of cubiertos) {
    if (!previosMunicipio.has(id)) {
      nuevos.push(id)
    } else if (previosUsuarioReciente.has(id)) {
      repetidosSinPuntos.push(id)
    } else {
      repetidosConPuntos.push(id)
    }
  }

  return { nuevos, repetidosConPuntos, repetidosSinPuntos }
}

/** Suma los km de los tramos indicados por id (ignora ids desconocidos). */
export function kmDeTramos(tramos: readonly TramoMunicipio[], ids: readonly string[]): number {
  const porId = new Map(tramos.map((t) => [t.id, t.km]))
  return ids.reduce((suma, id) => suma + (porId.get(id) ?? 0), 0)
}

/** Fracción de km cubiertos sobre el total del municipio, entre 0 y 1. */
export function fraccionCubierta(filas: readonly FilaCoberturaLocalidad[]): number {
  const total = filas.reduce((suma, f) => suma + Number(f.km), 0)
  if (total <= 0) return 0
  const cubiertos = filas.reduce((suma, f) => suma + Number(f.km_cubiertos), 0)
  return Math.min(1, cubiertos / total)
}

/** Adapta las filas SQL al formato que espera `evaluarInsignias`. */
export function aCoberturaPorLocalidad(
  filas: readonly FilaCoberturaLocalidad[],
): CoberturaLocalidad[] {
  return filas.map((f) => ({
    localidad: f.localidad,
    tramos: Number(f.tramos),
    cubiertos: Number(f.cubiertos),
  }))
}

export type FilaObservacion = {
  id: string
  recorrido_id: string
  tipo_falla: Observacion['tipo_falla']
  severidad: Observacion['severidad']
  latitud: number
  longitud: number
  descripcion: string | null
  url_evidencia_imagen: string | null
  url_evidencia_video: string | null
}

/** Fila de `fallas_deteccion` para una observación del recorrido. */
export function filaObservacion(recorridoId: string, observacion: Observacion): FilaObservacion {
  const evidencia = observacion.evidencia
  return {
    id: observacion.id,
    recorrido_id: recorridoId,
    tipo_falla: observacion.tipo_falla,
    severidad: observacion.severidad,
    latitud: observacion.latitud,
    longitud: observacion.longitud,
    descripcion: observacion.descripcion ?? null,
    url_evidencia_imagen: evidencia?.tipo === 'imagen' ? evidencia.ruta : null,
    url_evidencia_video: evidencia?.tipo === 'video' ? evidencia.ruta : null,
  }
}

/** Cantidad de observaciones que traen evidencia adjunta (puntúan distinto). */
export function contarConEvidencia(observaciones: readonly Observacion[]): number {
  return observaciones.filter((o) => o.evidencia !== undefined).length
}

// ---------------------------------------------------------------------------
// Flujo de finalización contra la base. Vive acá y no en la server action para
// que `actions.ts` quede con la orquestación (validar, insertar, sellar) y nada
// más. El cliente del usuario escribe lo que las políticas RLS le permiten
// (recorrido, observaciones, muestras); el admin escribe lo que solo el
// servidor puede tocar (cobertura, puntos, logros).
// ---------------------------------------------------------------------------

export const ERROR_SESION = 'Sesión vencida. Volvé a ingresar.'
const ERROR_PERFIL = 'No se pudo cargar tu perfil'
const ERROR_SIN_MUNICIPIO = 'Tu perfil no tiene un partido asignado'

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
 * lo cubrió dentro de las últimas 24 h. Es también la ventana del tope diario.
 */
const VENTANA_REPETIDO_MS = 24 * 60 * 60 * 1000

export type ResumenRecorrido = {
  km: number
  tramosNuevos: number
  tramosRepetidos: number
  puntos: number
  insignias: string[]
  /** Fracción de km del municipio ya relevados, entre 0 y 1. */
  coberturaMunicipio: number
  /** Km recorridos con cada calidad estimada por los sensores. */
  kmPorCalidad: Record<CalidadSegmento, number>
  /** Impactos detectados automáticamente durante el recorrido. */
  impactos: number
}

/** Sesión y partido del usuario, o el mensaje de error que corresponde. */
export async function sesionYMunicipio(
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

/** Tramos del municipio, cacheados por proceso (ver `TTL_TRAMOS_MS`). */
export async function tramosDeMunicipio(
  admin: ClienteAdmin,
  municipio: string,
): Promise<TramoMunicipio[]> {
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
  tramos: readonly TramoMunicipio[],
): Promise<ParticionConPuntos> {
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
  const { error } = await supabase.from('fallas_deteccion').upsert(filas, { onConflict: 'id' })
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
  sensor: { kmSensor: number; kmRecorrido: number },
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
    kmSensor: sensor.kmSensor,
    kmRecorrido: sensor.kmRecorrido,
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

/** Post-procesado completo: cobertura, observaciones, sensores, puntos, insignias. */
export async function procesarRecorrido(
  supabase: ClienteServidor,
  admin: ClienteAdmin,
  ctx: Contexto,
  datos: RecorridoPayload,
  km: number,
): Promise<ResumenRecorrido> {
  const tramos = await tramosDeMunicipio(admin, ctx.municipio)
  const particion = await guardarCobertura(admin, ctx, datos, tramos)
  await guardarObservaciones(supabase, ctx, datos)
  const sensores = await guardarSensores(supabase, ctx, datos, tramos)
  const puntos = await guardarPuntos(
    admin,
    ctx,
    particion,
    contarConEvidencia(datos.observaciones),
    // Muestras normalizadas por el servidor: la calidad declarada por el cliente no cuenta.
    { kmSensor: kmConSensores((datos.muestras ?? []).map(normalizarMuestra), km), kmRecorrido: km },
  )
  const filas = await coberturaPorLocalidad(supabase, ctx.municipio)
  const insignias = await guardarInsignias(admin, ctx, filas)

  return {
    km,
    tramosNuevos: particion.nuevos.length,
    tramosRepetidos: particion.repetidos.length,
    puntos,
    insignias,
    coberturaMunicipio: fraccionCubierta(filas),
    kmPorCalidad: sensores.kmPorCalidad,
    impactos: sensores.impactos,
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
export async function resumenGuardado(
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

  const sensores = await sensoresGuardados(admin, ctx.recorridoId)
  const filas = await coberturaPorLocalidad(supabase, ctx.municipio)
  return {
    km,
    tramosNuevos: nuevos,
    tramosRepetidos: repetidos,
    puntos: (eventos ?? []).reduce((suma, e) => suma + Number(e.puntos), 0),
    insignias: [],
    coberturaMunicipio: fraccionCubierta(filas),
    kmPorCalidad: sensores.kmPorCalidad,
    impactos: sensores.impactos,
  }
}

/** Fila mínima de `recorridos` que necesita el flujo de finalización. */
export type RecorridoExistente = { usuario_id: string; km: number; procesado_at: string | null }

export async function buscarRecorrido(
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
export async function marcarProcesado(admin: ClienteAdmin, recorridoId: string): Promise<void> {
  const { error } = await admin
    .from('recorridos')
    .update({ procesado_at: new Date().toISOString() })
    .eq('id', recorridoId)
  if (error) throw new Error(error.message)
}

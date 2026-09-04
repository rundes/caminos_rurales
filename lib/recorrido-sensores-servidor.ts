import type { TramoGeometria } from './cobertura'
import { distanciaKm } from './geo'
import type { ClienteAdmin, ClienteServidor, Contexto } from './recorrido-servidor'
import { crearAsignadorTramos, type AsignadorTramos } from './sensores/asignacion'
import { severidadDeImpacto } from './sensores/calidad'
import type { CalidadSegmento } from './sensores/tipos'
import { MAX_MUESTRAS } from './sensores/umbrales'
import type { Severidad } from './tipos'
import type { ImpactoPayload, MuestraPayload, RecorridoPayload } from './validaciones'

/** Fila de `muestras_sensor`: un segmento agregado ya asignado a un tramo. */
export type FilaMuestraSensor = {
  recorrido_id: string
  usuario_id: string
  tramo_id: string | null
  t: string
  latitud: number
  longitud: number
  velocidad_kmh: number
  rumbo: number | null
  altitud: number | null
  rms_vertical: number
  pico_vertical: number
  frenadas: number
  laterales: number
  muestras: number
  calidad: CalidadSegmento
}

/** Fila de `fallas_deteccion` para un impacto detectado por el acelerómetro. */
export type FilaImpactoSensor = {
  recorrido_id: string
  tipo_falla: 'bache'
  severidad: Severidad
  latitud: number
  longitud: number
  descripcion: string
  origen: 'sensor'
  magnitud: number
  tramo_id: string | null
}

export type ResumenSensores = {
  kmPorCalidad: Record<CalidadSegmento, number>
  impactos: number
}

/** Postgrest no acepta inserciones enormes de una sola vez. */
const LOTE_MUESTRAS = 500

/** Km recorridos con cada calidad estimada. */
export function kmPorCalidad(
  muestras: readonly Pick<MuestraPayload, 'lat' | 'lng' | 'calidad'>[],
): Record<CalidadSegmento, number> {
  const acumulado: Record<CalidadSegmento, number> = {
    sin_dato: 0,
    bueno: 0,
    regular: 0,
    malo: 0,
    intransitable: 0,
  }

  // Cada muestra cierra un segmento: aporta el tramo que va de la anterior a ella.
  for (let i = 1; i < muestras.length; i += 1) {
    acumulado[muestras[i].calidad] += distanciaKm(muestras[i - 1], muestras[i])
  }

  return {
    sin_dato: Number(acumulado.sin_dato.toFixed(3)),
    bueno: Number(acumulado.bueno.toFixed(3)),
    regular: Number(acumulado.regular.toFixed(3)),
    malo: Number(acumulado.malo.toFixed(3)),
    intransitable: Number(acumulado.intransitable.toFixed(3)),
  }
}

/** Texto de la observación automática que deja un impacto. */
export function descripcionImpacto(impacto: ImpactoPayload): string {
  return `Impacto detectado: ${impacto.pico.toFixed(1)} m/s² a ${Math.round(impacto.velocidadKmh)} km/h`
}

export function filasMuestras(
  ctx: Contexto,
  muestras: readonly MuestraPayload[],
  asignador: AsignadorTramos,
): FilaMuestraSensor[] {
  return muestras.map((m) => ({
    recorrido_id: ctx.recorridoId,
    usuario_id: ctx.usuarioId,
    tramo_id: asignador.tramoDe(m),
    t: new Date(m.t).toISOString(),
    latitud: m.lat,
    longitud: m.lng,
    velocidad_kmh: m.velocidadKmh,
    rumbo: m.rumbo,
    altitud: m.altitud,
    rms_vertical: m.rmsVertical,
    pico_vertical: m.picoVertical,
    frenadas: m.frenadas,
    laterales: m.laterales,
    muestras: m.muestras,
    calidad: m.calidad,
  }))
}

export function filasImpactos(
  recorridoId: string,
  impactos: readonly ImpactoPayload[],
  asignador: AsignadorTramos,
): FilaImpactoSensor[] {
  return impactos.map((i) => ({
    recorrido_id: recorridoId,
    tipo_falla: 'bache',
    severidad: severidadDeImpacto(i.pico),
    latitud: i.lat,
    longitud: i.lng,
    descripcion: descripcionImpacto(i),
    origen: 'sensor',
    magnitud: i.pico,
    tramo_id: asignador.tramoDe(i),
  }))
}

function enLotes<T>(filas: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < filas.length; i += tamano) lotes.push(filas.slice(i, i + tamano))
  return lotes
}

/**
 * Idempotencia: reprocesar un recorrido reemplaza sus muestras y sus
 * observaciones automáticas. Las manuales llevan el id que generó el cliente y
 * se resuelven por upsert, así que no se tocan.
 */
async function borrarSensoresPrevios(
  supabase: ClienteServidor,
  recorridoId: string,
): Promise<void> {
  const { error } = await supabase.from('muestras_sensor').delete().eq('recorrido_id', recorridoId)
  if (error) throw new Error(error.message)

  const { error: errorFallas } = await supabase
    .from('fallas_deteccion')
    .delete()
    .eq('recorrido_id', recorridoId)
    .eq('origen', 'sensor')
  if (errorFallas) throw new Error(errorFallas.message)
}

/**
 * Guarda los segmentos e impactos del recorrido con el cliente del usuario
 * (las políticas exigen que el recorrido sea suyo) asignando cada uno al tramo
 * más cercano.
 */
export async function guardarSensores(
  supabase: ClienteServidor,
  ctx: Contexto,
  datos: RecorridoPayload,
  tramos: readonly TramoGeometria[],
): Promise<ResumenSensores> {
  const muestras = datos.muestras ?? []
  const impactos = datos.impactos ?? []

  await borrarSensoresPrevios(supabase, ctx.recorridoId)
  if (muestras.length === 0 && impactos.length === 0) {
    return { kmPorCalidad: kmPorCalidad([]), impactos: 0 }
  }

  const asignador = crearAsignadorTramos(tramos)

  for (const lote of enLotes(filasMuestras(ctx, muestras, asignador), LOTE_MUESTRAS)) {
    const { error } = await supabase.from('muestras_sensor').insert(lote)
    if (error) throw new Error(error.message)
  }

  if (impactos.length > 0) {
    const { error } = await supabase
      .from('fallas_deteccion')
      .insert(filasImpactos(ctx.recorridoId, impactos, asignador))
    if (error) throw new Error(error.message)
  }

  return { kmPorCalidad: kmPorCalidad(muestras), impactos: impactos.length }
}

/** Reconstruye el resumen de sensores de un recorrido ya procesado. */
export async function sensoresGuardados(
  admin: ClienteAdmin,
  recorridoId: string,
): Promise<ResumenSensores> {
  const { data: muestras, error } = await admin
    .from('muestras_sensor')
    .select('latitud, longitud, calidad')
    .eq('recorrido_id', recorridoId)
    .order('t', { ascending: true })
    .limit(MAX_MUESTRAS)
  if (error) throw new Error(error.message)

  const { data: impactos, error: errorImpactos } = await admin
    .from('fallas_deteccion')
    .select('id')
    .eq('recorrido_id', recorridoId)
    .eq('origen', 'sensor')
  if (errorImpactos) throw new Error(errorImpactos.message)

  const puntos = (muestras ?? []).map((m) => ({
    lat: Number(m.latitud),
    lng: Number(m.longitud),
    calidad: m.calidad,
  }))
  return { kmPorCalidad: kmPorCalidad(puntos), impactos: (impactos ?? []).length }
}

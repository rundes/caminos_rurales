import type { TramoGeometria } from './cobertura'
import type { Coordenada } from './geo'
import type { CoberturaLocalidad } from './juego'
import type { Observacion } from './validaciones'

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

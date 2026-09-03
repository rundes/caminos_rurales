import type { PuntoFalla, Severidad, TipoFalla } from './tipos'

export type FilaFalla = {
  id: string
  tipo_falla: TipoFalla
  severidad: Severidad
  latitud: number
  longitud: number
  url_evidencia_imagen: string | null
  created_at: string | null
  relevamientos: { fecha: string; caminos: { municipio: string } | null } | null
}

export type FiltrosFallas = { tipo?: string; municipio?: string }

export function aPuntos(filas: readonly FilaFalla[]): PuntoFalla[] {
  return filas.map((f) => ({
    id: f.id,
    tipo_falla: f.tipo_falla,
    severidad: f.severidad,
    latitud: Number(f.latitud),
    longitud: Number(f.longitud),
    fecha: f.relevamientos?.fecha ?? f.created_at ?? '',
    url_evidencia_imagen: f.url_evidencia_imagen,
    municipio: f.relevamientos?.caminos?.municipio ?? 'desconocido',
  }))
}

export function filtrarPuntos(puntos: readonly PuntoFalla[], filtros: FiltrosFallas): PuntoFalla[] {
  return puntos.filter(
    (p) => (!filtros.tipo || p.tipo_falla === filtros.tipo) && (!filtros.municipio || p.municipio === filtros.municipio),
  )
}

export function municipiosDe(puntos: readonly PuntoFalla[]): string[] {
  return [...new Set(puntos.map((p) => p.municipio))].sort()
}

import type { EstadoObservacion, OrigenObservacion, PuntoFalla, Severidad, TipoFalla } from './tipos'

export type FilaFalla = {
  id: string
  tipo_falla: TipoFalla
  severidad: Severidad
  latitud: number
  longitud: number
  url_evidencia_imagen: string | null
  url_evidencia_video: string | null
  created_at: string | null
  recorridos: { inicio: string; municipio: string } | null
  origen: OrigenObservacion
  magnitud: number | null
  estado: EstadoObservacion
}

/**
 * Filtros del mapa/observaciones. `desde`/`hasta` son fechas `aaaa-mm-dd`
 * (el valor crudo de un `<input type="date">`) y se comparan contra la
 * porción de fecha de `PuntoFalla.fecha` (sin hora): así un `hasta` del
 * mismo día incluye toda esa jornada en vez de cortar a medianoche UTC.
 */
export type FiltrosFallas = {
  tipo?: string
  severidad?: string
  origen?: string
  estado?: string
  desde?: string
  hasta?: string
}

export function aPuntos(filas: readonly FilaFalla[]): PuntoFalla[] {
  return filas.map((f) => ({
    id: f.id,
    tipo_falla: f.tipo_falla,
    severidad: f.severidad,
    latitud: Number(f.latitud),
    longitud: Number(f.longitud),
    fecha: f.recorridos?.inicio ?? f.created_at ?? '',
    url_evidencia_imagen: f.url_evidencia_imagen,
    url_evidencia_video: f.url_evidencia_video,
    municipio: f.recorridos?.municipio ?? 'desconocido',
    origen: f.origen,
    magnitud: f.magnitud === null || f.magnitud === undefined ? null : Number(f.magnitud),
    estado: f.estado,
  }))
}

/**
 * Devuelve `valor` si está entre `permitidos`, o `undefined` si no vino o no
 * es un miembro válido. Guarda de límite para construir consultas tipadas
 * (`.eq('columna', valor)`) a partir de un `searchParams` de la URL, que
 * llega como `string` sin garantía de pertenecer al enum de la columna.
 */
export function filtroValido<T extends string>(valor: string | undefined, permitidos: readonly T[]): T | undefined {
  if (!valor) return undefined
  return (permitidos as readonly string[]).includes(valor) ? (valor as T) : undefined
}

export function filtrarPuntos(puntos: readonly PuntoFalla[], filtros: FiltrosFallas): PuntoFalla[] {
  return puntos.filter((p) => {
    if (filtros.tipo && p.tipo_falla !== filtros.tipo) return false
    if (filtros.severidad && p.severidad !== filtros.severidad) return false
    if (filtros.origen && p.origen !== filtros.origen) return false
    if (filtros.estado && p.estado !== filtros.estado) return false
    const fecha = p.fecha.slice(0, 10)
    if (filtros.desde && fecha < filtros.desde) return false
    if (filtros.hasta && fecha > filtros.hasta) return false
    return true
  })
}

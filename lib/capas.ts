export type CapasMunicipio = {
  caminos?: string
  localidades?: string
  limite?: string
  redProvincial?: string
}

const CAPAS: Record<string, CapasMunicipio> = {
  maipu: {
    caminos: '/capas/maipu/caminos.geojson',
    localidades: '/capas/maipu/localidades.geojson',
    limite: '/capas/maipu/limite.geojson',
    redProvincial: '/capas/maipu/red-provincial.geojson',
  },
}

/** Devuelve las capas GeoJSON registradas para un municipio, o null si no tiene. */
export function capasDe(municipio: string | null | undefined): CapasMunicipio | null {
  if (!municipio) return null
  return CAPAS[municipio] ?? null
}

export const TESELAS_IGN = {
  url: 'https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{y}.png',
  tms: true,
  maxNativeZoom: 15,
  maxZoom: 19,
  attribution:
    'Mapa del <a href="https://www.ign.gob.ar">IGN</a> · &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}

const COLOR_NO_PAVIMENTADO = '#8d6e63'
const COLOR_PAVIMENTADO = '#546e7a'
const COLOR_DESCONOCIDO = '#a1887f'

const SUPERFICIES_PAVIMENTADAS = new Set(['paved', 'asphalt', 'concrete'])

/** Color según la superficie OSM del tramo: pavimentado, no pavimentado o desconocida. */
export function colorSuperficie(surface: string | null): string {
  if (!surface) return COLOR_DESCONOCIDO
  if (surface === 'unpaved') return COLOR_NO_PAVIMENTADO
  if (SUPERFICIES_PAVIMENTADAS.has(surface)) return COLOR_PAVIMENTADO
  return COLOR_DESCONOCIDO
}

const COLOR_RED_PAVIMENTADO = '#1e40af'
const COLOR_RED_CONSOLIDADO = '#7c3aed'
const COLOR_RED_TIERRA = '#b45309'

const COLORES_RED_PROVINCIAL: Record<string, string> = {
  pavimentado: COLOR_RED_PAVIMENTADO,
  consolidado: COLOR_RED_CONSOLIDADO,
  tierra: COLOR_RED_TIERRA,
}

/** Color según la superficie decodificada de un tramo de la red vial provincial (IGN/DVP). */
export function colorRedProvincial(superficie: string | null): string {
  if (!superficie) return COLOR_RED_TIERRA
  return COLORES_RED_PROVINCIAL[superficie] ?? COLOR_RED_TIERRA
}

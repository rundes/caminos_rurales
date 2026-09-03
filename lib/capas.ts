export type CapasMunicipio = { caminos?: string; localidades?: string }

const CAPAS: Record<string, CapasMunicipio> = {
  maipu: { caminos: '/capas/maipu/caminos.geojson', localidades: '/capas/maipu/localidades.geojson' },
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

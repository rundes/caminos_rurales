'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { colorCalidad } from '@/lib/sensores/colores'
import type { CalidadSegmento } from '@/lib/sensores/tipos'
import { colorSeveridad } from '@/lib/severidad'
import { ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_FALLA, type Severidad, type TipoFalla } from '@/lib/tipos'

export type ObservacionTramoMapa = {
  id: string
  latitud: number
  longitud: number
  tipo_falla: TipoFalla
  severidad: Severidad
}

type Props = {
  geometria: [number, number][] // [lng, lat], tal como llega de `tramos.geometria`
  calidad: CalidadSegmento
  observaciones: ObservacionTramoMapa[]
}

const URL_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATRIBUCION_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const ZOOM_INICIAL = 15
const RADIO_OBSERVACION = 8
const PESO_TRAMO = 5
const CENTRO_PROVINCIA: [number, number] = [-36.6, -60.0]

/** Encuadra el mapa en la geometría del tramo una sola vez al montar. */
function EnfoqueTramo({ posiciones }: { posiciones: [number, number][] }) {
  const map = useMap()

  useEffect(() => {
    if (posiciones.length > 0) map.fitBounds(posiciones)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberado: encuadrar solo al montar
  }, [])

  return null
}

/** Mapa enfocado de un único tramo: su recorrido y las observaciones asociadas. */
export function MapaTramo({ geometria, calidad, observaciones }: Props) {
  const posiciones = geometria.map(([lng, lat]) => [lat, lng] as [number, number])
  const centro = posiciones[0] ?? CENTRO_PROVINCIA

  return (
    <MapContainer center={centro} zoom={ZOOM_INICIAL} className="h-[40dvh] w-full rounded-2xl" scrollWheelZoom preferCanvas>
      <TileLayer attribution={ATRIBUCION_OSM} url={URL_OSM} />
      {posiciones.length > 0 && <EnfoqueTramo posiciones={posiciones} />}
      {posiciones.length > 0 && (
        <Polyline positions={posiciones} pathOptions={{ color: colorCalidad(calidad), weight: PESO_TRAMO }} />
      )}
      {observaciones.map((o) => (
        <CircleMarker
          key={o.id}
          center={[o.latitud, o.longitud]}
          radius={RADIO_OBSERVACION}
          pathOptions={{ color: colorSeveridad(o.severidad), fillColor: colorSeveridad(o.severidad), fillOpacity: 0.8 }}
        >
          <Popup>
            {ETIQUETA_TIPO_FALLA[o.tipo_falla]} · {ETIQUETA_SEVERIDAD[o.severidad]}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}

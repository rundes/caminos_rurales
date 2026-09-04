'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { CapasMunicipio } from '@/components/CapasMunicipio'
import { TESELAS_IGN, type CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'

export type Posicion = [number, number]

type Props = {
  centro: Posicion
  track: Posicion[]
  posicion: Posicion | null
  capas?: CapasMunicipioTipo | null
  seguir?: boolean
  /** Impactos recientes detectados por los sensores, para marcarlos en vivo. */
  impactos?: readonly Posicion[]
  /** Se llama cuando la persona arrastra el mapa: corta el seguimiento. */
  onArrastrar?: () => void
}

const ZOOM_RECORRIDO = 15
const COLOR_TRACK = '#166534'
const PESO_TRACK = 5
const COLOR_POSICION = '#2563eb'
const RADIO_POSICION = 8
const COLOR_IMPACTO = '#dc2626'
const RADIO_IMPACTO = 4

/** Recentra el mapa en la posición actual mientras el seguimiento esté activo. */
function Seguidor({ posicion, seguir }: { posicion: Posicion | null; seguir: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (!seguir || !posicion) return
    map.setView(posicion, map.getZoom())
  }, [map, posicion, seguir])

  return null
}

/** Corta el seguimiento en cuanto la persona mueve el mapa con el dedo. */
function DetectorArrastre({ onArrastrar }: { onArrastrar?: () => void }) {
  useMapEvents({
    dragstart: () => onArrastrar?.(),
  })
  return null
}

/** Mapa en vivo del recorrido: base IGN, capas del municipio, traza y posición. */
export function MapaRecorrido({
  centro,
  track,
  posicion,
  capas,
  seguir = true,
  impactos = [],
  onArrastrar,
}: Props) {
  return (
    <MapContainer
      center={posicion ?? centro}
      zoom={ZOOM_RECORRIDO}
      className="h-[45dvh] w-full rounded-2xl"
      scrollWheelZoom
    >
      <TileLayer
        attribution={TESELAS_IGN.attribution}
        url={TESELAS_IGN.url}
        tms={TESELAS_IGN.tms}
        maxNativeZoom={TESELAS_IGN.maxNativeZoom}
        maxZoom={TESELAS_IGN.maxZoom}
      />
      {capas && <CapasMunicipio capas={capas} />}
      {track.length > 1 && (
        <Polyline positions={track} pathOptions={{ color: COLOR_TRACK, weight: PESO_TRACK }} />
      )}
      {impactos.map(([lat, lng]) => (
        <CircleMarker
          key={`${lat},${lng}`}
          center={[lat, lng]}
          radius={RADIO_IMPACTO}
          pathOptions={{ color: COLOR_IMPACTO, fillColor: COLOR_IMPACTO, fillOpacity: 0.8 }}
        />
      ))}
      {posicion && (
        <CircleMarker
          center={posicion}
          radius={RADIO_POSICION}
          pathOptions={{ color: COLOR_POSICION, fillColor: COLOR_POSICION, fillOpacity: 0.9 }}
        />
      )}
      <Seguidor posicion={posicion} seguir={seguir} />
      <DetectorArrastre onArrastrar={onArrastrar} />
    </MapContainer>
  )
}

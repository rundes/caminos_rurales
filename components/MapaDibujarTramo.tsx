'use client'

import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMapEvents } from 'react-leaflet'

export type PuntoTramo = { lat: number; lng: number }

type Props = {
  puntos: PuntoTramo[]
  onAgregarPunto: (punto: PuntoTramo) => void
  centro: [number, number]
}

const URL_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATRIBUCION_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const ZOOM_INICIAL = 14
const RADIO_VERTICE = 6
const COLOR_TRAZO = '#15803d'

/** Cada click en el mapa agrega un vértice al tramo que se está dibujando. */
function CapturarClicks({ onAgregarPunto }: { onAgregarPunto: (punto: PuntoTramo) => void }) {
  useMapEvents({
    click(evento) {
      onAgregarPunto({ lat: evento.latlng.lat, lng: evento.latlng.lng })
    },
  })
  return null
}

/**
 * Mapa de alta/edición de tramos: click para agregar un vértice, sin
 * biblioteca de dibujo (alcanza con click-to-add-vertex + deshacer, que vive
 * en el formulario que controla `puntos`). El encuadre inicial lo decide
 * `centro` (el propio formulario, no este componente).
 */
export function MapaDibujarTramo({ puntos, onAgregarPunto, centro }: Props) {
  const posiciones = puntos.map((p) => [p.lat, p.lng] as [number, number])

  return (
    <MapContainer
      center={centro}
      zoom={ZOOM_INICIAL}
      className="h-[40dvh] w-full rounded-2xl"
      scrollWheelZoom
      preferCanvas
    >
      <TileLayer attribution={ATRIBUCION_OSM} url={URL_OSM} />
      <CapturarClicks onAgregarPunto={onAgregarPunto} />
      {posiciones.length > 1 && <Polyline positions={posiciones} pathOptions={{ color: COLOR_TRAZO, weight: 5 }} />}
      {posiciones.map((posicion, indice) => (
        <CircleMarker
          key={indice}
          center={posicion}
          radius={RADIO_VERTICE}
          pathOptions={{ color: COLOR_TRAZO, fillColor: COLOR_TRAZO, fillOpacity: 1 }}
        />
      ))}
    </MapContainer>
  )
}

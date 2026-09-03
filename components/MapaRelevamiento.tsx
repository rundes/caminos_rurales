'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { CircleMarker, LayersControl, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { CapasMunicipio } from '@/components/CapasMunicipio'
import { TESELAS_IGN, type CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'
import { colorSeveridad } from '@/lib/severidad'
import { ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_FALLA, type PuntoFalla } from '@/lib/tipos'

type LimitesBounds = [[number, number], [number, number]]

export type TramoEstado = {
  id: string
  nombre_codigo: string
  geometria: [number, number][]
  veces: number
}

type Props = {
  puntos: PuntoFalla[]
  centro: [number, number]
  urlsEvidencia: Record<string, string>
  capas?: CapasMunicipioTipo | null
  limites?: LimitesBounds
  tramos?: TramoEstado[]
}

const ZOOM_INICIAL = 10
const URL_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATRIBUCION_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const COLOR_TRAMO_CUBIERTO = '#16a34a'
const COLOR_TRAMO_PENDIENTE = '#9ca3af'
const PESO_TRAMO_CUBIERTO = 4
const PESO_TRAMO_PENDIENTE = 3

/** URL de "Ver video": directa si ya es `https://`, o la firmada equivalente a la de imágenes. */
function urlVideo(ruta: string, urlsEvidencia: Record<string, string>): string | null {
  if (ruta.startsWith('https://')) return ruta
  return urlsEvidencia[ruta] ?? null
}

/** Encuadra el mapa en `limites` una sola vez al montar (no en cada render). */
function EnfoqueLimites({ limites }: { limites: LimitesBounds }) {
  const map = useMap()

  useEffect(() => {
    map.fitBounds(limites)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberado: encuadrar solo al montar
  }, [])

  return null
}

export function MapaRelevamiento({ puntos, centro, urlsEvidencia, capas, limites, tramos }: Props) {
  return (
    <MapContainer center={centro} zoom={ZOOM_INICIAL} className="h-[60dvh] w-full rounded-2xl" scrollWheelZoom>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="IGN">
          <TileLayer
            attribution={TESELAS_IGN.attribution}
            url={TESELAS_IGN.url}
            tms={TESELAS_IGN.tms}
            maxNativeZoom={TESELAS_IGN.maxNativeZoom}
            maxZoom={TESELAS_IGN.maxZoom}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="OpenStreetMap">
          <TileLayer attribution={ATRIBUCION_OSM} url={URL_OSM} />
        </LayersControl.BaseLayer>
      </LayersControl>
      {limites && <EnfoqueLimites limites={limites} />}
      {capas && <CapasMunicipio capas={capas} />}
      {tramos?.map((t) => {
        const cubierto = t.veces > 0
        const posiciones: [number, number][] = t.geometria.map(([lng, lat]) => [lat, lng])
        return (
          <Polyline
            key={t.id}
            positions={posiciones}
            pathOptions={{
              color: cubierto ? COLOR_TRAMO_CUBIERTO : COLOR_TRAMO_PENDIENTE,
              weight: cubierto ? PESO_TRAMO_CUBIERTO : PESO_TRAMO_PENDIENTE,
            }}
          >
            <Tooltip>{cubierto ? `${t.nombre_codigo} · cubierto ${t.veces} veces` : `${t.nombre_codigo} · pendiente`}</Tooltip>
          </Polyline>
        )
      })}
      {puntos.map((p) => {
        const hrefVideo = p.url_evidencia_video ? urlVideo(p.url_evidencia_video, urlsEvidencia) : null
        return (
          <CircleMarker
            key={p.id}
            center={[p.latitud, p.longitud]}
            radius={9}
            pathOptions={{ color: colorSeveridad(p.severidad), fillColor: colorSeveridad(p.severidad), fillOpacity: 0.8 }}
          >
            <Popup>
              <strong>{ETIQUETA_TIPO_FALLA[p.tipo_falla]}</strong>
              <br />
              Severidad: {ETIQUETA_SEVERIDAD[p.severidad]}
              <br />
              {p.fecha ? new Date(p.fecha).toLocaleDateString('es-AR') : ''}
              {p.url_evidencia_imagen && urlsEvidencia[p.url_evidencia_imagen] && (
                <>
                  <br />
                  <a href={urlsEvidencia[p.url_evidencia_imagen]} target="_blank" rel="noreferrer">
                    Ver evidencia
                  </a>
                </>
              )}
              {hrefVideo && (
                <>
                  <br />
                  <a href={hrefVideo} target="_blank" rel="noreferrer">
                    Ver video
                  </a>
                </>
              )}
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}

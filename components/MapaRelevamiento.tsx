'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { CapasMunicipio } from '@/components/CapasMunicipio'
import { TESELAS_IGN, type CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'
import { colorSeveridad } from '@/lib/severidad'
import { ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_FALLA, type PuntoFalla } from '@/lib/tipos'

type LimitesBounds = [[number, number], [number, number]]

type Props = {
  puntos: PuntoFalla[]
  centro: [number, number]
  urlsEvidencia: Record<string, string>
  capas?: CapasMunicipioTipo | null
  limites?: LimitesBounds
}

const ZOOM_INICIAL = 10

/** Encuadra el mapa en `limites` una sola vez al montar (no en cada render). */
function EnfoqueLimites({ limites }: { limites: LimitesBounds }) {
  const map = useMap()

  useEffect(() => {
    map.fitBounds(limites)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberado: encuadrar solo al montar
  }, [])

  return null
}

export function MapaRelevamiento({ puntos, centro, urlsEvidencia, capas, limites }: Props) {
  return (
    <MapContainer center={centro} zoom={ZOOM_INICIAL} className="h-[60dvh] w-full rounded-2xl" scrollWheelZoom>
      <TileLayer
        attribution={TESELAS_IGN.attribution}
        url={TESELAS_IGN.url}
        tms={TESELAS_IGN.tms}
        maxNativeZoom={TESELAS_IGN.maxNativeZoom}
        maxZoom={TESELAS_IGN.maxZoom}
      />
      {limites && <EnfoqueLimites limites={limites} />}
      {capas && <CapasMunicipio capas={capas} />}
      {puntos.map((p) => (
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
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}

'use client'

import type { CircleMarker as CircleMarkerLeaflet } from 'leaflet'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { calcularVecinos, type Cuadro } from '@/lib/cuadros'
import { formatearFechaHora, formatearHora } from '@/lib/fechas'

type Props = {
  cuadros: Cuadro[]
  urls: Record<string, string>
}

const RADIO = 5
const COLOR = '#2563eb'
const COLOR_RELLENO = '#93c5fd'
const OPACIDAD_RELLENO = 0.9
const ANCHO_IMAGEN = 240

/** URL de la miniatura: directa si ya es `https://` (GCS), o la firmada equivalente. */
function urlCuadro(ruta: string, urls: Record<string, string>): string | null {
  if (ruta.startsWith('https://')) return ruta
  return urls[ruta] ?? null
}

/**
 * Capa "Cuadros" del mapa: marcadores de fotos de la cámara, con popup
 * navegable por tramo.
 *
 * El contenido pesado del popup (la miniatura) solo se monta para el
 * marcador seleccionado: con cientos de cuadros, renderizar una `<img>` por
 * cada uno dispararía todas las descargas a la vez apenas se activa la capa.
 * `seleccionado` se actualiza con el evento `popupopen` de Leaflet, que se
 * dispara tanto al tocar un marcador como al abrir su popup vía
 * `openPopup()` (los botones Anterior/Siguiente).
 */
export const CapaCuadros = memo(function CapaCuadros({ cuadros, urls }: Props) {
  const marcadores = useRef<Map<string, CircleMarkerLeaflet>>(new Map())
  const vecinosPorId = useMemo(() => calcularVecinos(cuadros), [cuadros])
  const [seleccionado, setSeleccionado] = useState<string | null>(null)

  const irA = useCallback((id: string | null | undefined) => {
    if (!id) return
    marcadores.current.get(id)?.openPopup()
  }, [])

  return (
    <>
      {cuadros.map((c) => {
        const { anterior, siguiente } = vecinosPorId.get(c.id) ?? { anterior: null, siguiente: null }
        const activo = seleccionado === c.id
        const src = activo ? urlCuadro(c.ruta, urls) : null

        return (
          <CircleMarker
            key={c.id}
            ref={(marcador) => {
              if (marcador) marcadores.current.set(c.id, marcador)
              else marcadores.current.delete(c.id)
            }}
            center={[c.lat, c.lng]}
            radius={RADIO}
            pathOptions={{ color: COLOR, fillColor: COLOR_RELLENO, fillOpacity: OPACIDAD_RELLENO }}
            eventHandlers={{ popupopen: () => setSeleccionado(c.id) }}
          >
            <Tooltip>📷 {formatearHora(c.t)}</Tooltip>
            <Popup>
              {activo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura firmada de Storage/GCS, no un asset local optimizable por next/image */}
                  {src && <img src={src} alt="Cuadro capturado" width={ANCHO_IMAGEN} loading="lazy" />}
                  <br />
                  {formatearFechaHora(c.t)}
                  <br />
                  {c.velocidadKmh !== null && (
                    <>
                      Velocidad: {c.velocidadKmh.toFixed(0)} km/h
                      <br />
                    </>
                  )}
                  Tramo: {c.tramo_id ?? 'sin tramo'}
                  <br />
                  <button type="button" disabled={!anterior} onClick={() => irA(anterior?.id)}>
                    Anterior
                  </button>{' '}
                  <button type="button" disabled={!siguiente} onClick={() => irA(siguiente?.id)}>
                    Siguiente
                  </button>
                </>
              ) : (
                <span>Cargando…</span>
              )}
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
})

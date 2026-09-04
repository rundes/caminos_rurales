'use client'

import type { CircleMarker as CircleMarkerLeaflet } from 'leaflet'
import { useCallback, useMemo, useRef } from 'react'
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { agruparPorTramo, type Cuadro, type Vecinos } from '@/lib/cuadros'
import { ZONA_HORARIA } from '@/lib/fechas'

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

function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit' })
}

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { timeZone: ZONA_HORARIA })
}

/** Vecino anterior/siguiente por cuadro, precomputado una vez por tramo (evita reordenar en cada marcador). */
function calcularVecinos(cuadros: readonly Cuadro[]): Map<string, Vecinos> {
  const mapa = new Map<string, Vecinos>()
  for (const grupo of agruparPorTramo(cuadros).values()) {
    grupo.forEach((c, i) => {
      mapa.set(c.id, {
        anterior: i > 0 ? grupo[i - 1] : null,
        siguiente: i < grupo.length - 1 ? grupo[i + 1] : null,
      })
    })
  }
  return mapa
}

/** Capa "Cuadros" del mapa: marcadores de fotos de la cámara, con popup navegable por tramo. */
export function CapaCuadros({ cuadros, urls }: Props) {
  const marcadores = useRef<Map<string, CircleMarkerLeaflet>>(new Map())
  const vecinosPorId = useMemo(() => calcularVecinos(cuadros), [cuadros])

  const irA = useCallback((id: string | null | undefined) => {
    if (!id) return
    marcadores.current.get(id)?.openPopup()
  }, [])

  return (
    <>
      {cuadros.map((c) => {
        const { anterior, siguiente } = vecinosPorId.get(c.id) ?? { anterior: null, siguiente: null }
        const src = urlCuadro(c.ruta, urls)

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
          >
            <Tooltip>📷 {formatearHora(c.t)}</Tooltip>
            <Popup>
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
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}

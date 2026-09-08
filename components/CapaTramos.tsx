'use client'

import { memo, useMemo } from 'react'
import { Polyline, Tooltip } from 'react-leaflet'
import { colorCalidad, ETIQUETA_CALIDAD } from '@/lib/sensores/colores'
import type { RugosidadTramo } from '@/lib/sensores/tipos'

export type TramoEstado = {
  id: string
  nombre_codigo: string
  geometria: [number, number][]
  veces: number
}

export type ModoMapa = 'cobertura' | 'estado'

type Props = {
  tramos: TramoEstado[]
  modo: ModoMapa
  rugosidad?: Record<string, RugosidadTramo>
  cuadrosPorTramo?: Record<string, number>
}

const COLOR_TRAMO_CUBIERTO = '#16a34a'
const COLOR_TRAMO_PENDIENTE = '#9ca3af'
const PESO_TRAMO_CUBIERTO = 4
const PESO_TRAMO_PENDIENTE = 3
const PESO_TRAMO_ESTADO = 4

function numero(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '0.0'
}

/** Tooltip del tramo en modo "Estado estimado": calidad, rugosidad, velocidad e impactos. */
function tooltipEstado(nombreCodigo: string, rugosidad: RugosidadTramo | undefined): string {
  const calidad = rugosidad?.calidad ?? 'sin_dato'
  const rms = rugosidad?.rms ?? 0
  const velocidad = rugosidad?.velocidad ?? 0
  const impactos = rugosidad?.impactos ?? 0
  const segmentos = rugosidad?.segmentos ?? 0
  return `${nombreCodigo} · Estado: ${ETIQUETA_CALIDAD[calidad]} · rugosidad ${numero(rms)} m/s² · ${numero(velocidad)} km/h · ${impactos} impactos (${segmentos} seg.)`
}

/** Sufijo " · N cuadros" cuando hay cuadros de cámara registrados para el tramo. */
function sufijoCuadros(id: string, cuadrosPorTramo?: Record<string, number>): string {
  const n = cuadrosPorTramo?.[id]
  return n ? ` · ${n} cuadros` : ''
}

type TramoConPosiciones = TramoEstado & { posiciones: [number, number][] }

/** Capa de tramos del mapa de relevamiento: cobertura (cubierto/pendiente) o estado estimado por calidad. */
export const CapaTramos = memo(function CapaTramos({ tramos, modo, rugosidad, cuadrosPorTramo }: Props) {
  // La proyección [lng, lat] -> [lat, lng] que espera Leaflet es la misma en
  // cada render mientras no cambien los tramos: recalcularla en cada toggle
  // de modo (o cada vez que el padre re-renderiza) es trabajo tirado.
  const tramosConPosiciones = useMemo<TramoConPosiciones[]>(
    () =>
      tramos.map((t) => ({
        ...t,
        posiciones: t.geometria.map(([lng, lat]) => [lat, lng] as [number, number]),
      })),
    [tramos],
  )

  return (
    <>
      {tramosConPosiciones.map((t) => {
        const sufijoCuadrosTexto = sufijoCuadros(t.id, cuadrosPorTramo)

        if (modo === 'estado') {
          const r = rugosidad?.[t.id]
          const calidad = r?.calidad ?? 'sin_dato'
          return (
            <Polyline
              key={t.id}
              positions={t.posiciones}
              pathOptions={{ color: colorCalidad(calidad), weight: PESO_TRAMO_ESTADO }}
            >
              <Tooltip>{tooltipEstado(t.nombre_codigo, r) + sufijoCuadrosTexto}</Tooltip>
            </Polyline>
          )
        }

        const cubierto = t.veces > 0
        return (
          <Polyline
            key={t.id}
            positions={t.posiciones}
            pathOptions={{
              color: cubierto ? COLOR_TRAMO_CUBIERTO : COLOR_TRAMO_PENDIENTE,
              weight: cubierto ? PESO_TRAMO_CUBIERTO : PESO_TRAMO_PENDIENTE,
            }}
          >
            <Tooltip>
              {(cubierto ? `${t.nombre_codigo} · cubierto ${t.veces} veces` : `${t.nombre_codigo} · pendiente`) +
                sufijoCuadrosTexto}
            </Tooltip>
          </Polyline>
        )
      })}
    </>
  )
})

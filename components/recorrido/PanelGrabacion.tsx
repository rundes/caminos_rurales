'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Boton } from '@/components/Boton'
import type { CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'
import type { EstadoSensores } from '@/hooks/useSensores'
import type { Grabador } from '@/lib/local/grabador'
import { simplificar, type PuntoGps } from '@/lib/track'
import { formatearKm, formatearPrecision } from './formato'
import { MapaRecorridoCliente } from './MapaRecorridoCliente'
import { Reloj } from './Reloj'

export type EstadoPanelSensores = {
  estado: EstadoSensores
  impactos: number
  /** Impactos recientes, para los marcadores efímeros del mapa. */
  posiciones: readonly [number, number][]
}

type Props = {
  estado: Grabador
  precision: number | null
  obtenerPuntos: () => readonly PuntoGps[]
  centro: [number, number]
  capas: CapasMunicipioTipo | null
  error: string | null
  sensores: EstadoPanelSensores
  onObservacion: () => void
  onPausar: () => void
  onReanudar: () => void
  onFinalizar: () => void
}

/** Tolerancia del simplificado que se dibuja: más gruesa que la que se sube. */
const TOLERANCIA_DIBUJO_M = 15
/** La traza se recalcula cada tantos puntos aceptados, no en cada punto. */
const PUNTOS_POR_REDIBUJO = 50

/** Por qué no hay sensores, en palabras que sirvan a quien está manejando. */
const MOTIVO_SIN_SENSORES: Record<EstadoSensores, string | null> = {
  activo: null,
  calibrando: null,
  inactivo: 'todavía no arrancaron',
  sin_permiso: 'sin permiso de movimiento',
  no_disponible: 'este dispositivo no los tiene',
}

/** Estado de la captura por sensores, con el motivo cuando no está activa. */
function ChipSensores({ estado }: { estado: EstadoSensores }) {
  if (estado === 'activo') {
    return <span className="rounded-full bg-green-100 px-3 py-1 text-green-800">Sensores activos</span>
  }
  if (estado === 'calibrando') {
    return <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">Calibrando…</span>
  }
  return (
    <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
      Sin sensores: {MOTIVO_SIN_SENSORES[estado]}
    </span>
  )
}

function Metrica({ etiqueta, valor, vivo = false }: { etiqueta: string; valor: ReactNode; vivo?: boolean }) {
  return (
    <div
      className="rounded-xl bg-white p-3 text-center shadow-sm"
      aria-label={etiqueta}
      {...(vivo ? { 'aria-live': 'polite' as const, 'aria-atomic': true } : {})}
    >
      <p className="text-2xl font-bold text-green-800">{valor}</p>
      <p className="text-xs text-gray-600">{etiqueta}</p>
    </div>
  )
}

/** Pantalla de grabación: mapa en vivo, métricas y controles del recorrido. */
export function PanelGrabacion({
  estado,
  precision,
  obtenerPuntos,
  centro,
  capas,
  error,
  sensores,
  onObservacion,
  onPausar,
  onReanudar,
  onFinalizar,
}: Props) {
  const grabando = estado.estado === 'grabando'
  const [seguir, setSeguir] = useState(true)

  const bloque = Math.floor(estado.cantidad / PUNTOS_POR_REDIBUJO)
  const trazaBase = useMemo(
    () => simplificar(obtenerPuntos(), TOLERANCIA_DIBUJO_M).map((p): [number, number] => [p.lat, p.lng]),
    // El bloque es la clave: dentro de los mismos 50 puntos no hace falta rehacerla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obtenerPuntos, bloque],
  )

  const posicion: [number, number] | null = estado.ultimo
    ? [estado.ultimo.lat, estado.ultimo.lng]
    : null
  // La punta viva se agrega aparte para que la traza no quede corta entre redibujos.
  const track = posicion && trazaBase.length > 0 ? [...trazaBase, posicion] : trazaBase

  return (
    <div className="flex flex-col gap-4">
      <MapaRecorridoCliente
        centro={centro}
        track={track}
        posicion={posicion}
        capas={capas}
        seguir={seguir}
        impactos={sensores.posiciones}
        onArrastrar={() => setSeguir(false)}
      />

      <button
        type="button"
        aria-pressed={seguir}
        onClick={() => setSeguir((previo) => !previo)}
        className="self-end rounded-xl border-2 border-green-700 bg-white px-4 py-2 text-sm font-semibold text-green-800"
      >
        {seguir ? 'Seguir' : 'Centrar'}
      </button>

      <div className="grid grid-cols-3 gap-2">
        <Metrica etiqueta="km" valor={formatearKm(estado.km)} vivo />
        <Metrica
          etiqueta="tiempo"
          valor={<Reloj inicio={estado.inicio} fin={estado.fin} activo={grabando} />}
        />
        <Metrica etiqueta="precisión GPS" valor={formatearPrecision(precision)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
        <ChipSensores estado={sensores.estado} />
        <span className="font-semibold text-gray-700" aria-label="impactos detectados">
          {sensores.impactos} impacto(s)
        </span>
      </div>

      {!grabando && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Recorrido en pausa: no se están registrando puntos.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Boton onClick={onObservacion}>Observación</Boton>
        <Boton variante="secundario" onClick={grabando ? onPausar : onReanudar}>
          {grabando ? 'Pausar' : 'Reanudar'}
        </Boton>
        <Boton variante="secundario" onClick={onFinalizar}>
          Finalizar
        </Boton>
      </div>
    </div>
  )
}

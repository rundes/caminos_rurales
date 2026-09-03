'use client'

import { useEffect, useState } from 'react'
import { Boton } from '@/components/Boton'
import type { CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'
import { duracionMs, type Grabador } from '@/lib/local/grabador'
import { formatearDuracion, formatearKm, formatearPrecision } from './formato'
import { MapaRecorridoCliente } from './MapaRecorridoCliente'

type Props = {
  estado: Grabador
  precision: number | null
  centro: [number, number]
  capas: CapasMunicipioTipo | null
  error: string | null
  onObservacion: () => void
  onPausar: () => void
  onReanudar: () => void
  onFinalizar: () => void
}

const REFRESCO_MS = 1000

/** Marca el paso del tiempo una vez por segundo mientras el recorrido está activo. */
function useReloj(activo: boolean): number {
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (!activo) return
    const id = setInterval(() => setAhora(Date.now()), REFRESCO_MS)
    return () => clearInterval(id)
  }, [activo])

  return ahora
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl bg-white p-3 text-center shadow-sm">
      <p className="text-2xl font-bold text-green-800">{valor}</p>
      <p className="text-xs text-gray-600">{etiqueta}</p>
    </div>
  )
}

/** Pantalla de grabación: mapa en vivo, métricas y controles del recorrido. */
export function PanelGrabacion({
  estado,
  precision,
  centro,
  capas,
  error,
  onObservacion,
  onPausar,
  onReanudar,
  onFinalizar,
}: Props) {
  const grabando = estado.estado === 'grabando'
  const ahora = useReloj(grabando)
  const track = estado.puntosGps.map((p): [number, number] => [p.lat, p.lng])
  const posicion = track.length > 0 ? track[track.length - 1] : null

  return (
    <div className="flex flex-col gap-4">
      <MapaRecorridoCliente centro={centro} track={track} posicion={posicion} capas={capas} seguir={grabando} />

      <div className="grid grid-cols-3 gap-2">
        <Metrica etiqueta="km" valor={formatearKm(estado.km)} />
        <Metrica etiqueta="tiempo" valor={formatearDuracion(duracionMs(estado, ahora))} />
        <Metrica etiqueta="precisión GPS" valor={formatearPrecision(precision)} />
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

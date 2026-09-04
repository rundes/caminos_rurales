'use client'

import type { RefObject } from 'react'
import type { EstadoCamara } from '@/hooks/useCamara'

export type Props = {
  estado: EstadoCamara
  cuadros: number
  videoRef: RefObject<HTMLVideoElement | null>
  onAlternar: () => void
}

/** Qué está pasando con la cámara, en palabras que sirvan a quien maneja. */
const TEXTO_ESTADO: Record<EstadoCamara, string> = {
  activa: 'Cámara activa',
  solicitando: 'Pidiendo cámara…',
  inactiva: 'Cámara apagada',
  sin_permiso: 'Sin permiso de cámara',
  no_disponible: 'Este dispositivo no tiene cámara',
  sin_espacio: 'Sin espacio: liberá memoria',
}

const CLASE_ESTADO: Record<EstadoCamara, string> = {
  activa: 'bg-green-100 text-green-800',
  solicitando: 'bg-amber-100 text-amber-900',
  inactiva: 'bg-gray-100 text-gray-700',
  sin_permiso: 'bg-gray-100 text-gray-700',
  no_disponible: 'bg-gray-100 text-gray-700',
  sin_espacio: 'bg-red-50 text-red-800',
}

/**
 * Vista previa chica de la cámara con su estado y el contador de cuadros. El
 * `<video>` tiene que estar montado y visible: iOS no deja capturar de un
 * stream oculto.
 */
export function VistaCamara({ estado, cuadros, videoRef, onAlternar }: Props) {
  const encendida = estado === 'activa' || estado === 'solicitando'

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-3 text-sm shadow-sm">
      <video
        ref={videoRef}
        data-testid="video-camara"
        playsInline
        muted
        autoPlay
        aria-label="Vista previa de la cámara"
        className="h-[72px] w-24 shrink-0 rounded-lg bg-black object-cover"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`self-start rounded-full px-3 py-1 ${CLASE_ESTADO[estado]}`}>
          {TEXTO_ESTADO[estado]}
        </span>
        <span className="font-semibold text-gray-700" aria-label="cuadros capturados">
          {cuadros} cuadro(s)
        </span>
      </div>

      <button
        type="button"
        aria-pressed={encendida}
        onClick={onAlternar}
        disabled={estado === 'no_disponible'}
        className="shrink-0 rounded-xl border-2 border-green-700 bg-white px-4 py-2 font-semibold text-green-800 disabled:opacity-60"
      >
        Cámara
      </button>
    </div>
  )
}

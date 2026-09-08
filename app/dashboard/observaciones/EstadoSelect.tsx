'use client'

import { useState, useTransition } from 'react'
import { ETIQUETA_ESTADO_OBSERVACION, type EstadoObservacion } from '@/lib/tipos'
import { cambiarEstado } from './actions'

const ESTADOS = Object.keys(ETIQUETA_ESTADO_OBSERVACION) as EstadoObservacion[]

type Props = { observacionId: string; estadoInicial: EstadoObservacion }

/**
 * Selector de estado para municipio/auditor. Optimista: cambia de inmediato
 * y revierte si el servidor (RLS + trigger `fallas_estado_no_escalar`) lo
 * rechaza. La altura mínima de 44px cumple el target táctil del mapa/app.
 */
export function EstadoSelect({ observacionId, estadoInicial }: Props) {
  const [estado, setEstado] = useState<EstadoObservacion>(estadoInicial)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function manejarCambio(nuevo: EstadoObservacion) {
    const anterior = estado
    setEstado(nuevo)
    setError(null)
    iniciarTransicion(async () => {
      const resultado = await cambiarEstado(observacionId, nuevo)
      if (!resultado.ok) {
        setEstado(anterior)
        setError(resultado.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={estado}
        disabled={pendiente}
        aria-label="Estado de la observación"
        onChange={(evento) => manejarCambio(evento.target.value as EstadoObservacion)}
        className="min-h-11 rounded-lg border border-gray-300 px-2 py-2 text-sm disabled:opacity-60"
      >
        {ESTADOS.map((valor) => (
          <option key={valor} value={valor}>
            {ETIQUETA_ESTADO_OBSERVACION[valor]}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

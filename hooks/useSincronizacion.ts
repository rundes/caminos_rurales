'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  finalizarRecorrido,
  prepararSubida,
  type ResumenRecorrido,
} from '@/app/dashboard/recorrido/actions'
import { comprimirImagen } from '@/lib/imagenes'
import { baseLocal } from '@/lib/local/db'
import { procesarCola, type DepsSincronizacion } from '@/lib/local/sincronizacion'
import { subirArchivo } from '@/lib/subida'
import { useEnLinea } from './useEnLinea'

const INTERVALO_MS = 60_000

const DEPS: DepsSincronizacion = {
  db: baseLocal,
  prepararSubida,
  finalizarRecorrido,
  subir: (destino, archivo) => subirArchivo(destino, archivo),
  comprimir: (archivo) => comprimirImagen(archivo),
  ahora: () => Date.now(),
}

export type EstadoSincronizacion = {
  pendientes: number
  ultimoResumen: ResumenRecorrido | null
  sincronizar: () => Promise<void>
}

/**
 * Vacía la cola de recorridos pendientes: al montar, al recuperar conexión y
 * cada minuto mientras queden pendientes. Nunca corre dos pasadas a la vez.
 */
export function useSincronizacion(): EstadoSincronizacion {
  const [pendientes, setPendientes] = useState(0)
  const [ultimoResumen, setUltimoResumen] = useState<ResumenRecorrido | null>(null)
  const enLinea = useEnLinea()
  const corriendo = useRef(false)

  const sincronizar = useCallback(async () => {
    if (corriendo.current) return
    corriendo.current = true
    try {
      const resultado = await procesarCola(DEPS)
      setPendientes(resultado.pendientes)
      if (resultado.ultimoResumen) setUltimoResumen(resultado.ultimoResumen)
    } catch (error) {
      console.error('[sincronizacion]', error)
    } finally {
      corriendo.current = false
    }
  }, [])

  // El pase se difiere a un microtask para no encadenar renders desde el efecto.
  useEffect(() => {
    if (!enLinea) return
    void Promise.resolve().then(sincronizar)
  }, [enLinea, sincronizar])

  useEffect(() => {
    if (pendientes === 0) return
    const id = setInterval(() => {
      if (navigator.onLine) void sincronizar()
    }, INTERVALO_MS)
    return () => clearInterval(id)
  }, [pendientes, sincronizar])

  return { pendientes, ultimoResumen, sincronizar }
}

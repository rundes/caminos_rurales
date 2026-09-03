'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  finalizarRecorrido,
  prepararSubida,
  type ResumenRecorrido,
} from '@/app/dashboard/recorrido/actions'
import { comprimirImagen } from '@/lib/imagenes'
import { baseLocal } from '@/lib/local/db'
import { procesarCola } from '@/lib/local/cola'
import type { DepsSincronizacion } from '@/lib/local/deps'
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
  /** Resumen del servidor por recorrido, para no mostrarle a uno el de otro. */
  resumenes: Record<string, ResumenRecorrido>
  sincronizar: () => Promise<void>
}

/**
 * Vacía la cola de recorridos pendientes del usuario: al montar, al recuperar
 * conexión y cada minuto mientras queden pendientes. Nunca corre dos pasadas a
 * la vez; si llega un pedido mientras corre, se reencola para el final.
 */
export function useSincronizacion(usuarioId: string): EstadoSincronizacion {
  const [pendientes, setPendientes] = useState(0)
  const [resumenes, setResumenes] = useState<Record<string, ResumenRecorrido>>({})
  const enLinea = useEnLinea()
  const corriendo = useRef(false)
  const pendienteDeCorrer = useRef(false)

  const sincronizar = useCallback(async () => {
    if (corriendo.current) {
      pendienteDeCorrer.current = true
      return
    }
    corriendo.current = true
    try {
      // Si llegó un pedido mientras corría la pasada, se repite en vez de perderse.
      do {
        pendienteDeCorrer.current = false
        const resultado = await procesarCola(DEPS, usuarioId)
        setPendientes(resultado.pendientes)
        if (Object.keys(resultado.resumenes).length > 0) {
          setResumenes((previos) => ({ ...previos, ...resultado.resumenes }))
        }
      } while (pendienteDeCorrer.current)
    } catch (error) {
      console.error('[sincronizacion]', error)
    } finally {
      pendienteDeCorrer.current = false
      corriendo.current = false
    }
  }, [usuarioId])

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

  return { pendientes, resumenes, sincronizar }
}

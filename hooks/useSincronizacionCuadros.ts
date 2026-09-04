'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { prepararSubida, registrarCuadros } from '@/app/dashboard/recorrido/actions'
import { conexionActual, leerPreferenciaRed, redPermitida } from '@/lib/camara/red'
import { procesarColaCuadros, type DepsCuadros } from '@/lib/local/cola-cuadros'
import { baseCuadros } from '@/lib/local/db'
import { subirArchivo } from '@/lib/subida'
import { useEnLinea } from './useEnLinea'

const INTERVALO_MS = 60_000

export type EstadoSincronizacionCuadros = {
  /** Recorridos con cuadros esperando subirse. */
  pendientes: number
  /** Cuadros subidos desde que se abrió la pantalla. */
  subidos: number
  /** Sube ya mismo aunque la preferencia sea "solo con WiFi" (una sola pasada). */
  forzarConDatos: () => void
}

/**
 * Vacía la cola de cuadros del usuario: al montar, al recuperar conexión y
 * cada minuto mientras queden pendientes. Los cuadros solo se suben después
 * de que el recorrido llegó al servidor, y por defecto solo con WiFi.
 */
export function useSincronizacionCuadros(usuarioId: string): EstadoSincronizacionCuadros {
  const [pendientes, setPendientes] = useState(0)
  const [subidos, setSubidos] = useState(0)
  const enLinea = useEnLinea()
  const corriendo = useRef(false)
  const forzar = useRef(false)

  const sincronizar = useCallback(async () => {
    if (corriendo.current) return
    corriendo.current = true
    // El forzado vale para esta pasada nada más: después vuelve la preferencia.
    const preferencia = forzar.current ? 'siempre' : leerPreferenciaRed()
    forzar.current = false
    try {
      const deps: DepsCuadros = {
        db: baseCuadros,
        prepararSubida,
        subir: (destino, archivo) => subirArchivo(destino, archivo),
        registrarCuadros,
        ahora: () => Date.now(),
        red: () => redPermitida(preferencia, conexionActual()),
      }
      const resultado = await procesarColaCuadros(deps, usuarioId)
      setPendientes(resultado.pendientes)
      if (resultado.subidos > 0) setSubidos((previos) => previos + resultado.subidos)
    } catch (error) {
      console.error('[cuadros]', error)
    } finally {
      corriendo.current = false
    }
  }, [usuarioId])

  const forzarConDatos = useCallback(() => {
    forzar.current = true
    void sincronizar()
  }, [sincronizar])

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

  return { pendientes, subidos, forzarConDatos }
}

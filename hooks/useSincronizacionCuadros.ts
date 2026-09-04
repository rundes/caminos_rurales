'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { prepararSubida, registrarCuadros } from '@/app/dashboard/recorrido/actions'
import {
  conexionActual,
  leerPreferenciaRed,
  redPermitida,
  type EstadoRed,
} from '@/lib/camara/red'
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
  /** Cuadros que quedaron en error, por recorrido. */
  errorCuadros: Record<string, number>
  /**
   * Cómo quedó la evaluación de la red con la preferencia guardada. Sin
   * `verificada` la subida igual sale, pero la UI avisa que no pudimos
   * confirmar que sea WiFi.
   */
  red: EstadoRed
  /** Sube ya mismo aunque la preferencia sea "solo con WiFi" (una sola pasada). */
  forzarConDatos: () => void
}

/** Hasta evaluar la red en el cliente se asume lo que no genera avisos. */
const RED_INICIAL: EstadoRed = { permitida: true, verificada: true }

/**
 * Vacía la cola de cuadros del usuario: al montar, al recuperar conexión y
 * cada minuto mientras queden pendientes. Los cuadros solo se suben después
 * de que el recorrido llegó al servidor, y por defecto solo con WiFi.
 */
export function useSincronizacionCuadros(usuarioId: string): EstadoSincronizacionCuadros {
  const [pendientes, setPendientes] = useState(0)
  const [subidos, setSubidos] = useState(0)
  const [errorCuadros, setErrorCuadros] = useState<Record<string, number>>({})
  const [red, setRed] = useState<EstadoRed>(RED_INICIAL)
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
      setErrorCuadros(resultado.errorCuadros)
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

  // `navigator.connection` y `localStorage` son sistemas externos: se leen al
  // montar y cada vez que cambia la conexión, no durante el render. La lectura
  // se difiere a un microtask para no encadenar renders desde el efecto.
  useEffect(() => {
    void Promise.resolve().then(() =>
      setRed(redPermitida(leerPreferenciaRed(), conexionActual())),
    )
  }, [enLinea])

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

  return { pendientes, subidos, errorCuadros, red, forzarConDatos }
}

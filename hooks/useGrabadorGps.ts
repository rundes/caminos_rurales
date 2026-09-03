'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cerrarRecorrido } from '@/lib/local/cierre'
import { guardarPunto, guardarRecorrido, listarPuntos, obtenerRecorrido } from '@/lib/local/db'
import {
  agregarPunto,
  finalizar as finalizarGrabador,
  GRABADOR_INICIAL,
  iniciar as iniciarGrabador,
  pausar as pausarGrabador,
  reanudar as reanudarGrabador,
  retomar as retomarGrabador,
  type Grabador,
} from '@/lib/local/grabador'
import type { PuntoGps } from '@/lib/track'
import { useWakeLock } from './useWakeLock'

export const OPCIONES_GPS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
}

const ERROR_SIN_GPS = 'Este dispositivo no tiene GPS disponible.'
const ERROR_GUARDADO = 'No se pudo guardar el recorrido en el dispositivo.'
const ERRORES_GPS: Record<number, string> = {
  1: 'Necesitamos permiso de ubicación para grabar el recorrido.',
  2: 'No pudimos obtener tu ubicación. Revisá que el GPS esté encendido.',
  3: 'El GPS está tardando demasiado. Seguimos intentando.',
}

export type ControlGrabador = {
  estado: Grabador
  error: string | null
  precision: number | null
  iniciar: () => Promise<void>
  retomar: (recorridoId: string) => Promise<void>
  pausar: () => void
  reanudar: () => void
  finalizar: () => Promise<string | null>
}

function mensajeGps(error: GeolocationPositionError): string {
  return ERRORES_GPS[error.code] ?? 'No pudimos obtener tu ubicación.'
}

/**
 * Graba el recorrido con `watchPosition`, filtra y persiste cada punto
 * aceptado en IndexedDB y mantiene la pantalla encendida. Solo graba con la
 * app en primer plano (documentado en los términos).
 */
export function useGrabadorGps(municipio: string): ControlGrabador {
  const [estado, setEstado] = useState<Grabador>(GRABADOR_INICIAL)
  const [error, setError] = useState<string | null>(null)
  const [precision, setPrecision] = useState<number | null>(null)
  const actual = useRef<Grabador>(GRABADOR_INICIAL)

  const aplicar = useCallback((siguiente: Grabador) => {
    actual.current = siguiente
    setEstado(siguiente)
  }, [])

  const grabando = estado.estado === 'grabando'
  useWakeLock(grabando || estado.estado === 'pausado')

  useEffect(() => {
    if (!grabando) return
    const geolocalizacion = typeof navigator === 'undefined' ? undefined : navigator.geolocation
    if (!geolocalizacion) return

    const alPunto = (posicion: GeolocationPosition) => {
      setPrecision(posicion.coords.accuracy)
      setError(null)
      const punto: PuntoGps = {
        lat: posicion.coords.latitude,
        lng: posicion.coords.longitude,
        t: posicion.timestamp,
        precision: posicion.coords.accuracy,
      }
      const siguiente = agregarPunto(actual.current, punto)
      if (siguiente === actual.current || !siguiente.recorridoId) return
      aplicar(siguiente)
      void guardarPunto({ recorridoId: siguiente.recorridoId, ...punto }).catch((fallo) => {
        console.error('[grabador]', fallo)
      })
    }

    const id = geolocalizacion.watchPosition(alPunto, (fallo) => setError(mensajeGps(fallo)), OPCIONES_GPS)
    return () => geolocalizacion.clearWatch(id)
  }, [grabando, aplicar])

  const iniciar = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError(ERROR_SIN_GPS)
      return
    }
    const id = crypto.randomUUID()
    const ahora = Date.now()
    try {
      await guardarRecorrido({
        id,
        inicio: new Date(ahora).toISOString(),
        estado: 'en_curso',
        municipio,
        puntosGps: 0,
        km: 0,
      })
    } catch (fallo) {
      console.error('[grabador]', fallo)
      setError(ERROR_GUARDADO)
      return
    }
    setError(null)
    aplicar(iniciarGrabador(id, ahora))
  }, [municipio, aplicar])

  const retomar = useCallback(
    async (recorridoId: string) => {
      try {
        const recorrido = await obtenerRecorrido(recorridoId)
        if (!recorrido) return
        const puntos = await listarPuntos(recorridoId)
        setError(null)
        aplicar(retomarGrabador(recorridoId, Date.parse(recorrido.inicio), puntos))
      } catch (fallo) {
        console.error('[grabador]', fallo)
        setError(ERROR_GUARDADO)
      }
    },
    [aplicar],
  )

  const pausar = useCallback(() => aplicar(pausarGrabador(actual.current)), [aplicar])
  const reanudar = useCallback(() => aplicar(reanudarGrabador(actual.current)), [aplicar])

  const finalizar = useCallback(async () => {
    const recorridoId = actual.current.recorridoId
    if (!recorridoId) return null
    const ahora = Date.now()
    aplicar(finalizarGrabador(actual.current, ahora))
    try {
      await cerrarRecorrido(recorridoId, ahora)
    } catch (fallo) {
      console.error('[grabador]', fallo)
      setError(ERROR_GUARDADO)
    }
    return recorridoId
  }, [aplicar])

  return { estado, error, precision, iniciar, retomar, pausar, reanudar, finalizar }
}

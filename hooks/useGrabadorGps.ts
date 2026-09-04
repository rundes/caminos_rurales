'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cerrarRecorrido, type ResultadoCierre } from '@/lib/local/cierre'
import { guardarRecorrido, listarPuntos, obtenerRecorrido } from '@/lib/local/db'
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
import { useColaPuntos } from './useColaPuntos'
import { useWakeLock } from './useWakeLock'

export { MAX_FALLOS_GUARDADO } from './useColaPuntos'

export const OPCIONES_GPS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
}

/** Con puntos descartados la precisión se refresca a lo sumo cada 2 s. */
const REFRESCO_PRECISION_MS = 2000

const ERROR_SIN_GPS = 'Este dispositivo no tiene GPS disponible.'
const ERROR_GUARDADO = 'No se pudo guardar el recorrido en el dispositivo.'
export const ERROR_SIN_ESPACIO =
  'No pudimos guardar los últimos puntos en el celular. Liberá espacio.'
const ERRORES_GPS: Record<number, string> = {
  1: 'Necesitamos permiso de ubicación para grabar el recorrido.',
  2: 'No pudimos obtener tu ubicación. Revisá que el GPS esté encendido.',
  3: 'El GPS está tardando demasiado. Seguimos intentando.',
}

export type OpcionesGrabador = {
  usuarioId: string
  municipio: string
  /**
   * Se llama con cada punto aceptado por el filtro (y con la posición cruda,
   * que trae velocidad, rumbo y altitud). Lo usa la captura de sensores.
   */
  onPunto?: (punto: PuntoGps, posicion?: GeolocationPosition) => void
}

export type ControlGrabador = {
  estado: Grabador
  error: string | null
  precision: number | null
  /** Track completo en memoria. No es estado: leerlo no dispara renders. */
  obtenerPuntos: () => readonly PuntoGps[]
  iniciar: () => Promise<void>
  retomar: (recorridoId: string) => Promise<void>
  pausar: () => void
  reanudar: () => void
  finalizar: () => Promise<ResultadoCierre | null>
}

function mensajeGps(error: GeolocationPositionError): string {
  return ERRORES_GPS[error.code] ?? 'No pudimos obtener tu ubicación.'
}

/**
 * Graba el recorrido con `watchPosition`, filtra y persiste cada punto
 * aceptado en IndexedDB y mantiene la pantalla encendida. Solo graba con la
 * app en primer plano (documentado en los términos).
 *
 * El track vive en un `ref`: lo único que llega al render es el agregado (`km`,
 * `ultimo`, `cantidad`, `precision`), así un recorrido largo no re-renderiza la
 * pantalla entera con cada punto.
 */
export function useGrabadorGps({ usuarioId, municipio, onPunto }: OpcionesGrabador): ControlGrabador {
  const [estado, setEstado] = useState<Grabador>(GRABADOR_INICIAL)
  const [error, setError] = useState<string | null>(null)
  const [precision, setPrecision] = useState<number | null>(null)
  const actual = useRef<Grabador>(GRABADOR_INICIAL)
  const puntos = useRef<PuntoGps[]>([])
  const ultimaPrecision = useRef(0)
  // En un `ref` para que cambiar el callback no reabra el `watchPosition`.
  const alPuntoExterno = useRef(onPunto)

  useEffect(() => {
    alPuntoExterno.current = onPunto
  }, [onPunto])

  const alFallarGuardado = useCallback(() => setError(ERROR_SIN_ESPACIO), [])
  const cola = useColaPuntos(alFallarGuardado)

  const aplicar = useCallback((siguiente: Grabador) => {
    actual.current = siguiente
    setEstado(siguiente)
  }, [])

  const obtenerPuntos = useCallback(() => puntos.current, [])

  const grabando = estado.estado === 'grabando'
  useWakeLock(grabando || estado.estado === 'pausado')

  useEffect(() => {
    if (!grabando) return
    const geolocalizacion = typeof navigator === 'undefined' ? undefined : navigator.geolocation
    if (!geolocalizacion) return

    const alPunto = (posicion: GeolocationPosition) => {
      const punto: PuntoGps = {
        lat: posicion.coords.latitude,
        lng: posicion.coords.longitude,
        t: posicion.timestamp,
        precision: posicion.coords.accuracy,
      }
      const siguiente = agregarPunto(actual.current, punto)

      // Punto descartado por el filtro: solo refresca la precisión, y con tope.
      if (siguiente === actual.current || !siguiente.recorridoId) {
        const ahora = Date.now()
        if (ahora - ultimaPrecision.current >= REFRESCO_PRECISION_MS) {
          ultimaPrecision.current = ahora
          setPrecision(punto.precision)
        }
        return
      }

      ultimaPrecision.current = Date.now()
      setPrecision(punto.precision)
      // Un aviso de disco lleno no se borra con el próximo punto bueno.
      setError((previo) => (previo === ERROR_SIN_ESPACIO ? previo : null))
      puntos.current.push(punto)
      aplicar(siguiente)
      cola.encolar(punto, siguiente.recorridoId)
      alPuntoExterno.current?.(punto, posicion)
    }

    const id = geolocalizacion.watchPosition(alPunto, (fallo) => setError(mensajeGps(fallo)), OPCIONES_GPS)
    return () => geolocalizacion.clearWatch(id)
  }, [grabando, aplicar, cola])

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
        usuarioId,
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
    puntos.current = []
    cola.reiniciar()
    setError(null)
    setPrecision(null)
    aplicar(iniciarGrabador(id, ahora))
  }, [usuarioId, municipio, aplicar, cola])

  const retomar = useCallback(
    async (recorridoId: string) => {
      try {
        const recorrido = await obtenerRecorrido(recorridoId)
        if (!recorrido) return
        const guardados = await listarPuntos(recorridoId)
        puntos.current = guardados.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t, precision: p.precision }))
        cola.reiniciar()
        setError(null)
        aplicar(retomarGrabador(recorridoId, Date.parse(recorrido.inicio), puntos.current))
      } catch (fallo) {
        console.error('[grabador]', fallo)
        setError(ERROR_GUARDADO)
      }
    },
    [aplicar, cola],
  )

  const pausar = useCallback(() => aplicar(pausarGrabador(actual.current)), [aplicar])
  const reanudar = useCallback(() => aplicar(reanudarGrabador(actual.current)), [aplicar])

  const finalizar = useCallback(async () => {
    const recorridoId = actual.current.recorridoId
    if (!recorridoId) return null
    const ahora = Date.now()
    aplicar(finalizarGrabador(actual.current, ahora))
    try {
      // Se esperan las escrituras pendientes antes de recalcular el cierre.
      await cola.vaciar()
      return await cerrarRecorrido(recorridoId, ahora)
    } catch (fallo) {
      console.error('[grabador]', fallo)
      setError(ERROR_GUARDADO)
      return null
    }
  }, [aplicar, cola])

  return { estado, error, precision, obtenerPuntos, iniciar, retomar, pausar, reanudar, finalizar }
}

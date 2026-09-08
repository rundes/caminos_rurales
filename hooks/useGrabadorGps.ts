'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cerrarRecorrido, type ResultadoCierre } from '@/lib/local/cierre'
import { guardarRecorrido, listarPuntos, obtenerRecorrido } from '@/lib/local/db'
import { fijarEstadoGrabacion, type EstadoGrabacionGlobal } from '@/lib/local/estado-grabacion'
import {
  agregarPunto,
  finalizar as finalizarGrabador,
  GRABADOR_INICIAL,
  iniciar as iniciarGrabador,
  pausar as pausarGrabador,
  reanudar as reanudarGrabador,
  retomar as retomarGrabador,
  UMBRAL_INTERRUPCION_MS,
  type EstadoGrabacion,
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

/**
 * Hueco en la grabación causado por una interrupción detectada (2° plano,
 * pantalla bloqueada, sin señal de GPS por más de `UMBRAL_INTERRUPCION_MS`):
 * entre `desde` y `hasta` (epoch ms) no se registró ningún punto.
 */
export type Interrupcion = { desde: number; hasta: number }

export type ControlGrabador = {
  estado: Grabador
  error: string | null
  precision: number | null
  /** Track completo en memoria. No es estado: leerlo no dispara renders. */
  obtenerPuntos: () => readonly PuntoGps[]
  /**
   * La interrupción más reciente mientras sigue sin reconocerse (el grabador
   * está pausado por eso, no por un pausado manual). Se limpia al reanudar.
   */
  interrupcionActual: Interrupcion | null
  /** Todas las interrupciones detectadas en este recorrido, para el resumen. */
  interrupciones: readonly Interrupcion[]
  iniciar: () => Promise<void>
  retomar: (recorridoId: string) => Promise<void>
  pausar: () => void
  reanudar: () => void
  finalizar: () => Promise<ResultadoCierre | null>
}

/** Cada cuánto se chequea si pasó el umbral de interrupción mientras se graba. */
const INTERVALO_CHEQUEO_INTERRUPCION_MS = 5000

function mensajeGps(error: GeolocationPositionError): string {
  return ERRORES_GPS[error.code] ?? 'No pudimos obtener tu ubicación.'
}

/** `finalizado` e `inactivo` no bloquean la nav: solo importa grabando/pausado. */
const ESTADO_GLOBAL: Record<EstadoGrabacion, EstadoGrabacionGlobal> = {
  inactivo: 'inactivo',
  grabando: 'grabando',
  pausado: 'pausado',
  finalizado: 'inactivo',
}

/**
 * Graba el recorrido con `watchPosition`, filtra y persiste cada punto
 * aceptado en IndexedDB y mantiene la pantalla encendida. Solo graba con la
 * app en primer plano (documentado en los términos y avisado antes de
 * arrancar, ver `PantallaInicio`): no hay geolocalización confiable en 2°
 * plano en la web, así que una interrupción (pantalla bloqueada, app
 * cambiada, o una zona sin señal) corta la grabación en vez de dibujar una
 * recta sobre lo que no se recorrió. La detecta un watchdog por tiempo (ver
 * `UMBRAL_INTERRUPCION_MS`), reforzado por `visibilitychange`/`pageshow`/
 * `pagehide` y por la pérdida inesperada del wake lock; al detectarla,
 * pausa igual que un pausado manual (reusa `cortes`/`pausarGrabador`) y
 * expone el hueco en `interrupcionActual`/`interrupciones`.
 *
 * El track vive en un `ref`: lo único que llega al render es el agregado (`km`,
 * `ultimo`, `cantidad`, `precision`), así un recorrido largo no re-renderiza la
 * pantalla entera con cada punto.
 */
export function useGrabadorGps({ usuarioId, municipio, onPunto }: OpcionesGrabador): ControlGrabador {
  const [estado, setEstado] = useState<Grabador>(GRABADOR_INICIAL)
  const [error, setError] = useState<string | null>(null)
  const [precision, setPrecision] = useState<number | null>(null)
  const [interrupcionActual, setInterrupcionActual] = useState<Interrupcion | null>(null)
  const [interrupciones, setInterrupciones] = useState<readonly Interrupcion[]>([])
  const actual = useRef<Grabador>(GRABADOR_INICIAL)
  const puntos = useRef<PuntoGps[]>([])
  const ultimaPrecision = useRef(0)
  // Última vez que llegó CUALQUIER lectura del GPS, la acepte o no el filtro
  // (una posición filtrada por estar quieto en un semáforo no es una
  // interrupción). El watchdog compara esto contra el umbral, no contra el
  // último punto aceptado.
  const ultimaRecepcion = useRef(0)
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

  /**
   * Corta la grabación (igual que un pausado manual, ver `pausarGrabador`) y
   * registra el hueco `[desde, ahora]` para avisar en vivo y en el resumen.
   * No hace nada si ya no se estaba grabando (interrupción ya reconocida, o
   * pausado manual de por medio).
   */
  const marcarInterrupcion = useCallback(
    (desde: number) => {
      if (actual.current.estado !== 'grabando') return
      const hasta = Date.now()
      aplicar(pausarGrabador(actual.current))
      const nueva: Interrupcion = { desde, hasta }
      setInterrupcionActual(nueva)
      setInterrupciones((previas) => [...previas, nueva])
    },
    [aplicar],
  )

  const chequearInterrupcion = useCallback(() => {
    if (actual.current.estado !== 'grabando') return
    if (Date.now() - ultimaRecepcion.current > UMBRAL_INTERRUPCION_MS) {
      marcarInterrupcion(ultimaRecepcion.current)
    }
  }, [marcarInterrupcion])

  const grabando = estado.estado === 'grabando'
  useWakeLock(grabando || estado.estado === 'pausado', chequearInterrupcion)

  // La nav inferior (fuera de este árbol) necesita saber si hay una grabación
  // en curso para bloquearse: se publica en un store aparte, no en contexto.
  useEffect(() => {
    fijarEstadoGrabacion(ESTADO_GLOBAL[estado.estado])
    return () => fijarEstadoGrabacion('inactivo')
  }, [estado.estado])

  // Watchdog: mientras se graba, revisa cada `INTERVALO_CHEQUEO_INTERRUPCION_MS`
  // si pasó el umbral desde la última lectura del GPS. `setInterval` no corre
  // mientras la pestaña está oculta, así que la revisión inmediata al volver
  // a estar visible (o al restaurarse desde el cache de retroceso) es la que
  // realmente detecta una interrupción por 2° plano; el intervalo cubre el
  // caso de quedarse en primer plano sin señal (zona sin GPS).
  useEffect(() => {
    if (!grabando) return
    const id = setInterval(chequearInterrupcion, INTERVALO_CHEQUEO_INTERRUPCION_MS)
    const alVolverVisible = () => {
      if (document.visibilityState === 'visible') chequearInterrupcion()
    }
    document.addEventListener('visibilitychange', alVolverVisible)
    window.addEventListener('pageshow', chequearInterrupcion)
    window.addEventListener('pagehide', chequearInterrupcion)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolverVisible)
      window.removeEventListener('pageshow', chequearInterrupcion)
      window.removeEventListener('pagehide', chequearInterrupcion)
    }
  }, [grabando, chequearInterrupcion])

  useEffect(() => {
    if (!grabando) return
    const geolocalizacion = typeof navigator === 'undefined' ? undefined : navigator.geolocation
    if (!geolocalizacion) return

    const alPunto = (posicion: GeolocationPosition) => {
      ultimaRecepcion.current = Date.now()
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
    setInterrupcionActual(null)
    setInterrupciones([])
    ultimaRecepcion.current = ahora
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
        setInterrupcionActual(null)
        setInterrupciones([])
        const ahora = Date.now()
        ultimaRecepcion.current = ahora
        const siguiente = retomarGrabador(recorridoId, Date.parse(recorrido.inicio), puntos.current, ahora)
        // `retomarGrabador` ya decidió (con el mismo umbral) si el tiempo que
        // pasó desde el último punto guardado hasta ahora fue una
        // interrupción real: si agregó un corte, hay que avisarla igual que
        // una detectada en vivo, para el resumen y el aviso en pantalla.
        const ultimoGuardado = puntos.current[puntos.current.length - 1]
        if (siguiente.cortes.length > 0 && ultimoGuardado) {
          const nueva: Interrupcion = { desde: ultimoGuardado.t, hasta: ahora }
          setInterrupcionActual(nueva)
          setInterrupciones([nueva])
        }
        aplicar(siguiente)
      } catch (fallo) {
        console.error('[grabador]', fallo)
        setError(ERROR_GUARDADO)
      }
    },
    [aplicar, cola],
  )

  const pausar = useCallback(() => aplicar(pausarGrabador(actual.current)), [aplicar])
  const reanudar = useCallback(() => {
    ultimaRecepcion.current = Date.now()
    setInterrupcionActual(null)
    aplicar(reanudarGrabador(actual.current))
  }, [aplicar])

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

  return {
    estado,
    error,
    precision,
    obtenerPuntos,
    interrupcionActual,
    interrupciones,
    iniciar,
    retomar,
    pausar,
    reanudar,
    finalizar,
  }
}

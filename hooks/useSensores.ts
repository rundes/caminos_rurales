'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { guardarImpacto, guardarMuestra } from '@/lib/local/db'
import {
  agregarGps,
  agregarMovimiento,
  cerrarSegmentoSiCorresponde,
  crearAgregador,
  lecturaDesdePunto,
  type Agregador,
} from '@/lib/sensores/agregador'
import {
  componentesHorizontales,
  crearFiltroGravedad,
  proyectarVertical,
  type FiltroGravedad,
  type Vector3,
} from '@/lib/sensores/gravedad'
import { crearDetectorImpactos, type DetectorImpactos } from '@/lib/sensores/impactos'
import type { Impacto } from '@/lib/sensores/tipos'
import type { PuntoGps } from '@/lib/track'

export type EstadoSensores = 'inactivo' | 'calibrando' | 'activo' | 'sin_permiso' | 'no_disponible'

type Permiso = 'desconocido' | 'concedido' | 'denegado'

export type OpcionesSensores = {
  /** Recorrido al que se asocian las muestras. Sin recorrido no se captura. */
  recorridoId: string | null
  activo: boolean
  /** Se llama con cada impacto detectado, para el marcador efímero del mapa. */
  onImpacto?: (impacto: Impacto) => void
}

export type ControlSensores = {
  estado: EstadoSensores
  impactos: number
  segmentos: number
  /**
   * Pide el permiso de movimiento de iOS. **Tiene que invocarse desde el gesto**
   * que inicia el recorrido y antes de cualquier `await`: fuera del gesto Safari
   * rechaza el pedido sin mostrar el diálogo.
   */
  solicitarPermiso: () => Promise<boolean>
  /** Alimenta al agregador con cada punto GPS aceptado por el grabador. */
  registrarGps: (punto: PuntoGps, posicion?: GeolocationPosition | null) => void
}

/** `DeviceMotionEvent.requestPermission` solo existe en iOS 13+. */
type ConstructorConPermiso = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<string>
}

function haySensores(): boolean {
  return typeof window !== 'undefined' && typeof window.DeviceMotionEvent !== 'undefined'
}

/**
 * Aceleración sin gravedad. Si el navegador no la informa (`acceleration` nulo
 * o con todos sus ejes en null, como pasa en varios Android) se estima
 * restándole a la lectura completa la gravedad del filtro.
 */
function aceleracionLineal(
  lineal: DeviceMotionEventAcceleration | null,
  conGravedad: DeviceMotionEventAcceleration,
  g: Vector3,
): Vector3 {
  if (lineal && (lineal.x !== null || lineal.y !== null || lineal.z !== null)) {
    return [lineal.x ?? 0, lineal.y ?? 0, lineal.z ?? 0]
  }
  return [(conGravedad.x ?? 0) - g[0], (conGravedad.y ?? 0) - g[1], (conGravedad.z ?? 0) - g[2]]
}

/** Las escrituras locales no pueden cortar la captura: se avisan por consola. */
function persistir(promesa: Promise<void>): void {
  promesa.catch((error) => console.error('[sensores]', error))
}

/**
 * Lo que la captura acumula para un recorrido. Va junto en un solo estado y
 * lleva el `recorridoId` adentro: así arrancar otro recorrido reinicia los
 * contadores sin tener que tocar el estado desde el efecto.
 */
type Captura = {
  recorridoId: string | null
  fase: 'calibrando' | 'activo'
  impactos: number
  segmentos: number
}

const CAPTURA_INICIAL: Captura = {
  recorridoId: null,
  fase: 'calibrando',
  impactos: 0,
  segmentos: 0,
}

function estadoDe(
  activo: boolean,
  recorridoId: string | null,
  disponible: boolean,
  permiso: Permiso,
  fase: Captura['fase'],
): EstadoSensores {
  if (!activo || !recorridoId) return 'inactivo'
  if (!disponible) return 'no_disponible'
  if (permiso === 'denegado') return 'sin_permiso'
  return fase
}

/**
 * Captura de sensores durante el recorrido: estima la gravedad para saber cuál
 * es la vertical, agrega la rugosidad por segmentos de 5 s o 100 m y detecta
 * impactos, guardando todo en IndexedDB. Los segmentos se persisten al cerrar
 * y los impactos en el momento; los eventos de movimiento crudos no se guardan.
 *
 * Sin sensores o sin permiso el recorrido sigue normal: solo no hay muestras.
 */
export function useSensores({ recorridoId, activo, onImpacto }: OpcionesSensores): ControlSensores {
  const [captura, setCaptura] = useState<Captura>(CAPTURA_INICIAL)
  const [permiso, setPermiso] = useState<Permiso>('desconocido')
  // Que el dispositivo tenga acelerómetro no cambia durante la sesión.
  const [disponible] = useState(haySensores)

  const agregador = useRef<Agregador>(crearAgregador(0))
  const filtro = useRef<FiltroGravedad | null>(null)
  const detector = useRef<DetectorImpactos | null>(null)
  const anterior = useRef<PuntoGps | null>(null)
  const alImpacto = useRef(onImpacto)

  useEffect(() => {
    alImpacto.current = onImpacto
  }, [onImpacto])

  const solicitarPermiso = useCallback(async (): Promise<boolean> => {
    if (!haySensores()) return false
    const pedir = (window.DeviceMotionEvent as ConstructorConPermiso).requestPermission
    // Sin `requestPermission` (Android, escritorio) el permiso es implícito.
    if (typeof pedir !== 'function') {
      setPermiso('concedido')
      return true
    }
    try {
      const respuesta = await pedir.call(window.DeviceMotionEvent)
      const concedido = respuesta === 'granted'
      setPermiso(concedido ? 'concedido' : 'denegado')
      return concedido
    } catch (error) {
      console.error('[sensores]', error)
      setPermiso('denegado')
      return false
    }
  }, [])

  const registrarGps = useCallback((punto: PuntoGps, posicion?: GeolocationPosition | null) => {
    const lectura = lecturaDesdePunto(anterior.current, punto, posicion?.coords)
    anterior.current = punto
    agregador.current = agregarGps(agregador.current, lectura)
  }, [])

  useEffect(() => {
    if (!activo || !recorridoId || !disponible || permiso === 'denegado') return

    const id = recorridoId
    agregador.current = crearAgregador(Date.now())
    filtro.current = crearFiltroGravedad()
    detector.current = crearDetectorImpactos()
    anterior.current = null

    const alMovimiento = (evento: DeviceMotionEvent) => {
      const conGravedad = evento.accelerationIncludingGravity
      const gravedad = filtro.current
      const impactosDe = detector.current
      if (!conGravedad || !gravedad || !impactosDe) return

      const t = Date.now()
      const g = gravedad.actualizar(conGravedad.x ?? 0, conGravedad.y ?? 0, conGravedad.z ?? 0)
      // Durante la calibración solo se alimenta el filtro: la vertical todavía no es confiable.
      if (!gravedad.listo(t)) return

      const lineal = aceleracionLineal(evento.acceleration, conGravedad, g)
      const az = proyectarVertical(lineal, g)
      const { longitudinal, lateral } = componentesHorizontales(lineal, g)
      agregador.current = agregarMovimiento(agregador.current, {
        az,
        aLong: longitudinal,
        aLat: lateral,
        t,
      })

      const ultima = agregador.current.ultima
      const impacto = impactosDe.evaluar(
        az,
        t,
        ultima ? { lat: ultima.lat, lng: ultima.lng, velocidadKmh: ultima.velocidadKmh } : null,
      )
      if (impacto) {
        alImpacto.current?.(impacto)
        persistir(guardarImpacto({ recorridoId: id, ...impacto }))
      }

      const cierre = cerrarSegmentoSiCorresponde(agregador.current, t)
      agregador.current = cierre.estado
      if (cierre.segmento) {
        persistir(guardarMuestra({ recorridoId: id, ...cierre.segmento }))
      }

      setCaptura((previo) => {
        const mismo = previo.recorridoId === id
        // En régimen no cambia nada: devolver el mismo objeto evita re-renderizar
        // la pantalla con cada evento de movimiento (30-60 por segundo).
        if (mismo && previo.fase === 'activo' && !impacto && !cierre.segmento) return previo
        const base = mismo ? previo : CAPTURA_INICIAL
        return {
          recorridoId: id,
          fase: 'activo',
          impactos: base.impactos + (impacto ? 1 : 0),
          segmentos: base.segmentos + (cierre.segmento ? 1 : 0),
        }
      })
    }

    window.addEventListener('devicemotion', alMovimiento)
    return () => window.removeEventListener('devicemotion', alMovimiento)
  }, [activo, recorridoId, permiso, disponible])

  // Los contadores de otro recorrido no se muestran: valen los del actual.
  const actual = recorridoId !== null && captura.recorridoId === recorridoId ? captura : CAPTURA_INICIAL

  return {
    estado: estadoDe(activo, recorridoId, disponible, permiso, actual.fase),
    impactos: actual.impactos,
    segmentos: actual.segmentos,
    solicitarPermiso,
    registrarGps,
  }
}

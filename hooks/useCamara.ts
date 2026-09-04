'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  capturarCuadro,
  debeDisparar,
  normalizarRumbo,
  normalizarVelocidad,
  type PuntoCuadro,
  type UltimoCuadro,
} from '@/lib/camara/captura'
import {
  ALMACENAMIENTO_MINIMO_BYTES,
  ANCHO_CUADRO_PX,
  MAX_CUADROS_RECORRIDO,
} from '@/lib/camara/umbrales'
import { encolarCuadros, guardarCuadro } from '@/lib/local/db'

export type EstadoCamara =
  | 'inactiva'
  | 'solicitando'
  | 'activa'
  | 'sin_permiso'
  | 'no_disponible'
  | 'sin_espacio'

export type ControlCamara = {
  estado: EstadoCamara
  /** Se engancha al `<video>` de la vista previa (iOS exige que sea visible). */
  videoRef: RefObject<HTMLVideoElement | null>
  /**
   * Pide la cámara. **Tiene que invocarse desde el gesto** que inicia el
   * recorrido y antes de cualquier `await`, igual que el de movimiento.
   */
  solicitarPermiso: () => Promise<boolean>
  /** Prende o apaga la cámara sin cortar la grabación. */
  alternar: () => void
  /**
   * Libera la cámara (apaga el stream) sin tocar la preferencia de la persona:
   * al terminar el recorrido no tiene sentido seguir con el hardware prendido,
   * pero el próximo recorrido arranca con la cámara si así la dejó.
   */
  detener: () => void
  /** Evalúa el disparo con el punto GPS aceptado y, si toca, guarda el cuadro. */
  capturarSi: (punto: PuntoCuadro, recorridoId: string) => Promise<boolean>
  cuadros: number
}

export type OpcionesCamara = {
  /** La cámara arranca prendida: se apaga desde el botón del panel. */
  activaInicial?: boolean
}

/** Cámara trasera, tamaño de captura pedido como ideal (no todos lo cumplen). */
const RESTRICCIONES: MediaStreamConstraints = {
  video: { facingMode: 'environment', width: { ideal: ANCHO_CUADRO_PX } },
  audio: false,
}

/** Cada cuántos cuadros se vuelve a estimar el espacio libre del dispositivo. */
const CUADROS_POR_CHEQUEO = 50

function hayCamara(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}

/**
 * ¿Queda espacio para seguir guardando cuadros? Si el navegador no informa la
 * estimación (Safari viejo) se asume que sí: no vale la pena bloquear la
 * captura por no poder medir.
 */
async function hayEspacio(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
    return true
  }
  try {
    const { quota, usage } = await navigator.storage.estimate()
    if (quota === undefined) return true
    return quota - (usage ?? 0) >= ALMACENAMIENTO_MINIMO_BYTES
  } catch (error) {
    console.error('[camara]', error)
    return true
  }
}

function detenerPistas(stream: MediaStream | null): void {
  stream?.getTracks().forEach((pista) => pista.stop())
}

/**
 * Cámara trasera durante el recorrido: permiso, stream para la vista previa y
 * captura de cuadros JPEG georreferenciados en IndexedDB.
 *
 * Sin permiso o sin cámara el recorrido sigue normal: solo no hay cuadros. La
 * captura se pausa al llegar al tope del recorrido o si el dispositivo se
 * queda sin espacio.
 */
export function useCamara({ activaInicial = true }: OpcionesCamara = {}): ControlCamara {
  const [estado, setEstado] = useState<EstadoCamara>('inactiva')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cuadros, setCuadros] = useState(0)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const estadoRef = useRef<EstadoCamara>('inactiva')
  const capturando = useRef(false)
  const ultimo = useRef<UltimoCuadro | null>(null)
  const total = useRef(0)
  const recorridoActual = useRef<string | null>(null)
  /**
   * Si la persona quiere la cámara prendida. Arranca en `activaInicial`, pero
   * el `getUserMedia` recién se pide en el gesto de iniciar el recorrido: iOS
   * no muestra el diálogo fuera de un gesto.
   */
  const deseada = useRef(activaInicial)

  const aplicar = useCallback((siguiente: EstadoCamara) => {
    estadoRef.current = siguiente
    setEstado(siguiente)
  }, [])

  const solicitarPermiso = useCallback(async (): Promise<boolean> => {
    // Apagada a mano: retomar el recorrido no la vuelve a prender sola.
    if (!deseada.current) return false
    if (!hayCamara()) {
      aplicar('no_disponible')
      return false
    }
    aplicar('solicitando')
    try {
      const obtenido = await navigator.mediaDevices.getUserMedia(RESTRICCIONES)
      detenerPistas(streamRef.current)
      streamRef.current = obtenido
      setStream(obtenido)
      aplicar('activa')
      return true
    } catch (error) {
      console.error('[camara]', error)
      aplicar('sin_permiso')
      return false
    }
  }, [aplicar])

  const detener = useCallback(() => {
    detenerPistas(streamRef.current)
    streamRef.current = null
    setStream(null)
    aplicar('inactiva')
  }, [aplicar])

  const alternar = useCallback(() => {
    if (deseada.current) {
      deseada.current = false
      detener()
      return
    }
    deseada.current = true
    void solicitarPermiso()
  }, [detener, solicitarPermiso])

  // El `<video>` aparece recién cuando el estado es `activa`, así que el
  // stream se engancha en un efecto y no dentro de `solicitarPermiso`.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    // `play()` puede no devolver promesa (navegadores viejos, jsdom).
    if (stream) void video.play?.()?.catch((error) => console.error('[camara]', error))
  }, [stream])

  useEffect(() => {
    return () => detenerPistas(streamRef.current)
  }, [])

  const capturarSi = useCallback(
    async (punto: PuntoCuadro, recorridoId: string): Promise<boolean> => {
      if (estadoRef.current !== 'activa' || capturando.current) return false

      // Otro recorrido reinicia el disparo y el contador.
      if (recorridoActual.current !== recorridoId) {
        recorridoActual.current = recorridoId
        ultimo.current = null
        total.current = 0
        setCuadros(0)
      }
      if (total.current >= MAX_CUADROS_RECORRIDO) return false
      if (!debeDisparar(ultimo.current, punto)) return false

      capturando.current = true
      try {
        if (total.current % CUADROS_POR_CHEQUEO === 0 && !(await hayEspacio())) {
          aplicar('sin_espacio')
          return false
        }
        const video = videoRef.current
        if (!video) return false

        const blob = await capturarCuadro(video)
        await guardarCuadro({
          recorridoId,
          t: punto.t,
          lat: punto.lat,
          lng: punto.lng,
          rumbo: normalizarRumbo(punto.rumbo),
          velocidadKmh: normalizarVelocidad(punto.velocidadKmh),
          blob,
          estadoSubida: 'pendiente',
        })
        // No reinicia los intentos si ya estaba encolado.
        await encolarCuadros(recorridoId)

        ultimo.current = { lat: punto.lat, lng: punto.lng, t: punto.t }
        total.current += 1
        setCuadros(total.current)
        return true
      } catch (error) {
        console.error('[camara]', error)
        return false
      } finally {
        capturando.current = false
      }
    },
    [aplicar],
  )

  return { estado, videoRef, solicitarPermiso, alternar, detener, capturarSi, cuadros }
}

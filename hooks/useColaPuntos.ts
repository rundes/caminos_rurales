'use client'

import { useCallback, useMemo, useRef } from 'react'
import { guardarPunto } from '@/lib/local/db'
import type { PuntoGps } from '@/lib/track'

/** Fallos de escritura seguidos que se toleran antes de avisar. */
export const MAX_FALLOS_GUARDADO = 3

export type ColaPuntos = {
  /** Encola la escritura de un punto. No devuelve nada: no bloquea la captura. */
  encolar: (punto: PuntoGps, recorridoId: string) => void
  /** Promesa de la última escritura encolada, para esperar antes de cerrar. */
  vaciar: () => Promise<void>
  reiniciar: () => void
}

/**
 * Persiste los puntos en IndexedDB de a uno y en orden: cada escritura se
 * encadena a la anterior, así dos fixes seguidos no se pisan. Un disco lleno no
 * corta la grabación (el track sigue en memoria), pero después de varios fallos
 * seguidos se avisa con `onFallar`.
 */
export function useColaPuntos(onFallar: () => void): ColaPuntos {
  const cola = useRef<Promise<void>>(Promise.resolve())
  const fallosSeguidos = useRef(0)

  const encolar = useCallback(
    (punto: PuntoGps, recorridoId: string) => {
      cola.current = cola.current.then(async () => {
        try {
          await guardarPunto({ recorridoId, ...punto })
          fallosSeguidos.current = 0
        } catch (fallo) {
          console.error('[grabador]', fallo)
          fallosSeguidos.current += 1
          if (fallosSeguidos.current >= MAX_FALLOS_GUARDADO) onFallar()
        }
      })
    },
    [onFallar],
  )

  const vaciar = useCallback(() => cola.current, [])
  const reiniciar = useCallback(() => {
    fallosSeguidos.current = 0
  }, [])

  // El objeto se memoiza: es dependencia del efecto que abre el `watchPosition`.
  return useMemo(() => ({ encolar, vaciar, reiniciar }), [encolar, vaciar, reiniciar])
}

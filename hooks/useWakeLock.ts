'use client'

import { useCallback, useEffect, useRef } from 'react'

type Sentinel = { release: () => Promise<void>; released: boolean }
type NavegadorConWakeLock = Navigator & { wakeLock?: { request: (tipo: 'screen') => Promise<Sentinel> } }

/**
 * Mantiene la pantalla encendida mientras dura el recorrido. El bloqueo se
 * pierde al pasar la app a segundo plano, así que se vuelve a pedir cuando la
 * pestaña se hace visible. Si el navegador no lo soporta (iOS viejo) no falla:
 * simplemente no hay bloqueo.
 */
export function useWakeLock(activo: boolean): void {
  const sentinel = useRef<Sentinel | null>(null)

  const pedir = useCallback(async () => {
    const api = (navigator as NavegadorConWakeLock).wakeLock
    if (!api || sentinel.current) return
    try {
      sentinel.current = await api.request('screen')
    } catch (error) {
      console.error('[wakelock]', error)
      sentinel.current = null
    }
  }, [])

  useEffect(() => {
    if (!activo) return

    void pedir()
    const alCambiarVisibilidad = () => {
      if (document.visibilityState !== 'visible') {
        sentinel.current = null
        return
      }
      void pedir()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      const actual = sentinel.current
      sentinel.current = null
      void actual?.release().catch((error) => console.error('[wakelock]', error))
    }
  }, [activo, pedir])
}

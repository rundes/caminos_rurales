'use client'

import { useCallback, useEffect, useRef } from 'react'

type Sentinel = {
  release: () => Promise<void>
  released: boolean
  addEventListener: (tipo: 'release', oyente: () => void) => void
  removeEventListener: (tipo: 'release', oyente: () => void) => void
}
type NavegadorConWakeLock = Navigator & { wakeLock?: { request: (tipo: 'screen') => Promise<Sentinel> } }

/**
 * Mantiene la pantalla encendida mientras dura el recorrido. El bloqueo se
 * pierde al pasar la app a segundo plano, así que se vuelve a pedir cuando la
 * pestaña se hace visible. Si el navegador no lo soporta (iOS viejo) no falla:
 * simplemente no hay bloqueo.
 *
 * `alPerderBloqueoInesperado` avisa cuando el sentinel se libera por una
 * causa que no es nuestro propio cleanup (2° plano, batería baja, el sistema
 * operativo lo revoca): es una señal más para detectar una interrupción de
 * la grabación, además del watchdog de `useGrabadorGps`.
 */
export function useWakeLock(activo: boolean, alPerderBloqueoInesperado?: () => void): void {
  const sentinel = useRef<Sentinel | null>(null)
  const alPerderRef = useRef(alPerderBloqueoInesperado)
  useEffect(() => {
    alPerderRef.current = alPerderBloqueoInesperado
  }, [alPerderBloqueoInesperado])

  const pedir = useCallback(async () => {
    const api = (navigator as NavegadorConWakeLock).wakeLock
    if (!api || sentinel.current) return
    try {
      const obtenido = await api.request('screen')
      sentinel.current = obtenido
      obtenido.addEventListener('release', () => {
        // Nuestro propio cleanup ya vació `sentinel.current` antes de liberar:
        // si sigue apuntando a este sentinel, la liberación fue inesperada.
        if (sentinel.current === obtenido) alPerderRef.current?.()
      })
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

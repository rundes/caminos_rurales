'use client'

import { useEffect } from 'react'

/**
 * Borra todo lo que el service worker guardó en este dispositivo. Se llama al
 * cerrar sesión, para que la próxima persona no encuentre nada de la anterior.
 */
export async function limpiarSw(): Promise<void> {
  if (typeof navigator === 'undefined') return
  try {
    const registro = await navigator.serviceWorker?.ready
    registro?.active?.postMessage({ type: 'LIMPIAR' })
  } catch (error) {
    console.error('[sw]', error)
  }
  try {
    if (typeof caches === 'undefined') return
    const nombres = await caches.keys()
    await Promise.all(nombres.map((nombre) => caches.delete(nombre)))
  } catch (error) {
    console.error('[sw]', error)
  }
}

/**
 * Registra el service worker que hace funcionar la app sin conexión. Solo en
 * producción: en desarrollo un SW cachea assets de Next y rompe el hot reload,
 * así que además se desregistra cualquiera que haya quedado de una build vieja.
 *
 * A propósito no se escucha `controllerchange` ni se recarga la página: si un
 * SW nuevo tomara el control en medio de un recorrido, la pestaña quedaría
 * pidiendo chunks de una build que ya no existe.
 */
export function RegistroSw() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registros) => Promise.all(registros.map((r) => r.unregister())))
        .catch((error) => console.error('[sw]', error))
      return
    }

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('[sw]', error)
    })
  }, [])

  return null
}

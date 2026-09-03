'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker que hace funcionar la app sin conexión. Solo en
 * producción: en desarrollo un SW cachea assets de Next y rompe el hot reload.
 */
export function RegistroSw() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('[sw]', error)
    })
  }, [])

  return null
}

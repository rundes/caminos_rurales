'use client'

import { useEffect, useState } from 'react'

/**
 * `true` mientras el navegador se considere en línea. Arranca optimista para
 * que el render del servidor y el primero del cliente coincidan.
 */
export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(true)

  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine)
    actualizar()
    window.addEventListener('online', actualizar)
    window.addEventListener('offline', actualizar)
    return () => {
      window.removeEventListener('online', actualizar)
      window.removeEventListener('offline', actualizar)
    }
  }, [])

  return enLinea
}

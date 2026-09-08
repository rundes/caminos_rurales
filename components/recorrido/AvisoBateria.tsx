'use client'

import { useEffect, useState } from 'react'
import { esNivelBajo, mensajeBateria, type NivelBateria } from '@/lib/bateria'

/** Lo mínimo que se usa de `BatteryManager`: no está en `lib.dom.d.ts`. */
type GestorBateria = {
  level: number
  charging: boolean
  addEventListener: (tipo: 'levelchange' | 'chargingchange', oyente: () => void) => void
  removeEventListener: (tipo: 'levelchange' | 'chargingchange', oyente: () => void) => void
}

type NavegadorConBateria = Navigator & {
  getBattery?: () => Promise<GestorBateria>
}

/**
 * Aviso antes de arrancar un recorrido: GPS + cámara + pantalla prendida
 * gastan batería rápido. Usa la Battery Status API (solo Chromium) para
 * mostrar el nivel real y ponerse más serio por debajo del 20%; en iOS, que
 * no la tiene, se degrada en silencio a un mensaje genérico. Se cierra con un
 * toque, sin tapar la pantalla.
 */
export function AvisoBateria() {
  const [estado, setEstado] = useState<NivelBateria | null>(null)
  const [cerrado, setCerrado] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const nav = navigator as NavegadorConBateria
    if (typeof nav.getBattery !== 'function') return

    let bateria: GestorBateria | null = null
    let cancelado = false
    const actualizar = () => {
      if (!bateria || cancelado) return
      setEstado({ nivel: bateria.level, cargando: bateria.charging })
    }

    nav
      .getBattery()
      .then((obtenida) => {
        if (cancelado) return
        bateria = obtenida
        actualizar()
        bateria.addEventListener('levelchange', actualizar)
        bateria.addEventListener('chargingchange', actualizar)
      })
      .catch((error) => console.error('[bateria]', error))

    return () => {
      cancelado = true
      bateria?.removeEventListener('levelchange', actualizar)
      bateria?.removeEventListener('chargingchange', actualizar)
    }
  }, [])

  if (cerrado) return null

  const bajo = estado !== null && esNivelBajo(estado)

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl p-3 text-sm ${
        bajo ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'
      }`}
    >
      <p>{mensajeBateria(estado)}</p>
      <button
        type="button"
        onClick={() => setCerrado(true)}
        aria-label="Cerrar aviso de batería"
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg"
      >
        ✕
      </button>
    </div>
  )
}

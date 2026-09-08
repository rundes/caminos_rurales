'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import {
  obtenerEstadoGrabacion,
  obtenerEstadoGrabacionServidor,
  suscribirEstadoGrabacion,
} from '@/lib/local/estado-grabacion'

const ENLACES = [
  { href: '/dashboard', etiqueta: 'Inicio' },
  { href: '/dashboard/caminos', etiqueta: 'Caminos' },
  { href: '/dashboard/mapa', etiqueta: 'Mapa' },
  { href: '/dashboard/observaciones', etiqueta: 'Obs.' },
  { href: '/dashboard/ranking', etiqueta: 'Ranking' },
] as const

/**
 * Nav inferior fija. Mientras se está grabando (o en pausa) los enlaces se
 * reemplazan por un aviso: navegar a otra sección corta el `watchPosition` y
 * pierde el recorrido, así que no hay forma de tocarlos por error.
 */
export function NavDashboard() {
  const estado = useSyncExternalStore(
    suscribirEstadoGrabacion,
    obtenerEstadoGrabacion,
    obtenerEstadoGrabacionServidor,
  )
  const grabando = estado === 'grabando' || estado === 'pausado'

  if (grabando) {
    return (
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-white"
      >
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2 py-4 text-center text-sm font-semibold text-green-800"
        >
          <span aria-hidden="true" className="text-red-600">
            ●
          </span>
          Grabando — volvé al recorrido
        </Link>
      </nav>
    )
  }

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t bg-white"
    >
      {ENLACES.map((e) => (
        <Link key={e.href} href={e.href} className="py-4 text-center text-sm font-medium text-green-800">
          {e.etiqueta}
        </Link>
      ))}
    </nav>
  )
}

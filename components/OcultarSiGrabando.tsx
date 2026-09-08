'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import {
  obtenerEstadoGrabacion,
  obtenerEstadoGrabacionServidor,
  suscribirEstadoGrabacion,
} from '@/lib/local/estado-grabacion'

type Props = { children: ReactNode }

/**
 * Oculta lo que envuelve mientras haya un recorrido grabando o en pausa: la
 * pantalla de grabación necesita todo el lugar posible para las métricas
 * grandes, sin la tarjeta de cobertura ni el resto del cromo del dashboard
 * compitiendo por la atención de quien está manejando.
 */
export function OcultarSiGrabando({ children }: Props) {
  const estado = useSyncExternalStore(
    suscribirEstadoGrabacion,
    obtenerEstadoGrabacion,
    obtenerEstadoGrabacionServidor,
  )
  const grabando = estado === 'grabando' || estado === 'pausado'

  if (grabando) return null
  return <>{children}</>
}

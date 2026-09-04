'use client'

import { useEffect, useState } from 'react'
import { formatearDuracion } from './formato'

const REFRESCO_MS = 1000

type Props = { inicio: number | null; fin: number | null; activo: boolean }

/**
 * Hoja del árbol: se re-renderiza una vez por segundo sin arrastrar al mapa ni
 * a las demás métricas.
 */
export function Reloj({ inicio, fin, activo }: Props) {
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (!activo) return
    const id = setInterval(() => setAhora(Date.now()), REFRESCO_MS)
    return () => clearInterval(id)
  }, [activo])

  const transcurrido = inicio === null ? 0 : Math.max(0, (fin ?? ahora) - inicio)
  return <>{formatearDuracion(transcurrido)}</>
}

'use client'

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

type Props = {
  etiqueta: string
  onCerrar: () => void
  children: ReactNode
}

const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Diálogo modal accesible: toma el foco al abrirse, lo atrapa mientras está
 * abierto, cierra con Escape y devuelve el foco a donde estaba (el botón
 * "Observación"). El panel de atrás queda inerte, a cargo de quien lo usa.
 */
export function ModalObservacion({ etiqueta, onCerrar, children }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const previo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previo.current = document.activeElement as HTMLElement | null
    contenedor.current?.focus()
    const devolver = previo.current
    return () => devolver?.focus?.()
  }, [])

  function alPresionar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.stopPropagation()
      onCerrar()
      return
    }
    if (evento.key !== 'Tab') return

    const focusables = Array.from(
      contenedor.current?.querySelectorAll<HTMLElement>(FOCUSABLES) ?? [],
    )
    if (focusables.length === 0) {
      evento.preventDefault()
      return
    }
    const primero = focusables[0]
    const ultimo = focusables[focusables.length - 1]
    const activo = document.activeElement

    if (evento.shiftKey && (activo === primero || activo === contenedor.current)) {
      evento.preventDefault()
      ultimo.focus()
    } else if (!evento.shiftKey && activo === ultimo) {
      evento.preventDefault()
      primero.focus()
    }
  }

  return (
    <div
      ref={contenedor}
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta}
      tabIndex={-1}
      onKeyDown={alPresionar}
      className="fixed inset-0 z-20 overflow-y-auto bg-black/40 p-4 outline-none"
    >
      <div className="mx-auto max-w-md rounded-2xl bg-white p-5">{children}</div>
    </div>
  )
}

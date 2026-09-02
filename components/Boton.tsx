import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario'
  cargando?: boolean
}

export function Boton({ variante = 'primario', cargando = false, children, className = '', ...rest }: Props) {
  const base = 'w-full rounded-xl px-4 py-4 text-lg font-semibold disabled:opacity-60 transition'
  const estilos =
    variante === 'primario'
      ? 'bg-green-700 text-white active:bg-green-800'
      : 'bg-white text-green-800 border-2 border-green-700 active:bg-green-50'
  return (
    <button {...rest} disabled={rest.disabled || cargando} className={`${base} ${estilos} ${className}`}>
      {cargando ? 'Procesando…' : children}
    </button>
  )
}

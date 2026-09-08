'use client'

import { useActionState } from 'react'
import { Boton } from '@/components/Boton'
import { MENSAJE_PASSWORD_CORTA } from '@/lib/validaciones'
import { actualizarClave, type EstadoNuevaClave } from './actions'

export function NuevaClaveForm() {
  const [estado, accion, pendiente] = useActionState<EstadoNuevaClave, FormData>(
    actualizarClave,
    undefined,
  )

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Contraseña nueva</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full min-h-11 rounded-xl border border-gray-300 px-4 py-3 text-lg"
        />
        {/* Mismo texto que la validación del servidor (`lib/validaciones.ts`). */}
        <span className="text-sm text-gray-600">{MENSAJE_PASSWORD_CORTA}</span>
      </label>

      {estado && !estado.ok && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {estado.error}
        </p>
      )}

      <Boton type="submit" cargando={pendiente}>
        Guardar contraseña
      </Boton>
    </form>
  )
}

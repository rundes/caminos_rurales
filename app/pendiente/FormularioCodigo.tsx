'use client'

import { useActionState } from 'react'
import { Boton } from '@/components/Boton'
import { aplicarCodigo } from './actions'
import type { ResultadoAccion } from '@/lib/tipos'

type Estado = ResultadoAccion | undefined

/** Adapta `aplicarCodigo(codigo)` a la firma `(estado, formData)` de `useActionState`. */
async function enviar(_prev: Estado, formData: FormData): Promise<Estado> {
  return aplicarCodigo(String(formData.get('codigo') ?? ''))
}

export function FormularioCodigo() {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(enviar, undefined)

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Código de invitación</span>
        <input
          name="codigo"
          type="text"
          required
          minLength={4}
          maxLength={40}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg uppercase"
        />
        <span className="text-sm text-gray-600">Pedile el código a tu municipio.</span>
      </label>

      {estado && !estado.ok && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {estado.error}
        </p>
      )}

      <Boton type="submit" cargando={pendiente}>
        Aplicar código
      </Boton>
    </form>
  )
}

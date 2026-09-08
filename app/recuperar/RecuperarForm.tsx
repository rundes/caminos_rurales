'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Boton } from '@/components/Boton'
import { solicitarRecuperacion, type EstadoRecuperar } from './actions'

/**
 * Mensaje neutro: se muestra ante un email inexistente, uno existente, o un
 * error real de Supabase (rate limit, Supabase caído): `solicitarRecuperacion`
 * siempre devuelve `{ ok: true }` salvo que el email tenga formato inválido,
 * así que este texto nunca revela si una cuenta puntual existe o no.
 */
const MENSAJE_ENVIADO =
  'Si el email está registrado, te enviamos un enlace para restablecer tu contraseña. Revisá también la carpeta de spam.'

export function RecuperarForm() {
  const [estado, accion, pendiente] = useActionState<EstadoRecuperar, FormData>(
    solicitarRecuperacion,
    undefined,
  )

  if (estado?.ok) {
    return (
      <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-green-800">
        {MENSAJE_ENVIADO}
      </p>
    )
  }

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full min-h-11 rounded-xl border border-gray-300 px-4 py-3 text-lg"
        />
      </label>

      {estado && !estado.ok && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {estado.error}
        </p>
      )}

      <Boton type="submit" cargando={pendiente}>
        Enviar enlace de recuperación
      </Boton>

      <Link
        href="/login"
        className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-green-800 underline"
      >
        Volver a ingresar
      </Link>
    </form>
  )
}

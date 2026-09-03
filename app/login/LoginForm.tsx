'use client'

import { useActionState, useState } from 'react'
import { signIn, signUpAction, type EstadoAuth } from './actions'
import { Boton } from '@/components/Boton'
import { PARTIDOS } from '@/lib/partidos'

const CAMPO = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-lg'

export function LoginForm() {
  const [modo, setModo] = useState<'login' | 'registro'>('login')
  const [estadoLogin, accionLogin, pendienteLogin] = useActionState<EstadoAuth, FormData>(signIn, undefined)
  const [estadoRegistro, accionRegistro, pendienteRegistro] = useActionState<EstadoAuth, FormData>(
    signUpAction,
    undefined,
  )

  const esRegistro = modo === 'registro'
  const estado = esRegistro ? estadoRegistro : estadoLogin
  const pendiente = esRegistro ? pendienteRegistro : pendienteLogin

  return (
    <form action={esRegistro ? accionRegistro : accionLogin} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={esRegistro ? 'new-password' : 'current-password'}
          className={CAMPO}
        />
      </label>

      {esRegistro && (
        <>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Nombre</span>
            <input name="nombre" type="text" required className={CAMPO} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Partido</span>
            <select name="municipio_id" required defaultValue="" className={CAMPO}>
              <option value="" disabled>
                Elegí tu partido
              </option>
              {PARTIDOS.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {estado && !estado.ok && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {estado.error}
        </p>
      )}
      {estado && estado.ok && esRegistro && (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-green-800">
          Cuenta creada. Revisá tu email para confirmarla.
        </p>
      )}

      <Boton type="submit" cargando={pendiente}>
        {esRegistro ? 'Registrarme' : 'Ingresar'}
      </Boton>
      <Boton
        type="button"
        variante="secundario"
        disabled={pendiente}
        onClick={() => setModo(esRegistro ? 'login' : 'registro')}
      >
        {esRegistro ? 'Ya tengo cuenta' : 'Crear cuenta'}
      </Boton>
    </form>
  )
}

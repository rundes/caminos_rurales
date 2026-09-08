'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'
import { reenviarConfirmacion, signIn, signUpAction, type EstadoAuth } from './actions'
import { Boton } from '@/components/Boton'
import { segundosRestantesCooldown } from '@/lib/reenvio-cooldown'

const CAMPO = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-lg'

export function LoginForm() {
  const [modo, setModo] = useState<'login' | 'registro'>('login')
  const [estadoLogin, accionLogin, pendienteLogin] = useActionState<EstadoAuth, FormData>(signIn, undefined)
  const [estadoRegistro, accionRegistro, pendienteRegistro] = useActionState<EstadoAuth, FormData>(
    signUpAction,
    undefined,
  )
  const [estadoReenvio, accionReenvio, pendienteReenvio] = useActionState<EstadoAuth, FormData>(
    reenviarConfirmacion,
    undefined,
  )

  const [email, setEmail] = useState('')
  const [inicioCooldown, setInicioCooldown] = useState<number | null>(null)
  const [ahora, setAhora] = useState<number | null>(null)

  useEffect(() => {
    if (inicioCooldown === null) return
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [inicioCooldown])

  const segundosRestantes =
    inicioCooldown !== null && ahora !== null ? segundosRestantesCooldown(inicioCooldown, ahora) : 0
  const enCooldown = segundosRestantes > 0

  const esRegistro = modo === 'registro'
  const estado = esRegistro ? estadoRegistro : estadoLogin
  const pendiente = esRegistro ? pendienteRegistro : pendienteLogin
  const emailSinConfirmar =
    !esRegistro && estadoLogin?.ok === false && estadoLogin.codigo === 'email_no_confirmado'

  return (
    <div className="flex flex-col gap-4">
      <form action={esRegistro ? accionRegistro : accionLogin} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={CAMPO}
          />
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
              <span className="font-medium">Código de invitación</span>
              <input
                name="codigo_invitacion"
                type="text"
                required
                minLength={4}
                maxLength={40}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className={`${CAMPO} uppercase`}
              />
              <span className="text-sm text-gray-600">Pedile el código a tu municipio.</span>
            </label>
          </>
        )}

        {!esRegistro && (
          <Link
            href="/recuperar"
            className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-green-800 underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
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

      {emailSinConfirmar && (
        <form action={accionReenvio} className="flex flex-col gap-2 border-t border-gray-200 pt-4">
          <input type="hidden" name="email" value={email} />
          <Boton
            type="submit"
            variante="secundario"
            disabled={pendienteReenvio || enCooldown}
            cargando={pendienteReenvio}
            onClick={() => {
              const ahoraClic = Date.now()
              setInicioCooldown(ahoraClic)
              setAhora(ahoraClic)
            }}
          >
            {enCooldown ? `Reenviar en ${segundosRestantes}s` : 'Reenviar correo de confirmación'}
          </Boton>
          {estadoReenvio && !estadoReenvio.ok && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
              {estadoReenvio.error}
            </p>
          )}
          {estadoReenvio?.ok && (
            <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-green-800">
              Te reenviamos el correo de confirmación.
            </p>
          )}
        </form>
      )}
    </div>
  )
}

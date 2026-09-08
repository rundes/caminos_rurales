import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import { NuevaClaveForm } from './NuevaClaveForm'

/**
 * Se llega acá después de `app/auth/confirm/route.ts`, que ya exchangeó el
 * `code` PKCE del enlace de recuperación por una sesión y la dejó en cookies
 * (flujo `@supabase/ssr`, sin JavaScript de por medio): por eso alcanza con
 * `getUser()` acá, en un Server Component, para confirmar que la sesión de
 * recuperación llegó. Si no hay usuario (enlace vencido, ya usado, o se
 * entró directo a esta URL) se muestra el aviso en vez del formulario.
 */
export default async function NuevaClavePage() {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold text-green-800">Elegí una contraseña nueva</h1>
        {!user && (
          <p className="mt-2 text-gray-600">
            Este enlace no es válido o venció. Pedí uno nuevo desde{' '}
            <Link
              href="/recuperar"
              className="inline-flex min-h-11 items-center font-medium text-green-800 underline"
            >
              Recuperar contraseña
            </Link>
            .
          </p>
        )}
      </div>
      {user && <NuevaClaveForm />}
    </main>
  )
}

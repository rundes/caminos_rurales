import { redirect } from 'next/navigation'
import { BotonSalir } from '@/components/BotonSalir'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FormularioCodigo } from './FormularioCodigo'

/** Municipio del perfil mientras no haya canjeado un código válido. */
const SIN_ASIGNAR = 'sin-asignar'

/**
 * Pantalla de espera para cuentas sin municipio asignado (código de
 * invitación inválido o ausente al registrarse). Deja canjear un código
 * válido o salir; una vez asignado el municipio, el perfil ya no vuelve acá.
 */
export default async function PendientePage() {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('municipio_id')
    .eq('id', user.id)
    .maybeSingle()

  if (error) console.error('[pendiente]', error.message)
  if (perfil && perfil.municipio_id !== SIN_ASIGNAR) redirect('/dashboard')

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold text-green-800">Tu cuenta espera un código válido</h1>
        <p className="mt-2 text-lg text-gray-600">
          Todavía no pudimos asignarte un municipio. Si te registraste sin código, o el código no
          era correcto, pedile uno a tu municipio y canjealo acá para empezar a usar la app.
        </p>
      </header>

      <FormularioCodigo />

      <div className="flex justify-center">
        <BotonSalir />
      </div>
    </main>
  )
}

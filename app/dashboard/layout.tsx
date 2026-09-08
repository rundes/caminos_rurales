import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'
import { buscarPartido } from '@/lib/partidos'
import { BannerInstalar } from '@/components/BannerInstalar'
import { BotonSalir } from '@/components/BotonSalir'
import { NavDashboard } from '@/components/NavDashboard'
import { OcultarSiGrabando } from '@/components/OcultarSiGrabando'

/** Municipio del perfil mientras no haya canjeado un código de invitación válido. */
const SIN_ASIGNAR = 'sin-asignar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('nombre, rol, municipio_id, acepto_terminos_at')
    .eq('id', user.id)
    .maybeSingle()

  if (error) console.error('[dashboard]', error.message)
  // Sin términos aceptados no se entra al dashboard (ante un error de lectura
  // se deja pasar y la cabecera muestra el aviso, para no encerrar al usuario).
  if (!error && !perfil?.acepto_terminos_at) redirect('/terminos')
  // Sin municipio asignado (código de invitación inválido o ausente) espera
  // en /pendiente: todavía no tiene nada que grabar ni subir.
  if (!error && perfil?.municipio_id === SIN_ASIGNAR) redirect('/pendiente')

  const partido = perfil ? buscarPartido(perfil.municipio_id)?.nombre ?? perfil.municipio_id : ''

  return (
    // pb-24 deja espacio libre debajo del contenido para que la nav inferior fija no lo tape
    <div className="min-h-dvh bg-gray-50 pb-24">
      {/* Ocultos mientras se graba: la pantalla de grabación necesita todo el
          espacio posible y esta cabecera no aporta nada en ese momento. */}
      <OcultarSiGrabando>
        <header className="flex items-center justify-between bg-green-800 px-4 py-3 text-white">
          {error ? (
            <p className="text-sm">No se pudo cargar tu perfil.</p>
          ) : (
            <div>
              <p className="font-semibold">{perfil?.nombre ?? user.email}</p>
              <p className="text-xs opacity-80">
                {partido} · {perfil?.rol ?? 'productor'}
              </p>
            </div>
          )}
          <BotonSalir usuarioId={user.id} />
        </header>
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <BannerInstalar />
        </div>
      </OcultarSiGrabando>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <NavDashboard />
    </div>
  )
}

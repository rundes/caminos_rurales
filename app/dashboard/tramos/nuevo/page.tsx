import { notFound } from 'next/navigation'
import { buscarPartido } from '@/lib/partidos'
import { crearClienteServidor } from '@/lib/supabase/server'
import { TramoForm } from '../TramoForm'

const CENTRO_PROVINCIA: [number, number] = [-36.6, -60.0]

/**
 * Alta de un tramo nuevo, gateada a municipio/auditor. `notFound()` en vez de
 * un aviso de "sin permiso": mismo criterio que el resto del dashboard para
 * rutas que un `productor` no debería ni saber que existen (RLS
 * `tramos_insert_gestion` es el gate real; esto es solo para no mostrarle un
 * formulario a alguien que igual no va a poder guardar nada).
 */
export default async function NuevoTramoPage() {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('rol, municipio_id')
    .eq('id', user.id)
    .maybeSingle()
  if (error) console.error('[tramos]', error.message)

  const puedeGestionar = perfil?.rol === 'municipio' || perfil?.rol === 'auditor'
  if (!puedeGestionar || !perfil) notFound()

  const centro = buscarPartido(perfil.municipio_id)
  const posicion: [number, number] = centro ? [centro.lat, centro.lng] : CENTRO_PROVINCIA

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Nuevo tramo</h1>
      <TramoForm modo="crear" centro={posicion} />
    </div>
  )
}

import { RecorridoView } from '@/components/recorrido/RecorridoView'
import { TarjetaCobertura } from '@/components/TarjetaCobertura'
import { capasDe } from '@/lib/capas'
import { limitesDe } from '@/lib/capas-servidor'
import { obtenerCoberturaMunicipio } from '@/lib/cobertura-consultas'
import { buscarPartido } from '@/lib/partidos'
import { crearClienteServidor } from '@/lib/supabase/server'

const CENTRO_PROVINCIA: [number, number] = [-36.6, -60.0]

/** Home: cobertura del municipio arriba y la pantalla de recorrido debajo. */
export default async function DashboardPage() {
  const supabase = await crearClienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: perfil, error } = user
    ? await supabase.from('perfiles').select('municipio_id').eq('id', user.id).maybeSingle()
    : { data: null, error: null }
  if (error) console.error('[dashboard]', error.message)

  const municipio = perfil?.municipio_id ?? null
  if (!municipio) {
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">Tu perfil no tiene un partido asignado.</p>
  }

  const [cobertura, limites] = await Promise.all([
    obtenerCoberturaMunicipio(supabase, municipio),
    limitesDe(municipio),
  ])

  const partido = buscarPartido(municipio)
  const centro: [number, number] = partido ? [partido.lat, partido.lng] : CENTRO_PROVINCIA

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Recorrido</h1>
      <TarjetaCobertura resumen={cobertura} />
      <RecorridoView municipio={municipio} capas={capasDe(municipio)} limites={limites} centro={centro} />
    </div>
  )
}

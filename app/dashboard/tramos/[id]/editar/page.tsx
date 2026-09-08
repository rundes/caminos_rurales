import { notFound } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'
import { TramoForm } from '../../TramoForm'

type Props = { params: Promise<{ id: string }> }

const CENTRO_PROVINCIA: [number, number] = [-36.6, -60.0]

/** Centro del mapa de edición: el primer punto de la geometría existente ([lng, lat] → [lat, lng]). */
function centroDeGeometria(geometria: readonly [number, number][]): [number, number] {
  const primero = geometria[0]
  if (!primero) return CENTRO_PROVINCIA
  const [lng, lat] = primero
  return [lat, lng]
}

/**
 * Edición de un tramo existente, gateada a municipio/auditor. La política
 * `tramos_select` ya restringe la lectura al municipio propio: un tramo de
 * otro municipio o inexistente da 404 sin comparar `tramo.municipio` a mano,
 * igual que `/dashboard/tramos/[id]`. Sin filtro por `activo`: un tramo
 * inactivo también se puede reactivar/editar acá (ver semántica de `activo`
 * en `supabase/migrations/0011_alta_tramos.sql`).
 */
export default async function EditarTramoPage({ params }: Props) {
  const { id } = await params
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const [{ data: perfil, error: errorPerfil }, { data: tramo, error: errorTramo }] = await Promise.all([
    supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle(),
    supabase
      .from('tramos')
      .select('id, nombre_codigo, localidad, geometria, activo')
      .eq('id', id)
      .maybeSingle(),
  ])

  if (errorPerfil) console.error('[tramos]', errorPerfil.message)
  if (errorTramo) console.error('[tramos]', errorTramo.message)

  const puedeGestionar = perfil?.rol === 'municipio' || perfil?.rol === 'auditor'
  if (!puedeGestionar || !tramo) notFound()

  const geometria = tramo.geometria as [number, number][]

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Editar tramo</h1>
      <TramoForm
        modo="editar"
        tramoId={tramo.id}
        centro={centroDeGeometria(geometria)}
        valoresIniciales={{
          nombreCodigo: tramo.nombre_codigo,
          localidad: tramo.localidad,
          geometria,
          activo: tramo.activo,
        }}
      />
    </div>
  )
}

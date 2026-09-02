import { NextResponse } from 'next/server'
import { buscarPartido } from '@/lib/partidos'
import { estadoDesdeSeveridades } from '@/lib/severidad'
import { generarFallasSimuladas } from '@/lib/simulador'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/server'
import { esquemaProcesarIa } from '@/lib/validaciones'

export async function POST(request: Request) {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })

  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Cuerpo inválido' }, { status: 400 })
  }
  const parseo = esquemaProcesarIa.safeParse(cuerpo)
  if (!parseo.success) return NextResponse.json({ ok: false, error: 'relevamiento_id inválido' }, { status: 400 })

  // Con el cliente del usuario: RLS garantiza que el relevamiento es visible para él.
  const { data: relevamiento, error: errorRel } = await supabase
    .from('relevamientos')
    .select('id, usuario_id, camino_id, procesado_ia, metadata')
    .eq('id', parseo.data.relevamiento_id)
    .single()
  if (errorRel || !relevamiento) {
    return NextResponse.json({ ok: false, error: 'Relevamiento no encontrado' }, { status: 404 })
  }
  if (relevamiento.usuario_id !== user.id) {
    return NextResponse.json({ ok: false, error: 'El relevamiento no es tuyo' }, { status: 403 })
  }
  if (relevamiento.procesado_ia) {
    return NextResponse.json({ ok: false, error: 'Ya fue procesado' }, { status: 409 })
  }

  const { data: perfil } = await supabase.from('perfiles').select('municipio_id').eq('id', user.id).maybeSingle()
  const partido = perfil ? buscarPartido(perfil.municipio_id) : undefined
  if (!partido) {
    return NextResponse.json({ ok: false, error: 'Tu perfil no tiene un partido válido' }, { status: 422 })
  }

  const { metadata } = relevamiento
  const archivos =
    typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata) && Array.isArray(metadata.archivos)
      ? metadata.archivos.filter((a): a is string => typeof a === 'string')
      : []
  const primeraEvidencia = archivos[0] ?? null

  const fallas = generarFallasSimuladas({ lat: partido.lat, lng: partido.lng }).map((f) => ({
    ...f,
    relevamiento_id: relevamiento.id,
    url_evidencia_imagen: primeraEvidencia,
  }))

  try {
    const admin = crearClienteAdmin()
    const { error: errorFallas } = await admin.from('fallas_deteccion').insert(fallas)
    if (errorFallas) throw new Error(errorFallas.message)

    const { error: errorRelUpd } = await admin
      .from('relevamientos')
      .update({ procesado_ia: true })
      .eq('id', relevamiento.id)
    if (errorRelUpd) throw new Error(errorRelUpd.message)

    if (relevamiento.camino_id) {
      const { error: errorCamino } = await admin
        .from('caminos')
        .update({
          estado_general: estadoDesdeSeveridades(fallas.map((f) => f.severidad)),
          ultima_actualizacion: new Date().toISOString(),
        })
        .eq('id', relevamiento.camino_id)
      if (errorCamino) throw new Error(errorCamino.message)
    }
  } catch (e) {
    console.error('[procesar-ia]', e)
    return NextResponse.json({ ok: false, error: 'Error interno al procesar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, fallas: fallas.length })
}

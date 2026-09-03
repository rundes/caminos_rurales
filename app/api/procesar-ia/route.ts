import { NextResponse } from 'next/server'
import { buscarPartido, type Partido } from '@/lib/partidos'
import { estadoDesdeSeveridades } from '@/lib/severidad'
import { generarFallasSimuladas, type FallaSimulada } from '@/lib/simulador'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'
import { esquemaProcesarIa } from '@/lib/validaciones'

type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>
type ClienteAdmin = ReturnType<typeof crearClienteAdmin>

type Relevamiento = {
  id: string
  usuario_id: string | null
  camino_id: string | null
  procesado_ia: boolean | null
  metadata: Json | null
}

function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function primeraEvidencia(metadata: Json | null): string | null {
  const archivos =
    typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata) && Array.isArray(metadata.archivos)
      ? metadata.archivos.filter((a): a is string => typeof a === 'string')
      : []
  return archivos[0] ?? null
}

/** Lee y valida el cuerpo del pedido. Devuelve el id o la Response de error a propagar. */
async function leerRelevamientoId(request: Request): Promise<{ id: string } | Response> {
  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Cuerpo inválido' }, { status: 400 })
  }
  const parseo = esquemaProcesarIa.safeParse(cuerpo)
  if (!parseo.success) return NextResponse.json({ ok: false, error: 'relevamiento_id inválido' }, { status: 400 })
  return { id: parseo.data.relevamiento_id }
}

/** Con el cliente del usuario: RLS garantiza que el relevamiento es visible para él. */
async function verificarAcceso(
  supabase: ClienteServidor,
  id: string,
  userId: string,
): Promise<{ relevamiento: Relevamiento } | Response> {
  const { data: relevamiento, error: errorRel } = await supabase
    .from('relevamientos')
    .select('id, usuario_id, camino_id, procesado_ia, metadata')
    .eq('id', id)
    .single()
  if (errorRel || !relevamiento) {
    return NextResponse.json({ ok: false, error: 'Relevamiento no encontrado' }, { status: 404 })
  }
  if (relevamiento.usuario_id !== userId) {
    return NextResponse.json({ ok: false, error: 'El relevamiento no es tuyo' }, { status: 403 })
  }
  if (relevamiento.procesado_ia) {
    return NextResponse.json({ ok: false, error: 'Ya fue procesado' }, { status: 409 })
  }
  return { relevamiento }
}

/**
 * Bloqueo atómico: solo la petición que logra pasar procesado_ia de false a true continúa.
 * Lanza si la actualización falla; devuelve `false` si otra petición ya lo había reclamado.
 */
async function reclamarRelevamiento(admin: ClienteAdmin, id: string): Promise<boolean> {
  const { data: reclamado, error } = await admin
    .from('relevamientos')
    .update({ procesado_ia: true })
    .eq('id', id)
    .eq('procesado_ia', false)
    .select('id')
  if (error) throw new Error(error.message)
  return (reclamado?.length ?? 0) > 0
}

/** Inserta las fallas simuladas y actualiza el estado del camino. Lanza si algo falla. */
async function insertarFallasYActualizarCamino(
  admin: ClienteAdmin,
  relevamiento: Relevamiento,
  partido: Partido,
): Promise<Array<FallaSimulada & { relevamiento_id: string; url_evidencia_imagen: string | null }>> {
  const fallas = generarFallasSimuladas({ lat: partido.lat, lng: partido.lng }).map((f) => ({
    ...f,
    relevamiento_id: relevamiento.id,
    url_evidencia_imagen: primeraEvidencia(relevamiento.metadata),
  }))

  const { error: errorFallas } = await admin.from('fallas_deteccion').insert(fallas)
  if (errorFallas) throw new Error(errorFallas.message)

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

  return fallas
}

/**
 * Rollback: si ya se llegaron a insertar fallas en esta corrida antes de que fallara la
 * actualización del camino, hay que borrarlas para no dejar detecciones huérfanas de un
 * procesamiento que se va a reintentar.
 */
async function revertirProcesamiento(admin: ClienteAdmin, id: string): Promise<void> {
  const { error: errorLimpieza } = await admin.from('fallas_deteccion').delete().eq('relevamiento_id', id)
  if (errorLimpieza) console.error('[procesar-ia] no se pudieron borrar las fallas insertadas', errorLimpieza)

  // Falla residual: si este reset falla, procesado_ia queda en true aunque no haya fallas
  // guardadas (ya fueron borradas arriba). El relevamiento queda marcado como procesado sin
  // poder reintentarse y requiere arreglo manual.
  const { error: errorReset } = await admin.from('relevamientos').update({ procesado_ia: false }).eq('id', id)
  if (errorReset) console.error('[procesar-ia] no se pudo revertir procesado_ia', errorReset)
}

export async function POST(request: Request) {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })

  const leido = await leerRelevamientoId(request)
  if (leido instanceof Response) return leido

  const acceso = await verificarAcceso(supabase, leido.id, user.id)
  if (acceso instanceof Response) return acceso
  const { relevamiento } = acceso

  const { data: perfil } = await supabase.from('perfiles').select('municipio_id').eq('id', user.id).maybeSingle()
  const partido = perfil ? buscarPartido(perfil.municipio_id) : undefined
  if (!partido) {
    return NextResponse.json({ ok: false, error: 'Tu perfil no tiene un partido válido' }, { status: 422 })
  }

  const admin = crearClienteAdmin()

  let reclamado: boolean
  try {
    reclamado = await reclamarRelevamiento(admin, relevamiento.id)
  } catch (e) {
    console.error('[procesar-ia]', mensajeError(e))
    return NextResponse.json({ ok: false, error: 'Error interno al procesar' }, { status: 500 })
  }
  if (!reclamado) {
    return NextResponse.json({ ok: false, error: 'Ya fue procesado' }, { status: 409 })
  }

  try {
    const fallas = await insertarFallasYActualizarCamino(admin, relevamiento, partido)
    return NextResponse.json({ ok: true, fallas: fallas.length })
  } catch (e) {
    console.error('[procesar-ia]', mensajeError(e))
    await revertirProcesamiento(admin, relevamiento.id)
    return NextResponse.json({ ok: false, error: 'Error interno al procesar' }, { status: 500 })
  }
}

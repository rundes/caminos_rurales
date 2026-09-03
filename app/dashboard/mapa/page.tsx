import { Suspense } from 'react'
import { MapaCliente } from '@/components/MapaCliente'
import { capasDe } from '@/lib/capas'
import { limitesDe } from '@/lib/capas-servidor'
import { obtenerTramosConEstado } from '@/lib/cobertura-consultas'
import { aPuntos, filtrarPuntos, municipiosDe, type FilaFalla } from '@/lib/fallas'
import { buscarPartido } from '@/lib/partidos'
import { crearClienteServidor } from '@/lib/supabase/server'
import { Filtros } from './Filtros'

type Props = { searchParams: Promise<{ tipo?: string; municipio?: string }> }

const CENTRO_PROVINCIA: [number, number] = [-36.6, -60.0]
const SEGUNDOS_URL_FIRMADA = 60 * 60
const LIMITE_FALLAS = 2000

export default async function MapaPage({ searchParams }: Props) {
  const filtros = await searchParams
  const supabase = await crearClienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: perfil, error: errorPerfil } = user
    ? await supabase.from('perfiles').select('municipio_id').eq('id', user.id).maybeSingle()
    : { data: null, error: null }
  if (errorPerfil) console.error('[mapa]', errorPerfil.message)
  const municipioActual = perfil?.municipio_id ?? null
  const capas = capasDe(municipioActual)

  const { data, error } = await supabase
    .from('fallas_deteccion')
    .select(
      'id, tipo_falla, severidad, latitud, longitud, url_evidencia_imagen, url_evidencia_video, created_at, recorridos(inicio, municipio)',
    )
    .order('created_at', { ascending: false })
    .limit(LIMITE_FALLAS)

  if (error) {
    console.error('[mapa]', error.message)
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudo cargar el mapa.</p>
  }

  const todos = aPuntos((data ?? []) as FilaFalla[])
  const puntos = filtrarPuntos(todos, filtros)
  const municipios = municipiosDe(todos)

  const rutasImagen = puntos.map((p) => p.url_evidencia_imagen).filter((r): r is string => Boolean(r))
  const rutasVideo = puntos
    .map((p) => p.url_evidencia_video)
    .filter((r): r is string => r !== null && !r.startsWith('https://'))
  const rutas = [...new Set([...rutasImagen, ...rutasVideo])]
  const urlsEvidencia: Record<string, string> = {}
  if (rutas.length > 0) {
    const { data: firmadas } = await supabase.storage.from('evidencia-vial').createSignedUrls(rutas, SEGUNDOS_URL_FIRMADA)
    for (const f of firmadas ?? []) {
      if (f.path && f.signedUrl) urlsEvidencia[f.path] = f.signedUrl
    }
  }

  const tramos = municipioActual ? await obtenerTramosConEstado(supabase, municipioActual) : []

  const partidoFiltro = filtros.municipio ? buscarPartido(filtros.municipio) : undefined
  const partidoActual = !filtros.municipio && capas ? buscarPartido(municipioActual ?? '') : undefined
  const centro: [number, number] = partidoFiltro
    ? [partidoFiltro.lat, partidoFiltro.lng]
    : partidoActual
      ? [partidoActual.lat, partidoActual.lng]
      : puntos[0]
        ? [puntos[0].latitud, puntos[0].longitud]
        : CENTRO_PROVINCIA

  const limites = partidoActual ? await limitesDe(municipioActual) : null

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Mapa de observaciones</h1>
      <Suspense fallback={null}>
        <Filtros municipios={municipios} />
      </Suspense>
      <p className="text-sm text-gray-600">
        {puntos.length} observación(es). Rojo: alta · Amarillo: media · Verde: baja.
      </p>
      <p className="text-sm text-gray-600">Verde: cubierto · Gris: pendiente.</p>
      <MapaCliente
        puntos={puntos}
        centro={centro}
        urlsEvidencia={urlsEvidencia}
        capas={capas}
        limites={limites ?? undefined}
        tramos={tramos}
      />
    </div>
  )
}

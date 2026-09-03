import { MapaCliente } from '@/components/MapaCliente'
import { aPuntos, filtrarPuntos, municipiosDe, type FilaFalla } from '@/lib/fallas'
import { buscarPartido } from '@/lib/partidos'
import { crearClienteServidor } from '@/lib/supabase/server'
import { Filtros } from './Filtros'

type Props = { searchParams: Promise<{ tipo?: string; municipio?: string }> }

const CENTRO_PROVINCIA: [number, number] = [-36.6, -60.0]
const SEGUNDOS_URL_FIRMADA = 60 * 60

export default async function MapaPage({ searchParams }: Props) {
  const filtros = await searchParams
  const supabase = await crearClienteServidor()

  const { data, error } = await supabase
    .from('fallas_deteccion')
    .select('id, tipo_falla, severidad, latitud, longitud, url_evidencia_imagen, created_at, relevamientos(fecha, caminos(municipio))')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) {
    console.error('[mapa]', error.message)
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudo cargar el mapa.</p>
  }

  const todos = aPuntos((data ?? []) as FilaFalla[])
  const puntos = filtrarPuntos(todos, filtros)
  const municipios = municipiosDe(todos)

  const rutas = [...new Set(puntos.map((p) => p.url_evidencia_imagen).filter((r): r is string => Boolean(r)))]
  const urlsEvidencia: Record<string, string> = {}
  if (rutas.length > 0) {
    const { data: firmadas } = await supabase.storage.from('evidencia-vial').createSignedUrls(rutas, SEGUNDOS_URL_FIRMADA)
    for (const f of firmadas ?? []) {
      if (f.path && f.signedUrl) urlsEvidencia[f.path] = f.signedUrl
    }
  }

  const partidoFiltro = filtros.municipio ? buscarPartido(filtros.municipio) : undefined
  const centro: [number, number] = partidoFiltro
    ? [partidoFiltro.lat, partidoFiltro.lng]
    : puntos[0]
      ? [puntos[0].latitud, puntos[0].longitud]
      : CENTRO_PROVINCIA

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Mapa de fallas</h1>
      <Filtros municipios={municipios} />
      <p className="text-sm text-gray-600">
        {puntos.length} falla(s). Rojo: alta · Amarillo: media · Verde: baja.
      </p>
      <MapaCliente puntos={puntos} centro={centro} urlsEvidencia={urlsEvidencia} />
    </div>
  )
}

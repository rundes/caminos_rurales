import { Suspense } from 'react'
import { FiltrosObservaciones } from '@/components/FiltrosObservaciones'
import { MapaCliente } from '@/components/MapaCliente'
import { capasDe } from '@/lib/capas'
import { limitesDe } from '@/lib/capas-servidor'
import { obtenerRugosidadTramos, obtenerTramosConEstadoCacheado } from '@/lib/cobertura-consultas'
import { obtenerCuadrosPorTramoCacheado } from '@/lib/cuadros-consultas'
import { aPuntos, filtrarPuntos, type FilaFalla, type FiltrosFallas } from '@/lib/fallas'
import { buscarPartido } from '@/lib/partidos'
import { crearClienteServidor } from '@/lib/supabase/server'

type Props = { searchParams: Promise<FiltrosFallas> }

const CENTRO_PROVINCIA: [number, number] = [-36.6, -60.0]
const SEGUNDOS_URL_FIRMADA = 60 * 60
const LIMITE_FALLAS = 1000
const AVISO_LIMITE_FALLAS = `Mostrando las últimas ${LIMITE_FALLAS} observaciones.`

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
  const partidoActual = capas ? buscarPartido(municipioActual ?? '') : undefined

  // Cinco consultas independientes entre sí (ninguna depende del resultado de
  // otra): fallas, tramos, rugosidad, cuadros por tramo y límites del
  // municipio. Encadenarlas en `await` secuenciales sumaría sus latencias en
  // cascada por nada; acá corren en paralelo. Tramos y cuadros-por-tramo usan
  // la versión cacheada por municipio (ver `lib/cache.ts`); rugosidad sigue
  // sin cachear porque es una RPC con el cliente del usuario.
  const [{ data, error }, tramos, rugosidad, cuadrosPorTramo, limites] = await Promise.all([
    supabase
      .from('fallas_deteccion')
      .select(
        'id, tipo_falla, severidad, latitud, longitud, url_evidencia_imagen, url_evidencia_video, created_at, origen, magnitud, estado, recorridos(inicio, municipio)',
      )
      .order('created_at', { ascending: false })
      .limit(LIMITE_FALLAS),
    municipioActual ? obtenerTramosConEstadoCacheado(municipioActual) : Promise.resolve([]),
    municipioActual ? obtenerRugosidadTramos(supabase, municipioActual) : Promise.resolve({}),
    municipioActual ? obtenerCuadrosPorTramoCacheado(municipioActual) : Promise.resolve({}),
    partidoActual ? limitesDe(municipioActual) : Promise.resolve(null),
  ])

  if (error) {
    console.error('[mapa]', error.message)
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudo cargar el mapa.</p>
  }

  const todos = aPuntos((data ?? []) as FilaFalla[])
  const puntos = filtrarPuntos(todos, filtros)
  const alcanzoLimiteFallas = todos.length >= LIMITE_FALLAS

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

  const centro: [number, number] = partidoActual
    ? [partidoActual.lat, partidoActual.lng]
    : puntos[0]
      ? [puntos[0].latitud, puntos[0].longitud]
      : CENTRO_PROVINCIA

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Mapa de observaciones</h1>
      <Suspense fallback={null}>
        <FiltrosObservaciones />
      </Suspense>
      <p className="text-sm text-gray-600">
        {puntos.length} observación(es). Observaciones: rojo alta · amarillo media · verde baja.
      </p>
      {alcanzoLimiteFallas && <p className="text-sm text-amber-700">{AVISO_LIMITE_FALLAS}</p>}
      <p className="text-sm text-gray-600">Tramos: verde cubierto · gris pendiente.</p>
      <p className="text-sm text-gray-600">
        Estado estimado: verde bueno · amarillo regular · naranja malo · rojo intransitable · gris sin datos.
      </p>
      <p className="text-sm text-gray-600">Cuadros: puntos azules.</p>
      <MapaCliente
        puntos={puntos}
        centro={centro}
        urlsEvidencia={urlsEvidencia}
        capas={capas}
        limites={limites ?? undefined}
        tramos={tramos}
        rugosidad={rugosidad}
        cuadrosPorTramo={cuadrosPorTramo}
      />
    </div>
  )
}

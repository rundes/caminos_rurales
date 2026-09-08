import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapaTramoCliente } from '@/components/MapaTramoCliente'
import { obtenerProveedor } from '@/lib/almacenamiento'
import { obtenerRugosidadTramos } from '@/lib/cobertura-consultas'
import { formatearKm } from '@/lib/cobertura-resumen'
import { formatearFecha, formatearFechaHora } from '@/lib/fechas'
import { ETIQUETA_CALIDAD } from '@/lib/sensores/colores'
import { ETIQUETA_ESTADO_OBSERVACION, ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_FALLA } from '@/lib/tipos'
import { crearClienteServidor } from '@/lib/supabase/server'

type Props = { params: Promise<{ id: string }> }

const LIMITE_OBSERVACIONES = 200
const LIMITE_CUADROS = 200

export default async function TramoDetallePage({ params }: Props) {
  const { id } = await params
  const supabase = await crearClienteServidor()

  // La política `tramos_select` ya restringe la lectura al municipio propio
  // (`municipio = municipio_actual()`): si el tramo es de otro municipio, o
  // no existe, esta consulta no devuelve fila y directamente da 404 — no
  // hace falta comparar `tramo.municipio` a mano.
  const { data: tramo, error: errorTramo } = await supabase
    .from('tramos')
    .select('id, nombre_codigo, localidad, km, geometria, municipio, activo')
    .eq('id', id)
    .maybeSingle()

  if (errorTramo) console.error('[tramos]', errorTramo.message)
  if (!tramo) notFound()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: perfil, error: errorPerfil } = user
    ? await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
    : { data: null, error: null }
  if (errorPerfil) console.error('[tramos]', errorPerfil.message)
  const puedeGestionar = perfil?.rol === 'municipio' || perfil?.rol === 'auditor'

  // Cuatro consultas independientes entre sí: veces cubierto, última visita,
  // rugosidad estimada (RPC de sesión, no cacheada) y las observaciones y
  // cuadros propios del tramo.
  const [
    { count: veces, error: errorVeces },
    { data: ultima, error: errorUltima },
    rugosidad,
    { data: observaciones, error: errorObs },
    { data: cuadros, error: errorCuadros },
  ] = await Promise.all([
      supabase.from('cobertura_tramos').select('id', { count: 'exact', head: true }).eq('tramo_id', id),
      supabase
        .from('cobertura_tramos')
        .select('created_at')
        .eq('tramo_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      obtenerRugosidadTramos(supabase, tramo.municipio),
      supabase
        .from('fallas_deteccion')
        .select('id, tipo_falla, severidad, estado, origen, created_at, latitud, longitud, url_evidencia_imagen')
        .eq('tramo_id', id)
        .order('created_at', { ascending: false })
        .limit(LIMITE_OBSERVACIONES),
      supabase
        .from('cuadros')
        .select('id, t, latitud, longitud, ruta')
        .eq('tramo_id', id)
        .order('t', { ascending: false })
        .limit(LIMITE_CUADROS),
    ])

  if (errorVeces) console.error('[tramos]', errorVeces.message)
  if (errorUltima) console.error('[tramos]', errorUltima.message)
  if (errorObs) console.error('[tramos]', errorObs.message)
  if (errorCuadros) console.error('[tramos]', errorCuadros.message)

  const filasObservaciones = observaciones ?? []
  const filasCuadros = cuadros ?? []
  const calidad = rugosidad[tramo.id]?.calidad ?? 'sin_dato'

  const rutas = [
    ...new Set([
      ...filasObservaciones.map((o) => o.url_evidencia_imagen).filter((r): r is string => Boolean(r)),
      ...filasCuadros.map((c) => c.ruta),
    ]),
  ]
  const urls = rutas.length > 0 ? await obtenerProveedor().urlsLectura(rutas) : {}

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{tramo.nombre_codigo}</h1>
          {puedeGestionar && (
            <Link
              href={`/dashboard/tramos/${tramo.id}/editar`}
              className="flex min-h-11 items-center rounded-xl border-2 border-green-700 px-4 text-sm font-semibold text-green-800"
            >
              Editar
            </Link>
          )}
        </div>
        {!tramo.activo && (
          <span className="inline-flex w-fit rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">
            Inactivo
          </span>
        )}
        <p className="text-sm text-gray-600">
          {tramo.localidad} · {formatearKm(Number(tramo.km))} km · cubierto {veces ?? 0} {veces === 1 ? 'vez' : 'veces'}
        </p>
        <p className="text-sm text-gray-600">
          Estado estimado: <span className="font-medium">{ETIQUETA_CALIDAD[calidad]}</span>
        </p>
        <p className="text-xs text-gray-400">
          Última visita: {ultima?.created_at ? formatearFecha(ultima.created_at) : 'sin visitas'}
        </p>
      </div>

      <MapaTramoCliente
        geometria={tramo.geometria as [number, number][]}
        calidad={calidad}
        observaciones={filasObservaciones.map((o) => ({
          id: o.id,
          latitud: Number(o.latitud),
          longitud: Number(o.longitud),
          tipo_falla: o.tipo_falla,
          severidad: o.severidad,
        }))}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Observaciones ({filasObservaciones.length})</h2>
        {filasObservaciones.length === 0 ? (
          <p className="text-gray-500">Sin observaciones registradas en este tramo.</p>
        ) : (
          <ul className="divide-y rounded-2xl bg-white shadow-sm">
            {filasObservaciones.map((o) => {
              const url = o.url_evidencia_imagen ? urls[o.url_evidencia_imagen] : undefined
              return (
                <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{ETIQUETA_TIPO_FALLA[o.tipo_falla]}</span>
                    <span className="text-gray-500">
                      {ETIQUETA_SEVERIDAD[o.severidad]} · {o.created_at ? formatearFechaHora(o.created_at) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center px-2 text-green-800 underline"
                      >
                        Ver
                      </a>
                    )}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">
                      {ETIQUETA_ESTADO_OBSERVACION[o.estado]}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Cuadros ({filasCuadros.length})</h2>
        {filasCuadros.length === 0 ? (
          <p className="text-gray-500">Sin cuadros de cámara en este tramo.</p>
        ) : (
          <ul className="divide-y rounded-2xl bg-white shadow-sm">
            {filasCuadros.map((c) => {
              const url = urls[c.ruta]
              return (
                <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{formatearFechaHora(c.t)}</span>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center px-2 text-green-800 underline"
                    >
                      Ver
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

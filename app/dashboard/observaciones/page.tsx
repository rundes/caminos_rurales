import Link from 'next/link'
import { Suspense } from 'react'
import { FiltrosObservaciones } from '@/components/FiltrosObservaciones'
import { obtenerProveedor } from '@/lib/almacenamiento'
import { filtroValido, type FiltrosFallas } from '@/lib/fallas'
import { finDeDia, formatearFechaHora } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/server'
import {
  ETIQUETA_ESTADO_OBSERVACION,
  ETIQUETA_SEVERIDAD,
  ETIQUETA_TIPO_FALLA,
  type EstadoObservacion,
  type OrigenObservacion,
  type Severidad,
  type TipoFalla,
} from '@/lib/tipos'
import { EstadoSelect } from './EstadoSelect'

const ORIGENES: readonly OrigenObservacion[] = ['manual', 'sensor']

const LIMITE_OBSERVACIONES = 500
const AVISO_LIMITE = `Mostrando las últimas ${LIMITE_OBSERVACIONES} observaciones.`

const ETIQUETA_ORIGEN: Record<'manual' | 'sensor', string> = {
  manual: 'Manual',
  sensor: 'Sensor',
}

type Props = { searchParams: Promise<FiltrosFallas> }

export default async function ObservacionesPage({ searchParams }: Props) {
  const filtros = await searchParams
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.error('[observaciones]', 'sin sesión')
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudo cargar tu sesión.</p>
  }

  const { data: perfil, error: errorPerfil } = await supabase
    .from('perfiles')
    .select('rol, municipio_id')
    .eq('id', user.id)
    .maybeSingle()

  if (errorPerfil || !perfil) {
    console.error('[observaciones]', errorPerfil?.message ?? 'perfil no encontrado')
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudo cargar tu perfil.</p>
  }

  const puedeGestionar = perfil.rol === 'municipio' || perfil.rol === 'auditor'

  // Filtros aplicados en la propia consulta (no se trae todo para filtrar en
  // el navegador): cada uno se agrega solo si vino en la URL.
  let consulta = supabase
    .from('fallas_deteccion')
    .select(
      'id, tipo_falla, severidad, origen, estado, created_at, url_evidencia_imagen, tramo_id, recorridos(inicio), tramos(nombre_codigo)',
    )
  const tipo = filtroValido(filtros.tipo, Object.keys(ETIQUETA_TIPO_FALLA) as TipoFalla[])
  const severidad = filtroValido(filtros.severidad, Object.keys(ETIQUETA_SEVERIDAD) as Severidad[])
  const origen = filtroValido(filtros.origen, ORIGENES)
  const estado = filtroValido(filtros.estado, Object.keys(ETIQUETA_ESTADO_OBSERVACION) as EstadoObservacion[])
  if (tipo) consulta = consulta.eq('tipo_falla', tipo)
  if (severidad) consulta = consulta.eq('severidad', severidad)
  if (origen) consulta = consulta.eq('origen', origen)
  if (estado) consulta = consulta.eq('estado', estado)
  if (filtros.desde) consulta = consulta.gte('created_at', filtros.desde)
  if (filtros.hasta) consulta = consulta.lte('created_at', finDeDia(filtros.hasta))

  const [{ data, error }, { data: resumen, error: errorResumen }] = await Promise.all([
    consulta.order('created_at', { ascending: false }).limit(LIMITE_OBSERVACIONES),
    supabase.rpc('resumen_observaciones', { p_municipio: perfil.municipio_id }),
  ])

  if (error) {
    console.error('[observaciones]', error.message)
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudieron cargar las observaciones.</p>
  }
  if (errorResumen) console.error('[observaciones]', errorResumen.message)

  const filas = data ?? []
  const alcanzoLimite = filas.length >= LIMITE_OBSERVACIONES

  const rutas = [...new Set(filas.map((f) => f.url_evidencia_imagen).filter((r): r is string => Boolean(r)))]
  const urlsEvidencia = rutas.length > 0 ? await obtenerProveedor().urlsLectura(rutas) : {}

  const conteos = new Map((resumen ?? []).map((r) => [r.estado, r.total]))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Observaciones</h1>

      <Suspense fallback={null}>
        <FiltrosObservaciones />
      </Suspense>

      <section className="flex flex-wrap gap-2">
        {(Object.keys(ETIQUETA_ESTADO_OBSERVACION) as EstadoObservacion[]).map((estado) => (
          <span key={estado} className="rounded-full bg-white px-3 py-2 text-sm shadow-sm">
            {ETIQUETA_ESTADO_OBSERVACION[estado]}: <strong>{conteos.get(estado) ?? 0}</strong>
          </span>
        ))}
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/observaciones/export?formato=csv"
          className="flex min-h-11 items-center rounded-xl border-2 border-green-700 px-4 text-sm font-semibold text-green-800"
        >
          Exportar CSV
        </Link>
        <Link
          href="/dashboard/observaciones/export?formato=geojson"
          className="flex min-h-11 items-center rounded-xl border-2 border-green-700 px-4 text-sm font-semibold text-green-800"
        >
          Exportar GeoJSON
        </Link>
      </section>

      {alcanzoLimite && <p className="text-sm text-amber-700">{AVISO_LIMITE}</p>}

      {filas.length === 0 ? (
        <p className="text-gray-500">Todavía no hay observaciones.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Severidad</th>
                <th className="px-3 py-2 font-medium">Origen</th>
                <th className="px-3 py-2 font-medium">Tramo</th>
                <th className="px-3 py-2 font-medium">Evidencia</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filas.map((f) => {
                const fecha = f.recorridos?.inicio ?? f.created_at
                const url = f.url_evidencia_imagen ? urlsEvidencia[f.url_evidencia_imagen] : undefined
                return (
                  <tr key={f.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{fecha ? formatearFechaHora(fecha) : '—'}</td>
                    <td className="px-3 py-2">{ETIQUETA_TIPO_FALLA[f.tipo_falla]}</td>
                    <td className="px-3 py-2">{ETIQUETA_SEVERIDAD[f.severidad]}</td>
                    <td className="px-3 py-2">{ETIQUETA_ORIGEN[f.origen]}</td>
                    <td className="px-3 py-2">{f.tramos?.nombre_codigo ?? '—'}</td>
                    <td className="px-3 py-2">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center px-2 text-green-800 underline"
                        >
                          Ver
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {puedeGestionar ? (
                        <EstadoSelect observacionId={f.id} estadoInicial={f.estado} />
                      ) : (
                        <span className="inline-flex min-h-11 items-center rounded-full bg-gray-100 px-3 text-xs font-medium">
                          {ETIQUETA_ESTADO_OBSERVACION[f.estado]}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

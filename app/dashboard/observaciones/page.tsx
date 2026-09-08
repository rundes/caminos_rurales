import Link from 'next/link'
import { formatearFechaHora } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/server'
import {
  ETIQUETA_ESTADO_OBSERVACION,
  ETIQUETA_SEVERIDAD,
  ETIQUETA_TIPO_FALLA,
  type EstadoObservacion,
} from '@/lib/tipos'
import { EstadoSelect } from './EstadoSelect'

const SEGUNDOS_URL_FIRMADA = 60 * 60
const LIMITE_OBSERVACIONES = 500
const AVISO_LIMITE = `Mostrando las últimas ${LIMITE_OBSERVACIONES} observaciones.`
const BUCKET_EVIDENCIA = 'evidencia-vial'

const ETIQUETA_ORIGEN: Record<'manual' | 'sensor', string> = {
  manual: 'Manual',
  sensor: 'Sensor',
}

export default async function ObservacionesPage() {
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

  const [{ data, error }, { data: resumen, error: errorResumen }] = await Promise.all([
    supabase
      .from('fallas_deteccion')
      .select(
        'id, tipo_falla, severidad, origen, estado, created_at, url_evidencia_imagen, tramo_id, recorridos(inicio), tramos(nombre_codigo)',
      )
      .order('created_at', { ascending: false })
      .limit(LIMITE_OBSERVACIONES),
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
  const urlsEvidencia: Record<string, string> = {}
  if (rutas.length > 0) {
    const { data: firmadas } = await supabase.storage.from(BUCKET_EVIDENCIA).createSignedUrls(rutas, SEGUNDOS_URL_FIRMADA)
    for (const f of firmadas ?? []) {
      if (f.path && f.signedUrl) urlsEvidencia[f.path] = f.signedUrl
    }
  }

  const conteos = new Map((resumen ?? []).map((r) => [r.estado, r.total]))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Observaciones</h1>

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
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-green-800 underline">
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

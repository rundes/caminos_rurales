import { Insignia } from '@/components/Insignia'
import { TarjetaCobertura } from '@/components/TarjetaCobertura'
import { obtenerCoberturaMunicipio, obtenerLogrosPropios, obtenerRanking } from '@/lib/cobertura-consultas'
import { formatearNumero } from '@/lib/kpis'
import { crearClienteServidor } from '@/lib/supabase/server'

const TOP = 10
const CODIGOS_BASE = ['primer_recorrido', 'explorador_50km', 'cartografo_200km', 'municipio_100']
const PREFIJO_LOCALIDAD_COMPLETA = 'localidad_completa:'

export default async function RankingPage() {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.error('[ranking]', 'sin sesión')
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudo cargar tu sesión.</p>
  }

  const { data: perfil, error: errorPerfil } = await supabase
    .from('perfiles')
    .select('municipio_id')
    .eq('id', user.id)
    .maybeSingle()

  if (errorPerfil || !perfil) {
    console.error('[ranking]', errorPerfil?.message ?? 'perfil no encontrado')
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudo cargar tu perfil.</p>
  }

  const municipio = perfil.municipio_id

  const [ranking, resumen, logros] = await Promise.all([
    obtenerRanking(supabase, municipio),
    obtenerCoberturaMunicipio(supabase, municipio),
    obtenerLogrosPropios(supabase, user.id),
  ])

  const top10 = ranking.slice(0, TOP)
  const filaPropia = ranking.find((f) => f.usuario_id === user.id)
  const mostrarFilaPropia = Boolean(filaPropia && filaPropia.posicion > TOP)

  const codigosLogrados = new Set(logros.map((l) => l.codigo))
  const codigosPosibles = [
    ...CODIGOS_BASE,
    ...resumen.porLocalidad.map((l) => `${PREFIJO_LOCALIDAD_COMPLETA}${l.localidad}`),
  ]

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Ranking</h1>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Top 10</h2>
        {top10.length > 0 ? (
          <ol className="divide-y">
            {top10.map((fila) => (
              <li key={fila.usuario_id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <span className="w-6 text-sm text-gray-500">{fila.posicion}</span>
                  <span className={fila.usuario_id === user.id ? 'font-semibold text-green-800' : ''}>{fila.nombre}</span>
                </span>
                <span className="text-sm text-gray-600">{formatearNumero(fila.puntos)} pts</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-gray-500">Todavía no hay puntos registrados.</p>
        )}
        {mostrarFilaPropia && filaPropia && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm">
            <span>
              Tu posición: {filaPropia.posicion} · {filaPropia.nombre}
            </span>
            <span className="font-medium text-green-800">{formatearNumero(filaPropia.puntos)} pts</span>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Tus insignias</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {codigosPosibles.map((codigo) => (
            <Insignia key={codigo} codigo={codigo} obtenida={codigosLogrados.has(codigo)} />
          ))}
        </div>
      </section>

      <TarjetaCobertura resumen={resumen} />
    </div>
  )
}

import { KpiCard } from '@/components/KpiCard'
import { formatearFecha } from '@/lib/fechas'
import { formatearNumero, sumarKm } from '@/lib/kpis'
import { crearClienteServidor } from '@/lib/supabase/server'

const CANTIDAD_ULTIMOS = 5

export default async function DashboardPage() {
  const supabase = await crearClienteServidor()

  const [recorridos, observaciones, ultimos] = await Promise.all([
    supabase.from('recorridos').select('km'),
    supabase.from('fallas_deteccion').select('id', { count: 'exact', head: true }),
    supabase
      .from('recorridos')
      .select('id, inicio, km')
      .order('inicio', { ascending: false })
      .limit(CANTIDAD_ULTIMOS),
  ])

  const error = recorridos.error ?? observaciones.error ?? ultimos.error
  if (error) {
    console.error('[dashboard]', error.message)
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudieron cargar los datos.</p>
  }

  const km = sumarKm(recorridos.data ?? [])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Resumen</h1>
      <div className="grid grid-cols-2 gap-4">
        <KpiCard etiqueta="Km relevados" valor={formatearNumero(km)} />
        <KpiCard etiqueta="Observaciones" valor={observaciones.count ?? 0} />
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Últimos recorridos</h2>
        {ultimos.data && ultimos.data.length > 0 ? (
          <ul className="divide-y rounded-2xl bg-white shadow-sm">
            {ultimos.data.map((r) => (
              <li key={r.id} className="flex justify-between px-4 py-3">
                <span>{formatearFecha(r.inicio)}</span>
                <span className="text-sm text-gray-500">{formatearNumero(Number(r.km))} km</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">Todavía no hay recorridos.</p>
        )}
      </section>
    </div>
  )
}

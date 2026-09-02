import { KpiCard } from '@/components/KpiCard'
import { formatearNumero, sumarKm } from '@/lib/kpis'
import { crearClienteServidor } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await crearClienteServidor()

  const [relevamientos, fallas, ultimos] = await Promise.all([
    supabase.from('relevamientos').select('metadata'),
    supabase.from('fallas_deteccion').select('id', { count: 'exact', head: true }),
    supabase
      .from('relevamientos')
      .select('id, fecha, origen_datos, procesado_ia, caminos(nombre_codigo)')
      .order('fecha', { ascending: false })
      .limit(5),
  ])

  const error = relevamientos.error ?? fallas.error ?? ultimos.error
  if (error) {
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">No se pudieron cargar los datos: {error.message}</p>
  }

  const km = sumarKm(relevamientos.data ?? [])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Resumen</h1>
      <div className="grid grid-cols-2 gap-4">
        <KpiCard etiqueta="Km relevados" valor={formatearNumero(km)} />
        <KpiCard etiqueta="Fallas activas" valor={fallas.count ?? 0} />
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Últimos reportes</h2>
        {ultimos.data && ultimos.data.length > 0 ? (
          <ul className="divide-y rounded-2xl bg-white shadow-sm">
            {ultimos.data.map((r) => (
              <li key={r.id} className="flex justify-between px-4 py-3">
                <span>{r.caminos?.nombre_codigo ?? 'Sin camino'}</span>
                <span className="text-sm text-gray-500">
                  {new Date(r.fecha).toLocaleDateString('es-AR')} · {r.procesado_ia ? 'procesado' : 'pendiente'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">Todavía no hay relevamientos.</p>
        )}
      </section>
    </div>
  )
}

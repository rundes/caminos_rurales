import { ETIQUETA_ESTADO } from '@/lib/severidad'
import { crearClienteServidor } from '@/lib/supabase/server'
import { NuevoCaminoForm } from './NuevoCaminoForm'

type Props = { searchParams: Promise<{ q?: string }> }

export default async function CaminosPage({ searchParams }: Props) {
  const { q = '' } = await searchParams
  const supabase = await crearClienteServidor()

  let consulta = supabase
    .from('caminos')
    .select('id, nombre_codigo, estado_general, ultima_actualizacion')
    .order('nombre_codigo')
  if (q.trim()) consulta = consulta.ilike('nombre_codigo', `%${q.trim()}%`)

  const { data: caminos, error } = await consulta

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Caminos</h1>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o código"
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg"
        />
        <button type="submit" className="rounded-xl bg-green-700 px-4 text-white">
          Buscar
        </button>
      </form>

      {error && <p className="rounded-xl bg-red-50 p-4 text-red-800">Error: {error.message}</p>}

      {caminos && caminos.length === 0 && <p className="text-gray-500">No hay caminos cargados.</p>}

      {caminos && caminos.length > 0 && (
        <ul className="divide-y rounded-2xl bg-white shadow-sm">
          {caminos.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <span className="font-medium">{c.nombre_codigo}</span>
              <span className="text-sm text-gray-600">
                {ETIQUETA_ESTADO[c.estado_general ?? 'regular']}
              </span>
            </li>
          ))}
        </ul>
      )}

      <NuevoCaminoForm />
    </div>
  )
}

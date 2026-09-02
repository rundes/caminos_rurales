import Link from 'next/link'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'
import { CargarViajeForm } from './CargarViajeForm'

export default async function CargarViajePage() {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: caminos, error } = await supabase.from('caminos').select('id, nombre_codigo').order('nombre_codigo')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Cargar viaje</h1>
      {error && <p className="rounded-xl bg-red-50 p-4 text-red-800">Error: {error.message}</p>}
      {caminos && caminos.length === 0 && (
        <p className="rounded-xl bg-yellow-50 p-4 text-yellow-800">
          No hay caminos en tu partido. <Link href="/dashboard/caminos" className="underline">Cargá uno primero.</Link>
        </p>
      )}
      <CargarViajeForm caminos={caminos ?? []} uid={user.id} />
    </div>
  )
}

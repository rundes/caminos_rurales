import Link from 'next/link'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'
import { buscarPartido } from '@/lib/partidos'
import { signOut } from '@/app/login/actions'

const ENLACES = [
  { href: '/dashboard', etiqueta: 'Inicio' },
  { href: '/dashboard/caminos', etiqueta: 'Caminos' },
  { href: '/dashboard/mapa', etiqueta: 'Mapa' },
  { href: '/dashboard/ranking', etiqueta: 'Ranking' },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('nombre, rol, municipio_id')
    .eq('id', user.id)
    .maybeSingle()

  if (error) console.error('[dashboard]', error.message)

  const partido = perfil ? buscarPartido(perfil.municipio_id)?.nombre ?? perfil.municipio_id : ''

  return (
    // pb-24 deja espacio libre debajo del contenido para que la nav inferior fija no lo tape
    <div className="min-h-dvh bg-gray-50 pb-24">
      <header className="flex items-center justify-between bg-green-800 px-4 py-3 text-white">
        {error ? (
          <p className="text-sm">No se pudo cargar tu perfil.</p>
        ) : (
          <div>
            <p className="font-semibold">{perfil?.nombre ?? user.email}</p>
            <p className="text-xs opacity-80">
              {partido} · {perfil?.rol ?? 'productor'}
            </p>
          </div>
        )}
        <form action={signOut}>
          <button type="submit" className="rounded-lg bg-green-700 px-3 py-2 text-sm">
            Salir
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t bg-white"
      >
        {ENLACES.map((e) => (
          <Link key={e.href} href={e.href} className="py-4 text-center text-sm font-medium text-green-800">
            {e.etiqueta}
          </Link>
        ))}
      </nav>
    </div>
  )
}

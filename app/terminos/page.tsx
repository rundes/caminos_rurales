import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'
import { TerminosForm } from './TerminosForm'

const PUNTOS = [
  {
    titulo: 'Ubicación mientras usás la app',
    texto:
      'Durante un recorrido la app registra tu ubicación en primer plano, es decir mientras la tenés abierta en la pantalla. La grabación no continúa con la app cerrada ni en segundo plano: si cerrás la app, el recorrido se pausa y podés retomarlo o finalizarlo al volver.',
  },
  {
    titulo: 'Cámara y galería',
    texto:
      'Para adjuntar evidencia a una observación la app te pide acceso a la cámara o a la galería. Las fotos y videos que elijas se suben al servidor junto con la ubicación de la observación. No accedemos a ninguna otra foto de tu teléfono.',
  },
  {
    titulo: 'Quién ve tus datos',
    texto:
      'Tus recorridos, observaciones, evidencia, puntos e insignias son visibles para las demás personas usuarias de tu mismo municipio y para el equipo municipal. No se publican fuera del municipio ni se venden a terceros.',
  },
  {
    titulo: 'Uso de la información',
    texto:
      'Los datos se usan para medir la cobertura del relevamiento de caminos rurales y priorizar el mantenimiento. Podés pedir la baja de tu cuenta y de tus datos escribiendo al municipio.',
  },
]

export default async function TerminosPage() {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('acepto_terminos_at')
    .eq('id', user.id)
    .maybeSingle()

  if (error) console.error('[terminos]', error.message)
  if (perfil?.acepto_terminos_at) redirect('/dashboard')

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold text-green-800">Antes de empezar</h1>
        <p className="mt-2 text-lg text-gray-600">
          Leé cómo funciona el relevamiento y qué datos se registran.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {PUNTOS.map((p) => (
          <section key={p.titulo} className="rounded-xl bg-white px-4 py-4 shadow-sm">
            <h2 className="font-semibold text-green-800">{p.titulo}</h2>
            <p className="mt-1 text-gray-700">{p.texto}</p>
          </section>
        ))}
      </div>

      <TerminosForm />
    </main>
  )
}

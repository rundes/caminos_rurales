import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const RUTAS_PROTEGIDAS = ['/dashboard', '/terminos']

export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          respuesta = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // No poner código entre createServerClient y getClaims.
  const { data } = await supabase.auth.getClaims()
  const usuario = data?.claims

  const ruta = request.nextUrl.pathname
  const esProtegida = RUTAS_PROTEGIDAS.some((p) => ruta.startsWith(p))

  if (esProtegida && !usuario) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (ruta === '/login' && usuario) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    const redireccion = NextResponse.redirect(url)
    // Conservar cookies refrescadas por getClaims en esta misma request.
    respuesta.cookies.getAll().forEach((c) => redireccion.cookies.set(c))
    return redireccion
  }

  return respuesta
}

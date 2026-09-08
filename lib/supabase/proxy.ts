import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Rutas que exigen sesión. Todo lo que no está acá es alcanzable sin login:
 * además de `/login`, eso incluye a propósito el flujo de recuperación de
 * contraseña completo — `/recuperar` (pide el email antes de tener sesión),
 * `/auth/confirm` (exchangea el `code` del enlace emailado por la sesión de
 * recuperación) y `/nueva-clave` (recién tiene sesión propia una vez que ese
 * exchange terminó, así que tampoco puede exigirla de entrada).
 */
const RUTAS_PROTEGIDAS = ['/dashboard', '/terminos', '/pendiente']

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

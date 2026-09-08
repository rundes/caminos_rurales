import { NextResponse, type NextRequest } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/server'

/**
 * `@supabase/ssr` usa PKCE por defecto (necesario para que la sesión se
 * pueda leer en el servidor): el enlace que manda `resetPasswordForEmail`
 * llega acá como `?code=...&next=/nueva-clave`, no con un token en el hash
 * de la URL. Esta ruta exchangea el código por una sesión (`exchangeCodeForSession`)
 * escribiendo las cookies `sb-*` en la respuesta —lo que un Server Component
 * no puede hacer— y de ahí redirige a `next`. Con esto la sesión de
 * recuperación llega a `/nueva-clave` como Server Component normal, sin
 * depender de JavaScript en el cliente.
 */
const DESTINO_POR_DEFECTO = '/nueva-clave'
const DESTINO_ERROR = '/recuperar'

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const next = destinoSeguro(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(new URL(DESTINO_ERROR, request.url))
  }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth-confirm]', error.message)
    return NextResponse.redirect(new URL(DESTINO_ERROR, request.url))
  }

  return NextResponse.redirect(new URL(next, request.url))
}

/** Solo se acepta una ruta relativa propia: nunca redirigir a un origen ajeno a partir de `next`. */
function destinoSeguro(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return DESTINO_POR_DEFECTO
}

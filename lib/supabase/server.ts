import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { envServidor } from '@/lib/env'
import type { Database } from './database.types'

export async function crearClienteServidor() {
  const cookieStore = await cookies()
  const env = envServidor()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Llamado desde un Server Component: el proxy refresca la sesión.
          }
        },
      },
    },
  )
}

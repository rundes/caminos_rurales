import { createBrowserClient } from '@supabase/ssr'
import { envPublico } from '@/lib/env'
import type { Database } from './database.types'

export function crearClienteNavegador() {
  const env = envPublico()
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
}

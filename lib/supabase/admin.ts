import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/** Cliente con clave secreta. Omite RLS. Solo para código de servidor. */
export function crearClienteAdmin() {
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!clave) {
    throw new Error('Falta SUPABASE_SECRET_KEY en el entorno')
  }
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

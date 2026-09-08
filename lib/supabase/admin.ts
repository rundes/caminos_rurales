import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { envServidor } from '@/lib/env'
import type { Database } from './database.types'

/**
 * Cliente con clave secreta. Omite RLS. Solo para código de servidor.
 *
 * `SUPABASE_SECRET_KEY` se lee acá, dentro de la función, y no a nivel de
 * módulo: así el build de Next (que solo necesita las variables públicas)
 * nunca falla por su ausencia. Recién falla en tiempo de ejecución, cuando
 * alguna Server Action que sí la necesita llama a esta función.
 */
export function crearClienteAdmin() {
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!clave) {
    throw new Error('Falta SUPABASE_SECRET_KEY en el entorno')
  }
  const env = envServidor()
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, clave, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

import 'server-only'
import { envServidor } from '@/lib/env'
import { crearProveedorGcs } from './gcs'
import { crearProveedorSupabase } from './supabase'
import type { ProveedorAlmacenamiento } from './tipos'

export type { DestinoSubida, ProveedorAlmacenamiento } from './tipos'
export { valorParaGuardar } from './tipos'

/**
 * Proveedor de almacenamiento según `ALMACENAMIENTO`: `gcs` usa Google Cloud
 * Storage con URL firmada V4; cualquier otro valor (o ninguno) usa Supabase
 * Storage. `envServidor()` ya exige `GCS_BUCKET`/`GCS_SERVICE_ACCOUNT_KEY`
 * cuando `ALMACENAMIENTO=gcs` (ver `lib/env.ts`), con un mensaje que lista
 * las variables faltantes.
 */
export function obtenerProveedor(): ProveedorAlmacenamiento {
  const env = envServidor()
  if (env.ALMACENAMIENTO !== 'gcs') {
    return crearProveedorSupabase()
  }
  return crearProveedorGcs()
}

import 'server-only'
import { crearProveedorGcs } from './gcs'
import { crearProveedorSupabase } from './supabase'
import type { ProveedorAlmacenamiento } from './tipos'

export type { DestinoSubida, ProveedorAlmacenamiento } from './tipos'
export { valorParaGuardar, PREFIJO_GCS } from './tipos'

/**
 * Proveedor de almacenamiento según `ALMACENAMIENTO`: `gcs` usa Google Cloud
 * Storage con URL firmada V4; cualquier otro valor (o ninguno) usa Supabase
 * Storage.
 */
export function obtenerProveedor(): ProveedorAlmacenamiento {
  if ((process.env.ALMACENAMIENTO ?? '').toLowerCase() !== 'gcs') {
    return crearProveedorSupabase()
  }
  if (!process.env.GCS_BUCKET || !process.env.GCS_SERVICE_ACCOUNT_KEY) {
    throw new Error('ALMACENAMIENTO=gcs requiere GCS_BUCKET y GCS_SERVICE_ACCOUNT_KEY')
  }
  return crearProveedorGcs()
}

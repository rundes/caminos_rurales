/** Destino de una subida por URL firmada, listo para `fetch(urlSubida, { method, headers, body })`. */
export type DestinoSubida = {
  urlSubida: string
  metodo: 'PUT'
  headers: Record<string, string>
  /**
   * Valor con el que se puede volver a leer el archivo. En GCS es la URL
   * pública definitiva; en Supabase es la ruta dentro del bucket, que se
   * firma al momento de leer (el objeto todavía no existe cuando se prepara
   * la subida, así que no se puede firmar una URL de lectura por adelantado).
   */
  urlLectura: string
  ruta: string
}

export interface ProveedorAlmacenamiento {
  /** Prepara una subida directa desde el navegador para `ruta`. */
  prepararSubida(ruta: string, contentType: string): Promise<DestinoSubida>
  /** Resuelve una ruta guardada (o una URL ya pública) a una URL legible. */
  urlLectura(rutaOUrl: string): Promise<string>
}

export const PREFIJO_GCS = 'https://storage.googleapis.com/'

/**
 * Valor que el cliente debe guardar en la base para esa evidencia: la URL
 * pública si el proveedor la expone (GCS), o la ruta dentro del bucket
 * (Supabase, que necesita firmarse en cada lectura).
 */
export function valorParaGuardar(destino: DestinoSubida): string {
  return destino.urlLectura.startsWith(PREFIJO_GCS) ? destino.urlLectura : destino.ruta
}

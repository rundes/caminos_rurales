import type { DestinoSubida } from './almacenamiento/tipos'

const ERROR_SUBIDA = 'No se pudo subir la evidencia. Lo reintentamos más tarde.'

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

const FETCH_DEFECTO: Fetcher = (url, init) => fetch(url, init)

/**
 * Sube un archivo al destino firmado por el servidor con un `PUT` directo.
 * Lanza un error genérico en español si la respuesta no es 2xx: la cola de
 * sincronización lo captura y reintenta.
 */
export async function subirArchivo(
  destino: DestinoSubida,
  archivo: Blob,
  fetcher: Fetcher = FETCH_DEFECTO,
): Promise<void> {
  const respuesta = await fetcher(destino.urlSubida, {
    method: destino.metodo,
    headers: destino.headers,
    body: archivo,
  })

  if (!respuesta.ok) {
    console.error('[subida]', `${destino.metodo} ${destino.ruta} → HTTP ${respuesta.status}`)
    throw new Error(ERROR_SUBIDA)
  }
}

/** Destino de una subida por URL firmada, listo para `fetch(urlSubida, { method, headers, body })`. */
export type DestinoSubida = {
  urlSubida: string
  metodo: 'PUT'
  headers: Record<string, string>
  /**
   * Igual a `ruta` en los dos proveedores: ninguno puede firmar una URL de
   * lectura útil por adelantado (el objeto todavía no existe cuando se
   * prepara la subida, y una URL firmada con vencimiento quedaría vieja para
   * cuando alguien la lea de verdad). Se mantiene como campo aparte de `ruta`
   * por estabilidad de la interfaz; el valor a guardar es siempre `ruta`
   * (ver `valorParaGuardar`), y la lectura se firma recién al pedirla, con
   * `urlLectura`/`urlsLectura`.
   */
  urlLectura: string
  ruta: string
}

export interface ProveedorAlmacenamiento {
  /** Prepara una subida directa desde el navegador para `ruta`. */
  prepararSubida(ruta: string, contentType: string): Promise<DestinoSubida>
  /** Resuelve una ruta guardada (o una URL ya usable tal cual) a una URL legible. */
  urlLectura(rutaOUrl: string): Promise<string>
  /**
   * Firma en lote las rutas de `rutas` que no sean ya una URL usable (ver
   * `urlLectura`). Devuelve un mapa ruta -> URL legible; una entrada que no
   * se pudo resolver (objeto inexistente, error del proveedor) simplemente
   * no aparece en el resultado, así una evidencia rota no tira abajo el
   * resto del lote. Pensado para no firmar cientos de rutas una por una en
   * serie (ver `lib/concurrencia.ts`).
   */
  urlsLectura(rutas: readonly string[]): Promise<Record<string, string>>
}

/** Vencimiento de las URLs de lectura firmadas, igual en los dos proveedores. */
export const SEGUNDOS_LECTURA_EXPIRACION = 60 * 60

/** Valor que el cliente debe guardar en la base para esa evidencia: la ruta dentro del bucket. */
export function valorParaGuardar(destino: DestinoSubida): string {
  return destino.ruta
}

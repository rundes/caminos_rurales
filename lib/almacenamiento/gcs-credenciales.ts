/**
 * Parseo y validación de `GCS_SERVICE_ACCOUNT_KEY`, separado de `gcs.ts` para
 * que `lib/env.ts` pueda validar la variable al arrancar (`envServidor()`)
 * sin depender de un módulo que a su vez depende de `envServidor()` (evitaría
 * un ciclo de imports). Nunca registra ni expone el JSON crudo: los mensajes
 * de error solo dicen qué falta o qué está mal formado.
 */

export type CredencialesGcs = { client_email: string; private_key: string }

export type ResultadoCredencialesGcs = { ok: true; datos: CredencialesGcs } | { ok: false; error: string }

/**
 * Valida que `crudo` sea el JSON de una cuenta de servicio de GCS con, como
 * mínimo, `client_email` y `private_key` (lo que `@google-cloud/storage`
 * necesita para firmar URLs). Si falla la firma en tiempo de pedido en vez de
 * acá, el operador se entera recién cuando alguien intenta subir o ver una
 * evidencia.
 */
export function parsearCredencialesGcs(crudo: string): ResultadoCredencialesGcs {
  let json: unknown
  try {
    json = JSON.parse(crudo)
  } catch {
    return { ok: false, error: 'GCS_SERVICE_ACCOUNT_KEY no contiene un JSON válido' }
  }

  if (typeof json !== 'object' || json === null) {
    return { ok: false, error: 'GCS_SERVICE_ACCOUNT_KEY no contiene un JSON válido' }
  }

  const { client_email: clientEmail, private_key: privateKey } = json as Record<string, unknown>
  if (typeof clientEmail !== 'string' || clientEmail.length === 0) {
    return { ok: false, error: 'GCS_SERVICE_ACCOUNT_KEY no tiene "client_email"' }
  }
  if (typeof privateKey !== 'string' || privateKey.length === 0) {
    return { ok: false, error: 'GCS_SERVICE_ACCOUNT_KEY no tiene "private_key"' }
  }

  return { ok: true, datos: { client_email: clientEmail, private_key: privateKey } }
}

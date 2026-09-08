import { headers } from 'next/headers'
import { envServidor } from '@/lib/env'

/**
 * Origen (`https://host`) para construir `redirectTo` en los flujos de auth
 * (recuperar contraseña). Nunca sale de datos que mande el cliente en el
 * body/formData: prioriza `SITE_URL` (fija, pensada para producción) y cae a
 * los headers `host` + `x-forwarded-proto` de la petición entrante, que pone
 * el navegador/proxy, no un campo de formulario editable.
 */
export async function origenActual(): Promise<string> {
  const { SITE_URL } = envServidor()
  if (SITE_URL) return SITE_URL.replace(/\/+$/, '')

  const cabeceras = await headers()
  const host = cabeceras.get('host')
  if (!host) throw new Error('No se pudo determinar el origen de la petición: falta el header host')

  const proto = cabeceras.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

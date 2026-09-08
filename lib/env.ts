import { z } from 'zod'

/**
 * Esquema completo del entorno. `SUPABASE_SECRET_KEY` es opcional a nivel de
 * esquema (no todo código de servidor necesita la clave admin); quien la
 * necesite (p. ej. `lib/supabase/admin.ts`) la exige puntualmente. Cuando
 * `ALMACENAMIENTO=gcs`, `GCS_BUCKET` y `GCS_SERVICE_ACCOUNT_KEY` pasan a ser
 * obligatorias (ver `superRefine` más abajo).
 */
const esquemaBase = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({ message: 'debe ser una URL válida' }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20, { message: 'debe tener al menos 20 caracteres' }),
  SUPABASE_SECRET_KEY: z.string().optional(),
  ALMACENAMIENTO: z.enum(['supabase', 'gcs']).default('supabase'),
  GCS_BUCKET: z.string().optional(),
  GCS_SERVICE_ACCOUNT_KEY: z.string().optional(),
  /**
   * Origen público fijo (por ejemplo `https://visiovial.example`), opcional.
   * Lo usan los flujos de auth (recuperar contraseña) para construir
   * `redirectTo` sin depender de los headers de la petición. Si no está
   * definida, `lib/url-origen.ts` cae a los headers `host`/`x-forwarded-proto`
   * de la petición entrante (nunca del body/formData que manda el cliente).
   */
  SITE_URL: z.string().url({ message: 'debe ser una URL válida' }).optional(),
})

const esquemaServidor = esquemaBase.superRefine((valores, ctx) => {
  if (valores.ALMACENAMIENTO !== 'gcs') return
  if (!valores.GCS_BUCKET) {
    ctx.addIssue({ code: 'custom', path: ['GCS_BUCKET'], message: 'requerida cuando ALMACENAMIENTO=gcs' })
  }
  if (!valores.GCS_SERVICE_ACCOUNT_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['GCS_SERVICE_ACCOUNT_KEY'],
      message: 'requerida cuando ALMACENAMIENTO=gcs',
    })
  }
})

export type EnvServidor = z.infer<typeof esquemaServidor>

export interface EnvPublico {
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string
}

/**
 * Variables públicas para código que puede correr en el navegador. Cada
 * acceso es literal (`process.env.NEXT_PUBLIC_X`) a propósito: así el
 * bundler de Next puede inlinearlo en el bundle del cliente en build time.
 * No pasar por un objeto intermedio ni por acceso dinámico (`process.env[k]`),
 * porque eso rompe el reemplazo estático y el valor quedaría `undefined` en
 * el navegador.
 */
export function envPublico(): EnvPublico {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  }
}

let cacheServidor: EnvServidor | undefined

/**
 * Valida el entorno completo. Pensada para código de servidor únicamente
 * (nunca se debe llamar desde un componente o módulo que corra en el
 * navegador): las variables que valida no viajan al bundle del cliente, así
 * que ahí faltarían y este chequeo fallaría de todas formas, con un mensaje
 * claro en vez de un error oscuro más adelante.
 *
 * El resultado se cachea en memoria: la validación corre una sola vez por
 * proceso.
 */
export function envServidor(): EnvServidor {
  if (cacheServidor) return cacheServidor

  const resultado = esquemaServidor.safeParse(process.env)
  if (!resultado.success) {
    const faltantes = resultado.error.issues
      .map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Variables de entorno inválidas o faltantes: ${faltantes}`)
  }

  cacheServidor = resultado.data
  return cacheServidor
}

/** Solo para tests: limpia la caché de `envServidor`. */
export function limpiarCacheEnvServidor(): void {
  cacheServidor = undefined
}

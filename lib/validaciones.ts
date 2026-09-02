import { z } from 'zod'
import { buscarPartido } from './partidos'

export const esquemaLogin = z.object({
  email: z.email({ message: 'Email inválido' }),
  password: z.string().min(8, { message: 'La contraseña debe tener al menos 8 caracteres' }),
})

export const esquemaRegistro = esquemaLogin.extend({
  nombre: z.string().trim().min(2, { message: 'Ingresá tu nombre' }),
  municipio_id: z
    .string()
    .refine((slug) => buscarPartido(slug) !== undefined, { message: 'Elegí un partido válido' }),
})

export const esquemaCamino = z.object({
  nombre_codigo: z.string().trim().min(2, { message: 'El nombre o código debe tener al menos 2 caracteres' }),
})

export const ORIGENES_DATOS = ['app_sensor', 'camara_dashcam', 'formulario'] as const

export const esquemaRelevamiento = z.object({
  camino_id: z.uuid({ message: 'Elegí un camino' }),
  origen_datos: z.enum(ORIGENES_DATOS, { message: 'Origen de datos inválido' }),
  km: z.coerce.number().min(0, { message: 'Los km no pueden ser negativos' }).max(1000, { message: 'Km fuera de rango' }),
})

export const esquemaProcesarIa = z.object({
  relevamiento_id: z.uuid(),
})

export function primerError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Datos inválidos'
  const campo = issue.path.join('.')
  return campo ? `${campo}: ${issue.message}` : issue.message
}

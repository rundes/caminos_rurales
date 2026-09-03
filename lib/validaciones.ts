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

export function primerError(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue?.message ?? 'Datos inválidos'
}

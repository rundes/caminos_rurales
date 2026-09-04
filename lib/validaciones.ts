import { z } from 'zod'
import { buscarPartido } from './partidos'
import type { CalidadSegmento } from './sensores/tipos'
import { MAX_IMPACTOS, MAX_MUESTRAS } from './sensores/umbrales'
import type { Severidad, TipoFalla } from './tipos'

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

const TIPOS_FALLA = [
  'bache',
  'carcava',
  'acumulacion_agua',
  'falta_alcantarilla',
  'maleza_alta',
  'alcantarilla_rota',
  'senalizacion',
  'otro',
] as const satisfies readonly TipoFalla[]

const SEVERIDADES = ['baja', 'media', 'alta'] as const satisfies readonly Severidad[]

const CALIDADES = [
  'sin_dato',
  'bueno',
  'regular',
  'malo',
  'intransitable',
] as const satisfies readonly CalidadSegmento[]

const MAX_OBSERVACIONES = 200
const MAX_PUNTOS_TRACK = 20000

/** Techos defensivos: valores fuera de rango son ruido del sensor, no datos. */
const MAX_VELOCIDAD_KMH = 400
const MAX_ACELERACION = 500

export const esquemaObservacion = z.object({
  id: z.uuid({ message: 'Observación sin identificador válido' }),
  tipo_falla: z.enum(TIPOS_FALLA, { message: 'Elegí un tipo de observación' }),
  severidad: z.enum(SEVERIDADES, { message: 'Elegí una severidad' }),
  latitud: z
    .number()
    .min(-90, { message: 'Latitud fuera de rango' })
    .max(90, { message: 'Latitud fuera de rango' }),
  longitud: z
    .number()
    .min(-180, { message: 'Longitud fuera de rango' })
    .max(180, { message: 'Longitud fuera de rango' }),
  descripcion: z
    .string()
    .trim()
    .max(500, { message: 'La descripción no puede superar los 500 caracteres' })
    .optional(),
  evidencia: z
    .object({
      ruta: z.string().min(1).max(300, { message: 'Ruta de evidencia inválida' }),
      tipo: z.enum(['imagen', 'video'], { message: 'Tipo de evidencia inválido' }),
    })
    .optional(),
})

const coordenadaTrack = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
])

/**
 * Punto GPS crudo, opcional: lo manda el cliente además del `track`
 * simplificado para que el servidor pueda evaluar la plausibilidad
 * (velocidad entre muestras y precisión media).
 */
const puntoGpsTrack = z.object({
  lat: z.number().min(-90, { message: 'Latitud fuera de rango' }).max(90, { message: 'Latitud fuera de rango' }),
  lng: z
    .number()
    .min(-180, { message: 'Longitud fuera de rango' })
    .max(180, { message: 'Longitud fuera de rango' }),
  t: z.int().min(0, { message: 'Marca de tiempo inválida' }),
  precision: z.number().min(0, { message: 'Precisión inválida' }),
})

const latitud = z
  .number()
  .min(-90, { message: 'Latitud fuera de rango' })
  .max(90, { message: 'Latitud fuera de rango' })

const longitud = z
  .number()
  .min(-180, { message: 'Longitud fuera de rango' })
  .max(180, { message: 'Longitud fuera de rango' })

/** Segmento agregado de sensores (5 s o 100 m) tal como lo manda el cliente. */
export const esquemaMuestra = z.object({
  t: z.int().min(0, { message: 'Marca de tiempo inválida' }),
  lat: latitud,
  lng: longitud,
  velocidadKmh: z.number().min(0).max(MAX_VELOCIDAD_KMH, { message: 'Velocidad fuera de rango' }),
  rumbo: z.number().min(0).max(360, { message: 'Rumbo fuera de rango' }).nullable().default(null),
  altitud: z.number().nullable().default(null),
  rmsVertical: z.number().min(0).max(MAX_ACELERACION, { message: 'Rugosidad fuera de rango' }),
  picoVertical: z.number().min(0).max(MAX_ACELERACION, { message: 'Pico fuera de rango' }),
  frenadas: z.int().min(0, { message: 'Cantidad de frenadas inválida' }),
  laterales: z.int().min(0, { message: 'Cantidad de laterales inválida' }),
  muestras: z.int().min(0, { message: 'Cantidad de muestras inválida' }),
  calidad: z.enum(CALIDADES, { message: 'Calidad de segmento inválida' }),
})

/** Impacto detectado por el acelerómetro; el servidor lo vuelve observación. */
export const esquemaImpacto = z.object({
  t: z.int().min(0, { message: 'Marca de tiempo inválida' }),
  lat: latitud,
  lng: longitud,
  pico: z.number().min(0).max(MAX_ACELERACION, { message: 'Pico fuera de rango' }),
  velocidadKmh: z.number().min(0).max(MAX_VELOCIDAD_KMH, { message: 'Velocidad fuera de rango' }),
})

export const esquemaRecorrido = z
  .object({
    id: z.uuid({ message: 'Recorrido sin identificador válido' }),
    inicio: z.iso.datetime({ message: 'Fecha de inicio inválida' }),
    fin: z.iso.datetime({ message: 'Fecha de fin inválida' }),
    puntosGps: z.int().min(0, { message: 'Cantidad de puntos GPS inválida' }),
    track: z
      .array(coordenadaTrack, { message: 'El recorrido no tiene puntos' })
      .min(2, { message: 'El recorrido necesita al menos 2 puntos' })
      .max(MAX_PUNTOS_TRACK, { message: 'El recorrido tiene demasiados puntos' }),
    puntos: z
      .array(puntoGpsTrack)
      .max(MAX_PUNTOS_TRACK, { message: 'El recorrido tiene demasiados puntos' })
      .optional(),
    observaciones: z
      .array(esquemaObservacion)
      .max(MAX_OBSERVACIONES, { message: 'Demasiadas observaciones en un recorrido' }),
    muestras: z
      .array(esquemaMuestra)
      .max(MAX_MUESTRAS, { message: 'Demasiadas muestras de sensores en un recorrido' })
      .optional(),
    impactos: z
      .array(esquemaImpacto)
      .max(MAX_IMPACTOS, { message: 'Demasiados impactos en un recorrido' })
      .optional(),
  })
  .refine((datos) => Date.parse(datos.fin) >= Date.parse(datos.inicio), {
    message: 'El fin del recorrido no puede ser anterior al inicio',
    path: ['fin'],
  })

export type PuntoGpsPayload = z.infer<typeof puntoGpsTrack>
export type MuestraPayload = z.infer<typeof esquemaMuestra>
export type ImpactoPayload = z.infer<typeof esquemaImpacto>
export type Observacion = z.infer<typeof esquemaObservacion>
export type RecorridoPayload = z.infer<typeof esquemaRecorrido>

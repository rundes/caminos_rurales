import { z } from 'zod'
import { buscarPartido } from './partidos'
import type { CalidadSegmento } from './sensores/tipos'
import { MAX_IMPACTOS, MAX_MUESTRAS, PICO_IMPACTO } from './sensores/umbrales'
import type { EstadoObservacion, Severidad, TipoFalla } from './tipos'

/** Mensaje único de la regla de contraseña: mismo texto en el zod del servidor y en la ayuda del formulario. */
export const MENSAJE_PASSWORD_CORTA = 'La contraseña debe tener al menos 8 caracteres'

export const esquemaLogin = z.object({
  email: z.email({ message: 'Email inválido' }),
  password: z.string().min(8, { message: MENSAJE_PASSWORD_CORTA }),
})

/** Pedido de recuperación de contraseña: solo el email. */
export const esquemaRecuperar = z.object({
  email: z.email({ message: 'Email inválido' }),
})

/** Nueva contraseña, ya con la sesión de recuperación establecida. */
export const esquemaNuevaClave = z.object({
  password: z.string().min(8, { message: MENSAJE_PASSWORD_CORTA }),
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

/** Techo defensivo de vértices de un tramo dibujado a mano (un tramo real de OSM ronda unas pocas decenas). */
const MAX_PUNTOS_TRAMO = 2000

/** Vértice de geometría en formato GeoJSON `[lng, lat]`, igual que `tramos.geometria`. */
const coordenadaTramo = z.tuple([
  z.number().min(-180, { message: 'Longitud fuera de rango' }).max(180, { message: 'Longitud fuera de rango' }),
  z.number().min(-90, { message: 'Latitud fuera de rango' }).max(90, { message: 'Latitud fuera de rango' }),
])

/**
 * Alta/edición de un tramo (municipio/auditor). Deliberadamente sin `km`: se
 * calcula siempre en el servidor a partir de `geometria` (ver `kmDeGeometria`
 * en `lib/tramos.ts`) — un `km` que mandara el cliente inflaría el
 * denominador de cobertura o el progreso propio, así que ni siquiera se
 * declara acá. Como `z.object` descarta claves desconocidas por defecto, un
 * `km` que igual llegara en el payload se ignora sin hacer falta `.strict()`.
 */
export const esquemaTramo = z.object({
  nombreCodigo: z
    .string()
    .trim()
    .min(2, { message: 'El nombre o código debe tener al menos 2 caracteres' })
    .max(120, { message: 'El nombre o código es demasiado largo' }),
  localidad: z
    .string()
    .trim()
    .min(2, { message: 'La localidad debe tener al menos 2 caracteres' })
    .max(120, { message: 'La localidad es demasiado larga' }),
  geometria: z
    .array(coordenadaTramo, { message: 'Dibujá el tramo en el mapa' })
    .min(2, { message: 'Dibujá el tramo con al menos 2 puntos' })
    .max(MAX_PUNTOS_TRAMO, { message: 'El tramo tiene demasiados puntos' }),
  activo: z.boolean(),
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
/** Techo de la rugosidad agregada de un segmento: más alto es ruido del sensor. */
const MAX_ACELERACION_SEGMENTO = 200
/** Techo defensivo de eventos de movimiento agregados en un segmento. */
const MAX_MUESTRAS_SEGMENTO = 100_000

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
  rmsVertical: z.number().min(0).max(MAX_ACELERACION_SEGMENTO, { message: 'Rugosidad fuera de rango' }),
  picoVertical: z.number().min(0).max(MAX_ACELERACION_SEGMENTO, { message: 'Pico fuera de rango' }),
  frenadas: z.int().min(0, { message: 'Cantidad de frenadas inválida' }),
  laterales: z.int().min(0, { message: 'Cantidad de laterales inválida' }),
  muestras: z
    .int()
    .min(0, { message: 'Cantidad de muestras inválida' })
    .max(MAX_MUESTRAS_SEGMENTO, { message: 'Cantidad de muestras inválida' }),
  calidad: z.enum(CALIDADES, { message: 'Calidad de segmento inválida' }),
})

/** Impacto detectado por el acelerómetro; el servidor lo vuelve observación. */
export const esquemaImpacto = z.object({
  t: z.int().min(0, { message: 'Marca de tiempo inválida' }),
  lat: latitud,
  lng: longitud,
  pico: z.number().min(PICO_IMPACTO, { message: 'Impacto por debajo del umbral' }).max(MAX_ACELERACION, {
    message: 'Pico fuera de rango',
  }),
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

/** Techo de cuadros por llamada a `registrarCuadros`: la cola sube de a lotes. */
const MAX_CUADROS_LOTE = 200

/**
 * Cuadro de cámara ya subido al almacenamiento: el servidor solo registra su
 * posición y la ruta del objeto (el binario viajó por separado con un PUT).
 */
export const esquemaCuadro = z.object({
  t: z.int().min(0, { message: 'Marca de tiempo inválida' }),
  lat: latitud,
  lng: longitud,
  rumbo: z.number().min(0).max(360, { message: 'Rumbo fuera de rango' }).nullable().default(null),
  velocidadKmh: z
    .number()
    .min(0)
    .max(MAX_VELOCIDAD_KMH, { message: 'Velocidad fuera de rango' })
    .nullable()
    .default(null),
  ruta: z.string().min(1).max(300, { message: 'Ruta de cuadro inválida' }),
})

export const esquemaCuadros = z.object({
  recorridoId: z.uuid({ message: 'Recorrido sin identificador válido' }),
  cuadros: z
    .array(esquemaCuadro)
    .min(1, { message: 'No hay cuadros para registrar' })
    .max(MAX_CUADROS_LOTE, { message: 'Demasiados cuadros en una sola llamada' }),
})

const ESTADOS_OBSERVACION = [
  'pendiente',
  'en_obra',
  'resuelta',
  'descartada',
] as const satisfies readonly EstadoObservacion[]

/** Cambio de estado de gestión de una observación (municipio/auditor). */
export const esquemaCambioEstado = z.object({
  observacionId: z.uuid({ message: 'Observación sin identificador válido' }),
  estado: z.enum(ESTADOS_OBSERVACION, { message: 'Elegí un estado válido' }),
  nota: z
    .string()
    .trim()
    .max(500, { message: 'La nota no puede superar los 500 caracteres' })
    .optional(),
})

export type PuntoGpsPayload = z.infer<typeof puntoGpsTrack>
export type CuadroPayload = z.infer<typeof esquemaCuadro>
export type CuadrosPayload = z.infer<typeof esquemaCuadros>
export type MuestraPayload = z.infer<typeof esquemaMuestra>
export type ImpactoPayload = z.infer<typeof esquemaImpacto>
export type Observacion = z.infer<typeof esquemaObservacion>
export type RecorridoPayload = z.infer<typeof esquemaRecorrido>
export type CambioEstadoPayload = z.infer<typeof esquemaCambioEstado>
export type RecuperarPayload = z.infer<typeof esquemaRecuperar>
export type NuevaClavePayload = z.infer<typeof esquemaNuevaClave>
export type TramoPayload = z.infer<typeof esquemaTramo>

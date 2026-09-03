export const PUNTOS_KM_NUEVO = 10
export const PUNTOS_KM_REPETIDO = 2
export const PUNTOS_OBSERVACION = 5

const KM_EXPLORADOR = 50
const KM_CARTOGRAFO = 200

export type EventoPuntos = {
  motivo: 'km_nuevos' | 'km_repetidos' | 'observaciones'
  puntos: number
  detalle: string
}

/** Calcula los eventos de puntos de un recorrido. Omite motivos sin puntos. */
export function calcularPuntos(input: {
  kmNuevos: number
  kmRepetidos: number
  observacionesConEvidencia: number
}): EventoPuntos[] {
  const eventos: EventoPuntos[] = []

  const puntosKmNuevos = Math.round(input.kmNuevos * PUNTOS_KM_NUEVO)
  if (puntosKmNuevos > 0) {
    eventos.push({
      motivo: 'km_nuevos',
      puntos: puntosKmNuevos,
      detalle: `${input.kmNuevos.toFixed(1)} km nuevos`,
    })
  }

  const puntosKmRepetidos = Math.round(input.kmRepetidos * PUNTOS_KM_REPETIDO)
  if (puntosKmRepetidos > 0) {
    eventos.push({
      motivo: 'km_repetidos',
      puntos: puntosKmRepetidos,
      detalle: `${input.kmRepetidos.toFixed(1)} km repetidos`,
    })
  }

  const puntosObservaciones = input.observacionesConEvidencia * PUNTOS_OBSERVACION
  if (puntosObservaciones > 0) {
    eventos.push({
      motivo: 'observaciones',
      puntos: puntosObservaciones,
      detalle: `${input.observacionesConEvidencia} observaciones con evidencia`,
    })
  }

  return eventos
}

export type CoberturaLocalidad = { localidad: string; tramos: number; cubiertos: number }

function localidadCompleta(c: CoberturaLocalidad): boolean {
  return c.tramos > 0 && c.cubiertos === c.tramos
}

/** Evalúa qué insignias nuevas corresponden, excluyendo las ya obtenidas. */
export function evaluarInsignias(input: {
  esPrimerRecorrido: boolean
  kmTotalesUsuario: number
  coberturaPorLocalidad: readonly CoberturaLocalidad[]
  yaObtenidas: readonly string[]
}): string[] {
  const candidatas: string[] = []

  if (input.esPrimerRecorrido) candidatas.push('primer_recorrido')
  if (input.kmTotalesUsuario >= KM_EXPLORADOR) candidatas.push('explorador_50km')
  if (input.kmTotalesUsuario >= KM_CARTOGRAFO) candidatas.push('cartografo_200km')

  for (const loc of input.coberturaPorLocalidad) {
    if (localidadCompleta(loc)) candidatas.push(`localidad_completa:${loc.localidad}`)
  }

  const hayLocalidades = input.coberturaPorLocalidad.length > 0
  if (hayLocalidades && input.coberturaPorLocalidad.every(localidadCompleta)) {
    candidatas.push('municipio_100')
  }

  const yaObtenidas = new Set(input.yaObtenidas)
  return candidatas.filter((codigo) => !yaObtenidas.has(codigo))
}

const ETIQUETAS_INSIGNIA: Record<string, string> = {
  primer_recorrido: 'Primer recorrido',
  explorador_50km: 'Explorador 50 km',
  cartografo_200km: 'Cartógrafo 200 km',
  municipio_100: 'Municipio 100%',
}

const PREFIJO_LOCALIDAD_COMPLETA = 'localidad_completa:'

/** Etiqueta legible en español para un código de insignia. */
export function ETIQUETA_INSIGNIA(codigo: string): string {
  if (codigo.startsWith(PREFIJO_LOCALIDAD_COMPLETA)) {
    const localidad = codigo.slice(PREFIJO_LOCALIDAD_COMPLETA.length)
    return `Localidad completa: ${localidad}`
  }
  return ETIQUETAS_INSIGNIA[codigo] ?? codigo
}

export const PUNTOS_KM_NUEVO = 10
export const PUNTOS_KM_REPETIDO = 2
export const PUNTOS_OBSERVACION = 5

/**
 * Antitrampa: techo de puntos que un usuario puede sumar en 24 h. El excedente
 * se trunca (los eventos se siguen registrando, con el puntaje recortado).
 */
export const PUNTOS_MAX_DIA = 2000

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

/**
 * Recorta los eventos para que `puntosPreviosDia + total` no supere el tope
 * diario. Reparte en orden y descarta los eventos que quedan en cero.
 */
export function limitarPorTopeDiario(
  eventos: readonly EventoPuntos[],
  puntosPreviosDia: number,
  tope: number = PUNTOS_MAX_DIA,
): EventoPuntos[] {
  let disponible = Math.max(0, tope - Math.max(0, puntosPreviosDia))
  const limitados: EventoPuntos[] = []

  for (const evento of eventos) {
    const otorgados = Math.min(evento.puntos, disponible)
    if (otorgados <= 0) continue
    limitados.push(otorgados === evento.puntos ? evento : { ...evento, puntos: otorgados })
    disponible -= otorgados
  }

  return limitados
}

/** Suma de puntos de una lista de eventos. */
export function totalPuntos(eventos: readonly EventoPuntos[]): number {
  return eventos.reduce((suma, e) => suma + e.puntos, 0)
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

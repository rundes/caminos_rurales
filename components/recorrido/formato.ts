const SEGUNDO_MS = 1000
const MINUTO_S = 60
const HORA_S = 3600

function dosDigitos(n: number): string {
  return String(Math.floor(n)).padStart(2, '0')
}

/** Duración en `mm:ss` (o `h:mm:ss` a partir de una hora). */
export function formatearDuracion(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SEGUNDO_MS))
  const horas = Math.floor(total / HORA_S)
  const minutos = Math.floor((total % HORA_S) / MINUTO_S)
  const segundos = total % MINUTO_S
  if (horas > 0) return `${horas}:${dosDigitos(minutos)}:${dosDigitos(segundos)}`
  return `${dosDigitos(minutos)}:${dosDigitos(segundos)}`
}

/** Kilómetros con dos decimales, formato local. */
export function formatearKm(km: number): string {
  return km.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Precisión GPS redondeada a metros, o un guion si todavía no hay lectura. */
export function formatearPrecision(precision: number | null): string {
  return precision === null ? '—' : `${Math.round(precision)} m`
}

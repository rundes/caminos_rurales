export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

/** Fecha corta (`d/m/aaaa`) en la zona horaria de Argentina, sin importar la del navegador/servidor. */
export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { timeZone: ZONA_HORARIA })
}

/** Hora corta (`hh:mm`) en la zona horaria de Argentina. */
export function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit' })
}

/** Fecha y hora completas, en la zona horaria de Argentina. */
export function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { timeZone: ZONA_HORARIA })
}

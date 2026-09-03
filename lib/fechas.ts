export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { timeZone: ZONA_HORARIA })
}

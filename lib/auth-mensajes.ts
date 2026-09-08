/**
 * Traducción centralizada de los mensajes de error de Supabase Auth. Todas
 * las Server Actions de autenticación (login, registro, recuperar
 * contraseña, reenvío de confirmación) pasan el `error.message` de Supabase
 * por acá antes de mostrarlo: nunca se debe filtrar un mensaje en inglés a
 * la UI, y el mapeo nunca debe revelar si un email existe o no (los mensajes
 * de "no encontrado" no se distinguen del genérico).
 */
const MENSAJES: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'User already registered': 'Ese email ya está registrado',
  'Email not confirmed': 'Confirmá tu email antes de ingresar',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 8 caracteres',
  'New password should be different from the old password.':
    'La contraseña nueva debe ser distinta de la anterior',
  'Email rate limit exceeded': 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.',
  'Auth session missing!': 'Tu sesión venció. Volvé a ingresar.',
}

/** Mensajes de límite de envíos: Supabase agrega un tiempo de espera dinámico al final. */
const PATRON_RATE_LIMIT = /for security purposes|rate limit|too many requests/i

const MENSAJE_GENERICO = 'No se pudo completar la operación. Intentá de nuevo.'
const MENSAJE_RATE_LIMIT = 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.'

/**
 * Traduce un mensaje de error de Supabase Auth al español. Cualquier mensaje
 * no mapeado cae en un genérico (nunca se expone texto en inglés ni detalle
 * interno) y se loguea el original en el servidor para poder mapearlo después.
 */
export function traducirAuth(mensaje: string): string {
  const directo = MENSAJES[mensaje]
  if (directo) return directo

  if (PATRON_RATE_LIMIT.test(mensaje)) return MENSAJE_RATE_LIMIT

  console.error('[auth]', mensaje)
  return MENSAJE_GENERICO
}

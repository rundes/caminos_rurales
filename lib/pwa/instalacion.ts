/**
 * Lógica pura y helpers de navegador para el banner de instalación de la PWA
 * (`components/BannerInstalar.tsx`). Separado del componente para poder
 * testear la máquina de estados sin montar React ni simular eventos DOM.
 */

export type EstadoBanner = 'oculto' | 'instalable' | 'instrucciones_ios'

const CLAVE_DESCARTADO = 'visiovial:banner-instalar-descartado'

/**
 * ¿La persona ya cerró el banner? El modo privado de Safari (y algunos
 * navegadores con cookies de terceros bloqueadas) tiran una excepción al leer
 * `localStorage`: nunca debe romper la app por esto, así que se degrada a
 * "no descartado" en vez de propagar el error.
 */
export function estaDescartado(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(CLAVE_DESCARTADO) === '1'
  } catch (error) {
    console.error('[instalacion]', error)
    return false
  }
}

/** Recuerda que se cerró el banner. Si no se puede guardar, no pasa nada grave: se vuelve a mostrar la próxima vez. */
export function marcarDescartado(): void {
  try {
    localStorage.setItem(CLAVE_DESCARTADO, '1')
  } catch (error) {
    console.error('[instalacion]', error)
  }
}

/** La app ya corre instalada: iOS lo informa en `navigator.standalone`, el resto de los navegadores vía `display-mode`. */
export function estaInstalada(): boolean {
  if (typeof window === 'undefined') return false
  const standaloneIOS = (navigator as Navigator & { standalone?: boolean }).standalone === true
  const standaloneMedia =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  return standaloneIOS || standaloneMedia
}

/**
 * iOS Safari nunca dispara `beforeinstallprompt` (Apple no lo implementó) ni
 * expone ninguna API de detección de features para "se puede agregar a la
 * pantalla de inicio": la única señal disponible es el user-agent y la
 * plataforma. Es una excepción deliberada a "nunca hacer UA sniffing" —acá no
 * existe alternativa por feature detection, así que se documenta y se aísla
 * en esta única función.
 */
export function esIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ se anuncia como "Macintosh" pero con soporte táctil: se distingue de una Mac de escritorio por `maxTouchPoints`.
  const esIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)
  const esOtroNavegadorEnIOS = /crios|fxios|edgios|opios|duckduckgo/i.test(ua)
  const esSafari = /safari/i.test(ua)
  return esIOS && esSafari && !esOtroNavegadorEnIOS
}

export type EntradaEstadoBanner = {
  /** La app ya corre instalada (standalone): nunca hay nada que ofrecer. */
  instalada: boolean
  /** La persona ya cerró el banner antes. */
  descartado: boolean
  /** Llegó `beforeinstallprompt` y el evento sigue vivo para disparar `prompt()`. */
  promptDisponible: boolean
  /** iOS Safari: no hay prompt nativo, se ofrecen instrucciones manuales. */
  iosSafari: boolean
}

/**
 * Máquina de estados pura del banner. `instalada` y `descartado` ganan
 * siempre: no tiene sentido ofrecer instalar algo que ya está instalado ni
 * insistir con algo que la persona ya cerró.
 */
export function calcularEstadoBanner(entrada: EntradaEstadoBanner): EstadoBanner {
  if (entrada.instalada || entrada.descartado) return 'oculto'
  if (entrada.promptDisponible) return 'instalable'
  if (entrada.iosSafari) return 'instrucciones_ios'
  return 'oculto'
}

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  calcularEstadoBanner,
  esIosSafari,
  estaDescartado,
  estaInstalada,
  marcarDescartado,
} from '@/lib/pwa/instalacion'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'

function stubUserAgent(ua: string, platform = '') {
  vi.stubGlobal('navigator', { ...navigator, userAgent: ua, platform, maxTouchPoints: 0 })
}

describe('calcularEstadoBanner', () => {
  test('instalada gana sobre cualquier otra señal', () => {
    expect(
      calcularEstadoBanner({ instalada: true, descartado: false, promptDisponible: true, iosSafari: true }),
    ).toBe('oculto')
  })

  test('descartado gana sobre el prompt disponible', () => {
    expect(
      calcularEstadoBanner({ instalada: false, descartado: true, promptDisponible: true, iosSafari: false }),
    ).toBe('oculto')
  })

  test('con el prompt de Chromium disponible se muestra instalable', () => {
    expect(
      calcularEstadoBanner({ instalada: false, descartado: false, promptDisponible: true, iosSafari: false }),
    ).toBe('instalable')
  })

  test('en iOS Safari sin prompt se muestran las instrucciones manuales', () => {
    expect(
      calcularEstadoBanner({ instalada: false, descartado: false, promptDisponible: false, iosSafari: true }),
    ).toBe('instrucciones_ios')
  })

  test('sin ninguna señal queda oculto', () => {
    expect(
      calcularEstadoBanner({ instalada: false, descartado: false, promptDisponible: false, iosSafari: false }),
    ).toBe('oculto')
  })
})

describe('esIosSafari', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('Safari en iPhone se detecta como iOS Safari', () => {
    stubUserAgent(IPHONE_SAFARI)
    expect(esIosSafari()).toBe(true)
  })

  test('Chrome en iPhone (CriOS) no cuenta: no tiene "Agregar a inicio" del mismo modo', () => {
    stubUserAgent(IPHONE_CHROME)
    expect(esIosSafari()).toBe(false)
  })

  test('Chrome en Android no es iOS', () => {
    stubUserAgent(ANDROID_CHROME)
    expect(esIosSafari()).toBe(false)
  })

  test('iPad con soporte táctil (se anuncia como Macintosh) se detecta igual', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    })
    expect(esIosSafari()).toBe(true)
  })

  test('una Mac de escritorio (sin touch) no es iOS', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })
    expect(esIosSafari()).toBe(false)
  })
})

describe('estaInstalada', () => {
  // jsdom no implementa `matchMedia`: se asigna a mano en vez de `spyOn`
  // (que necesita que la propiedad ya exista) y se borra después.
  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  test('true cuando `display-mode: standalone` matchea', () => {
    vi.stubGlobal('navigator', { ...navigator, standalone: undefined })
    window.matchMedia = (() => ({ matches: true }) as MediaQueryList) as typeof window.matchMedia

    expect(estaInstalada()).toBe(true)
  })

  test('true cuando `navigator.standalone` (iOS) es true, sin necesitar `matchMedia`', () => {
    vi.stubGlobal('navigator', { ...navigator, standalone: true })

    expect(estaInstalada()).toBe(true)
  })

  test('false si ninguna de las dos señales da instalada', () => {
    vi.stubGlobal('navigator', { ...navigator, standalone: false })
    window.matchMedia = (() => ({ matches: false }) as MediaQueryList) as typeof window.matchMedia

    expect(estaInstalada()).toBe(false)
  })

  test('sin `matchMedia` (jsdom sin soporte) y sin `navigator.standalone` no revienta', () => {
    vi.stubGlobal('navigator', { ...navigator, standalone: undefined })

    expect(estaInstalada()).toBe(false)
  })
})

describe('estaDescartado / marcarDescartado', () => {
  beforeEach(() => localStorage.clear())

  test('arranca sin descartar', () => {
    expect(estaDescartado()).toBe(false)
  })

  test('marcarDescartado hace que estaDescartado devuelva true', () => {
    marcarDescartado()
    expect(estaDescartado()).toBe(true)
  })

  test('un localStorage que tira (modo privado) no rompe: se degrada a "no descartado"', () => {
    const original = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(estaDescartado()).toBe(false)

    Storage.prototype.getItem = original
    vi.restoreAllMocks()
  })

  test('un localStorage que tira al escribir no rompe marcarDescartado', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => marcarDescartado()).not.toThrow()

    vi.restoreAllMocks()
  })
})

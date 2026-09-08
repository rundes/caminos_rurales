import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  CLAVE_PREFERENCIA_PRIVACIDAD,
  guardarPreferenciaPrivacidad,
  leerPreferenciaPrivacidad,
} from '@/lib/camara/privacidad-pref'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('preferencia de difuminado de privacidad', () => {
  test('sin nada guardado vale activado (por defecto)', () => {
    expect(leerPreferenciaPrivacidad()).toBe(true)
  })

  test('guarda y recupera la preferencia', () => {
    guardarPreferenciaPrivacidad(false)

    expect(window.localStorage.getItem(CLAVE_PREFERENCIA_PRIVACIDAD)).toBe('0')
    expect(leerPreferenciaPrivacidad()).toBe(false)

    guardarPreferenciaPrivacidad(true)
    expect(leerPreferenciaPrivacidad()).toBe(true)
  })

  test('un localStorage que falla no rompe la lectura: vale el defecto', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('sin acceso')
    })

    expect(leerPreferenciaPrivacidad()).toBe(true)
  })
})

import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  CLAVE_PREFERENCIA_RED,
  guardarPreferenciaRed,
  leerPreferenciaRed,
  redPermitida,
} from '@/lib/camara/red'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('redPermitida', () => {
  test('con "siempre" no mira la conexión', () => {
    expect(redPermitida('siempre', { type: 'cellular' })).toEqual({
      permitida: true,
      verificada: true,
    })
  })

  test('con "wifi" permite solo cuando el navegador informa wifi', () => {
    expect(redPermitida('wifi', { type: 'wifi' })).toEqual({ permitida: true, verificada: true })
    expect(redPermitida('wifi', { type: 'cellular' })).toEqual({
      permitida: false,
      verificada: true,
    })
  })

  test('sin información de red (iOS) deja subir pero sin verificar', () => {
    expect(redPermitida('wifi', undefined)).toEqual({ permitida: true, verificada: false })
    expect(redPermitida('wifi', {})).toEqual({ permitida: true, verificada: false })
  })
})

describe('preferencia de red', () => {
  test('sin nada guardado vale "wifi"', () => {
    expect(leerPreferenciaRed()).toBe('wifi')
  })

  test('guarda y recupera la preferencia', () => {
    guardarPreferenciaRed('siempre')

    expect(window.localStorage.getItem(CLAVE_PREFERENCIA_RED)).toBe('siempre')
    expect(leerPreferenciaRed()).toBe('siempre')

    guardarPreferenciaRed('wifi')
    expect(leerPreferenciaRed()).toBe('wifi')
  })

  test('un localStorage que falla no rompe la lectura', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('sin acceso')
    })

    expect(leerPreferenciaRed()).toBe('wifi')
  })
})

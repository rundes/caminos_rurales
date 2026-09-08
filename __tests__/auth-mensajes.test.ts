import { afterEach, describe, expect, test, vi } from 'vitest'
import { traducirAuth } from '@/lib/auth-mensajes'

describe('traducirAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('traduce mensajes conocidos', () => {
    expect(traducirAuth('Invalid login credentials')).toBe('Email o contraseña incorrectos')
    expect(traducirAuth('User already registered')).toBe('Ese email ya está registrado')
    expect(traducirAuth('Email not confirmed')).toBe('Confirmá tu email antes de ingresar')
  })

  test('traduce mensajes de rate limit, incluso con el tiempo de espera dinámico de Supabase', () => {
    expect(traducirAuth('Email rate limit exceeded')).toMatch(/demasiados intentos/i)
    expect(
      traducirAuth('For security purposes, you can only request this after 42 seconds.'),
    ).toMatch(/demasiados intentos/i)
  })

  test('cae a un mensaje genérico y loguea el original para cualquier mensaje sin mapear', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resultado = traducirAuth('Something totally unexpected from upstream')
    expect(resultado).toBe('No se pudo completar la operación. Intentá de nuevo.')
    expect(spy).toHaveBeenCalledWith('[auth]', 'Something totally unexpected from upstream')
  })

  test('el genérico nunca revela si una cuenta existe o no', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Ningún mensaje de "usuario no encontrado" está mapeado a texto que lo diga.
    expect(traducirAuth('User not found')).toBe('No se pudo completar la operación. Intentá de nuevo.')
  })
})

import { describe, expect, test } from 'vitest'
import {
  esquemaCamino,
  esquemaLogin,
  esquemaRegistro,
  esquemaRelevamiento,
  primerError,
} from '@/lib/validaciones'

describe('esquemaLogin', () => {
  test('acepta email y password válidos', () => {
    expect(esquemaLogin.safeParse({ email: 'a@b.com', password: '12345678' }).success).toBe(true)
  })
  test('rechaza email inválido', () => {
    const r = esquemaLogin.safeParse({ email: 'no', password: '12345678' })
    expect(r.success).toBe(false)
  })
})

describe('esquemaRegistro', () => {
  test('exige nombre y partido válido', () => {
    const r = esquemaRegistro.safeParse({
      email: 'a@b.com',
      password: '12345678',
      nombre: 'Ana',
      municipio_id: 'carlos-tejedor',
    })
    expect(r.success).toBe(true)
  })
  test('rechaza partido inexistente', () => {
    const r = esquemaRegistro.safeParse({
      email: 'a@b.com',
      password: '12345678',
      nombre: 'Ana',
      municipio_id: 'narnia',
    })
    expect(r.success).toBe(false)
  })
})

describe('esquemaCamino', () => {
  test('exige nombre_codigo de al menos 2 caracteres', () => {
    expect(esquemaCamino.safeParse({ nombre_codigo: 'A' }).success).toBe(false)
    expect(esquemaCamino.safeParse({ nombre_codigo: 'CR-01' }).success).toBe(true)
  })
})

describe('esquemaRelevamiento', () => {
  test('convierte km desde string y valida origen', () => {
    const r = esquemaRelevamiento.safeParse({
      camino_id: '0d5a3c9a-2f3e-4d1b-9c8a-1b2c3d4e5f60',
      origen_datos: 'formulario',
      km: '12.5',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.km).toBe(12.5)
  })
  test('rechaza km negativos', () => {
    const r = esquemaRelevamiento.safeParse({
      camino_id: '0d5a3c9a-2f3e-4d1b-9c8a-1b2c3d4e5f60',
      origen_datos: 'formulario',
      km: '-1',
    })
    expect(r.success).toBe(false)
  })
})

describe('primerError', () => {
  test('devuelve el primer mensaje legible', () => {
    const r = esquemaLogin.safeParse({ email: 'no', password: '' })
    expect(r.success).toBe(false)
    if (!r.success) expect(primerError(r.error)).toMatch(/email/i)
  })
})

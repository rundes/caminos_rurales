import { describe, expect, test } from 'vitest'
import { esNivelBajo, mensajeBateria } from '@/lib/bateria'

describe('esNivelBajo', () => {
  test('por debajo del 20% y sin cargar es nivel bajo', () => {
    expect(esNivelBajo({ nivel: 0.15, cargando: false })).toBe(true)
  })

  test('exactamente 20% no es bajo (el umbral es estricto)', () => {
    expect(esNivelBajo({ nivel: 0.2, cargando: false })).toBe(false)
  })

  test('por encima del 20% no es bajo', () => {
    expect(esNivelBajo({ nivel: 0.5, cargando: false })).toBe(false)
  })

  test('cargando nunca es bajo, aunque el nivel sea mínimo', () => {
    expect(esNivelBajo({ nivel: 0.02, cargando: true })).toBe(false)
  })
})

describe('mensajeBateria', () => {
  test('sin estado (sin Battery Status API) da un mensaje genérico', () => {
    expect(mensajeBateria(null)).toMatch(/gastan batería rápido/i)
    expect(mensajeBateria(null)).toMatch(/cargador de auto/i)
  })

  test('con nivel bajo y sin cargar el mensaje es más serio y avisa que puede no alcanzar', () => {
    const mensaje = mensajeBateria({ nivel: 0.12, cargando: false })
    expect(mensaje).toMatch(/12%/)
    expect(mensaje).toMatch(/puede no alcanzar/i)
  })

  test('con nivel normal el mensaje solo informa el porcentaje', () => {
    const mensaje = mensajeBateria({ nivel: 0.83, cargando: false })
    expect(mensaje).toMatch(/83%/)
    expect(mensaje).not.toMatch(/puede no alcanzar/i)
  })

  test('nivel bajo pero cargando no dispara el mensaje serio', () => {
    const mensaje = mensajeBateria({ nivel: 0.1, cargando: true })
    expect(mensaje).toMatch(/10%/)
    expect(mensaje).not.toMatch(/puede no alcanzar/i)
  })
})

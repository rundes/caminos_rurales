import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  fijarEstadoGrabacion,
  obtenerEstadoGrabacion,
  obtenerEstadoGrabacionServidor,
  suscribirEstadoGrabacion,
} from '@/lib/local/estado-grabacion'

beforeEach(() => {
  fijarEstadoGrabacion('inactivo')
})

describe('estado-grabacion', () => {
  test('arranca inactivo', () => {
    expect(obtenerEstadoGrabacion()).toBe('inactivo')
  })

  test('el snapshot del servidor siempre es inactivo', () => {
    fijarEstadoGrabacion('grabando')
    expect(obtenerEstadoGrabacionServidor()).toBe('inactivo')
  })

  test('avisa a los oyentes cuando cambia el estado', () => {
    const oyente = vi.fn()
    const desuscribir = suscribirEstadoGrabacion(oyente)

    fijarEstadoGrabacion('grabando')

    expect(oyente).toHaveBeenCalledTimes(1)
    expect(obtenerEstadoGrabacion()).toBe('grabando')

    desuscribir()
    fijarEstadoGrabacion('pausado')
    expect(oyente).toHaveBeenCalledTimes(1)
  })

  test('no avisa si el estado no cambia', () => {
    fijarEstadoGrabacion('grabando')
    const oyente = vi.fn()
    suscribirEstadoGrabacion(oyente)

    fijarEstadoGrabacion('grabando')

    expect(oyente).not.toHaveBeenCalled()
  })
})

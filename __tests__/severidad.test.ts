import { describe, expect, test } from 'vitest'
import { colorSeveridad, estadoDesdeSeveridades } from '@/lib/severidad'

describe('estadoDesdeSeveridades', () => {
  test('sin fallas es bueno', () => {
    expect(estadoDesdeSeveridades([])).toBe('bueno')
  })
  test('solo bajas es bueno', () => {
    expect(estadoDesdeSeveridades(['baja', 'baja'])).toBe('bueno')
  })
  test('alguna media es regular', () => {
    expect(estadoDesdeSeveridades(['baja', 'media'])).toBe('regular')
  })
  test('una o dos altas es malo', () => {
    expect(estadoDesdeSeveridades(['alta', 'media'])).toBe('malo')
    expect(estadoDesdeSeveridades(['alta', 'alta'])).toBe('malo')
  })
  test('tres o más altas es intransitable', () => {
    expect(estadoDesdeSeveridades(['alta', 'alta', 'alta'])).toBe('intransitable')
  })
})

describe('colorSeveridad', () => {
  test('mapea severidad a color', () => {
    expect(colorSeveridad('alta')).toBe('#dc2626')
    expect(colorSeveridad('media')).toBe('#eab308')
    expect(colorSeveridad('baja')).toBe('#16a34a')
  })
})

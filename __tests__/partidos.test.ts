import { describe, expect, test } from 'vitest'
import { PARTIDOS, buscarPartido } from '@/lib/partidos'

describe('partidos', () => {
  test('hay 135 partidos con slug único', () => {
    expect(PARTIDOS).toHaveLength(135)
    const slugs = new Set(PARTIDOS.map((p) => p.slug))
    expect(slugs.size).toBe(135)
  })

  test('cada partido tiene centroide dentro de la provincia', () => {
    for (const p of PARTIDOS) {
      expect(p.lat).toBeGreaterThan(-41.5)
      expect(p.lat).toBeLessThan(-33)
      expect(p.lng).toBeGreaterThan(-64)
      expect(p.lng).toBeLessThan(-56)
    }
  })

  test('buscarPartido devuelve el partido por slug', () => {
    const p = buscarPartido('carlos-tejedor')
    expect(p?.nombre).toBe('Carlos Tejedor')
  })

  test('buscarPartido devuelve undefined si no existe', () => {
    expect(buscarPartido('no-existe')).toBeUndefined()
  })
})

import { describe, expect, test } from 'vitest'
import { sumarKm } from '@/lib/kpis'

describe('sumarKm', () => {
  test('suma metadata.km ignorando valores inválidos', () => {
    const filas = [
      { metadata: { km: 10 } },
      { metadata: { km: '5.5' } },
      { metadata: {} },
      { metadata: null },
      { metadata: { km: 'x' } },
    ]
    expect(sumarKm(filas)).toBe(15.5)
  })
})

import { describe, expect, test } from 'vitest'
import { formatearNumero, sumarKm } from '@/lib/kpis'

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

  test('ignora metadata que no es un objeto con km válido', () => {
    const filas = [
      { metadata: [] },
      { metadata: 'texto' },
      { metadata: { km: [5] } },
      { metadata: { km: true } },
      { metadata: { km: -10 } },
    ]
    expect(sumarKm(filas)).toBe(0)
  })
})

describe('formatearNumero', () => {
  test('usa coma como separador decimal', () => {
    expect(formatearNumero(12.5)).toBe('12,5')
  })

  test('usa punto como separador de miles', () => {
    expect(formatearNumero(1234)).toBe('1.234')
  })
})

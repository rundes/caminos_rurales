import { describe, expect, test } from 'vitest'
import { formatearNumero, sumarKm } from '@/lib/kpis'

describe('sumarKm', () => {
  test('suma los km de los recorridos, incluidos los numeric que llegan como string', () => {
    expect(sumarKm([{ km: 10 }, { km: '5.5' }, { km: 0 }])).toBe(15.5)
  })

  test('ignora km nulos, no numéricos o negativos', () => {
    expect(sumarKm([{ km: null }, { km: 'x' }, { km: -10 }])).toBe(0)
  })

  test('redondea el total a un decimal', () => {
    expect(sumarKm([{ km: 0.05 }, { km: 0.06 }])).toBe(0.1)
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

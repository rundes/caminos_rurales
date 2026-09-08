import { describe, expect, test } from 'vitest'
import { DURACION_COOLDOWN_MS, segundosRestantesCooldown } from '@/lib/reenvio-cooldown'

describe('segundosRestantesCooldown', () => {
  test('sin inicio, no hay cooldown', () => {
    expect(segundosRestantesCooldown(null, Date.now())).toBe(0)
  })

  test('recién empezado, quedan ~60s', () => {
    const inicio = 1_000_000
    expect(segundosRestantesCooldown(inicio, inicio)).toBe(DURACION_COOLDOWN_MS / 1000)
  })

  test('a mitad de camino, redondea hacia arriba', () => {
    const inicio = 1_000_000
    expect(segundosRestantesCooldown(inicio, inicio + 30_500)).toBe(30)
  })

  test('justo al terminar, da 0', () => {
    const inicio = 1_000_000
    expect(segundosRestantesCooldown(inicio, inicio + DURACION_COOLDOWN_MS)).toBe(0)
  })

  test('pasado el cooldown, da 0 (no negativo)', () => {
    const inicio = 1_000_000
    expect(segundosRestantesCooldown(inicio, inicio + DURACION_COOLDOWN_MS + 5_000)).toBe(0)
  })

  test('acepta una duración distinta a la default', () => {
    const inicio = 0
    expect(segundosRestantesCooldown(inicio, 1_000, 5_000)).toBe(4)
  })
})

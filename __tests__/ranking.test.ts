import { describe, expect, test } from 'vitest'
import { seleccionarRanking } from '@/lib/ranking'
import type { FilaRanking } from '@/lib/cobertura-consultas'

function fila(extra: Partial<FilaRanking>): FilaRanking {
  return { usuario_id: 'u0', nombre: 'Nadie', puntos: 0, posicion: 1, ...extra }
}

const FILAS: FilaRanking[] = [
  fila({ usuario_id: 'u1', nombre: 'Ana', puntos: 100, posicion: 1 }),
  fila({ usuario_id: 'u2', nombre: 'Beto', puntos: 90, posicion: 2 }),
  fila({ usuario_id: 'u3', nombre: 'Cora', puntos: 80, posicion: 3 }),
]

describe('seleccionarRanking', () => {
  test('cuando el usuario está en el top, no lo muestra aparte', () => {
    const r = seleccionarRanking(FILAS, 'u2', 10)
    expect(r.top).toEqual(FILAS)
    expect(r.propia).toEqual(FILAS[1])
    expect(r.mostrarPropiaAparte).toBe(false)
  })

  test('cuando el usuario queda fuera del top, lo devuelve aparte', () => {
    const filas = Array.from({ length: 12 }, (_, i) =>
      fila({ usuario_id: `u${i + 1}`, nombre: `U${i + 1}`, puntos: 100 - i, posicion: i + 1 }),
    )
    const r = seleccionarRanking(filas, 'u12', 10)
    expect(r.top).toHaveLength(10)
    expect(r.top.map((f) => f.usuario_id)).not.toContain('u12')
    expect(r.propia).toEqual(filas[11])
    expect(r.mostrarPropiaAparte).toBe(true)
  })

  test('cuando el usuario no tiene fila, propia es null y no se muestra aparte', () => {
    const r = seleccionarRanking(FILAS, 'ausente', 10)
    expect(r.propia).toBeNull()
    expect(r.mostrarPropiaAparte).toBe(false)
    expect(r.top).toEqual(FILAS)
  })

  test('respeta el top por defecto de 10', () => {
    const filas = Array.from({ length: 15 }, (_, i) =>
      fila({ usuario_id: `u${i + 1}`, nombre: `U${i + 1}`, puntos: 100 - i, posicion: i + 1 }),
    )
    const r = seleccionarRanking(filas, 'u1')
    expect(r.top).toHaveLength(10)
  })

  test('con menos filas que el top, devuelve todas', () => {
    const r = seleccionarRanking(FILAS, 'u1', 10)
    expect(r.top).toHaveLength(3)
  })

  test('sin filas, todo queda vacío', () => {
    const r = seleccionarRanking([], 'u1', 10)
    expect(r).toEqual({ top: [], propia: null, mostrarPropiaAparte: false })
  })
})

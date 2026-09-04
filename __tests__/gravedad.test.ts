import { describe, expect, test } from 'vitest'
import {
  componentesHorizontales,
  crearFiltroGravedad,
  proyectarVertical,
  type Vector3,
} from '@/lib/sensores/gravedad'

const T0 = 1_700_000_000_000
/** Gravedad sobre el eje Z, como un celular apoyado y horizontal. */
const G: Vector3 = [0, 0, 9.8]

describe('crearFiltroGravedad', () => {
  test('converge a la gravedad constante aunque arranque desviado', () => {
    const filtro = crearFiltroGravedad()

    filtro.actualizar(10, 0, 0) // primera lectura: arranque totalmente desviado
    let g: Vector3 = [0, 0, 0]
    for (let i = 0; i < 600; i += 1) g = filtro.actualizar(0, 0, 9.8)

    expect(g[0]).toBeCloseTo(0, 2)
    expect(g[1]).toBeCloseTo(0, 2)
    expect(g[2]).toBeCloseTo(9.8, 2)
  })

  test('sigue la orientación media y no los golpes puntuales', () => {
    const filtro = crearFiltroGravedad()

    filtro.actualizar(0, 0, 9.8)
    const g = filtro.actualizar(0, 0, 30) // un pozo: 20 m/s² de más

    // Con alfa 0.02 el golpe mueve la estimación apenas un 2 %.
    expect(g[2]).toBeCloseTo(9.8 + 0.02 * 20.2, 3)
  })

  test('no está listo hasta que pasa la ventana de calibración', () => {
    const filtro = crearFiltroGravedad()
    filtro.actualizar(0, 0, 9.8)

    expect(filtro.listo(T0)).toBe(false)
    expect(filtro.listo(T0 + 2999)).toBe(false)
    expect(filtro.listo(T0 + 3000)).toBe(true)
  })

  test('sin ninguna lectura nunca está listo', () => {
    const filtro = crearFiltroGravedad()

    expect(filtro.listo(T0)).toBe(false)
    expect(filtro.listo(T0 + 10_000)).toBe(false)
  })
})

describe('proyectarVertical', () => {
  test('devuelve la componente con signo sobre la gravedad', () => {
    expect(proyectarVertical([0, 0, 10], G)).toBeCloseTo(10, 6)
    expect(proyectarVertical([0, 0, -10], G)).toBeCloseTo(-10, 6)
  })

  test('ignora lo que es puramente horizontal', () => {
    expect(proyectarVertical([3, 4, 0], G)).toBeCloseTo(0, 6)
  })

  test('es independiente de cómo esté montado el celular', () => {
    // Mismo golpe, celular apoyado sobre el eje X: la vertical sigue siendo la de `g`.
    expect(proyectarVertical([6, 0, 0], [9.8, 0, 0])).toBeCloseTo(6, 6)
  })

  test('sin gravedad estimada devuelve 0', () => {
    expect(proyectarVertical([1, 2, 3], [0, 0, 0])).toBe(0)
  })
})

describe('componentesHorizontales', () => {
  test('sin dirección de avance devuelve solo la magnitud horizontal', () => {
    const { longitudinal, lateral } = componentesHorizontales([3, 4, 10], G)

    expect(longitudinal).toBeCloseTo(5, 6)
    // Sin referencia no se puede distinguir frenada de curva: no se cuenta nada.
    expect(lateral).toBe(0)
  })

  test('con dirección de avance separa longitudinal de lateral con signo', () => {
    const adelante: Vector3 = [1, 0, 0]

    expect(componentesHorizontales([3, 4, 10], G, adelante)).toEqual({
      longitudinal: expect.closeTo(3, 6),
      lateral: expect.closeTo(4, 6),
    })
    // Frenada: la aceleración va en contra del avance.
    expect(componentesHorizontales([-4, 0, 0], G, adelante).longitudinal).toBeCloseTo(-4, 6)
  })

  test('sin gravedad estimada no separa nada', () => {
    expect(componentesHorizontales([1, 2, 3], [0, 0, 0])).toEqual({ longitudinal: 0, lateral: 0 })
  })

  test('una dirección paralela a la gravedad no sirve de referencia', () => {
    const { longitudinal, lateral } = componentesHorizontales([3, 4, 10], G, [0, 0, 5])

    expect(longitudinal).toBeCloseTo(5, 6)
    expect(lateral).toBe(0)
  })
})

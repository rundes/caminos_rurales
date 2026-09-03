import { describe, expect, test } from 'vitest'
import { distanciaKm, puntoAleatorioEnRadio, puntoEnPoligono, puntoMedio } from '@/lib/geo'

describe('distanciaKm', () => {
  test('distancia entre el mismo punto es 0', () => {
    expect(distanciaKm({ lat: -35, lng: -60 }, { lat: -35, lng: -60 })).toBe(0)
  })

  test('un grado de latitud son ~111 km', () => {
    const d = distanciaKm({ lat: -35, lng: -60 }, { lat: -36, lng: -60 })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })
})

describe('puntoAleatorioEnRadio', () => {
  test('genera puntos dentro del radio', () => {
    const centro = { lat: -35.5, lng: -60.2 }
    for (let i = 0; i < 200; i++) {
      const p = puntoAleatorioEnRadio(centro, 15, Math.random)
      expect(distanciaKm(centro, p)).toBeLessThanOrEqual(15.01)
    }
  })

  test('es determinista con un generador fijo', () => {
    const centro = { lat: -35.5, lng: -60.2 }
    const a = puntoAleatorioEnRadio(centro, 10, () => 0.5)
    const b = puntoAleatorioEnRadio(centro, 10, () => 0.5)
    expect(a).toEqual(b)
  })
})

describe('puntoEnPoligono', () => {
  const cuadrado: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]

  test('detecta un punto dentro del polígono', () => {
    expect(puntoEnPoligono({ lat: 5, lng: 5 }, cuadrado)).toBe(true)
  })

  test('detecta un punto fuera del polígono', () => {
    expect(puntoEnPoligono({ lat: 20, lng: 20 }, cuadrado)).toBe(false)
  })

  test('un punto lejos en ambos ejes está fuera', () => {
    expect(puntoEnPoligono({ lat: -5, lng: -5 }, cuadrado)).toBe(false)
  })
})

describe('puntoMedio', () => {
  test('punto medio de una línea de dos puntos es su medio geométrico', () => {
    const medio = puntoMedio([
      [0, 0],
      [0, 2],
    ])
    expect(medio.lng).toBeCloseTo(0, 5)
    expect(medio.lat).toBeCloseTo(1, 1)
  })

  test('para una sola coordenada devuelve esa coordenada', () => {
    expect(puntoMedio([[-58, -35]])).toEqual({ lng: -58, lat: -35 })
  })

  test('con tramos de distinta longitud, el medio cae en el tramo que acumula la mitad de la distancia', () => {
    // un tramo corto y uno largo: el punto medio por longitud recorrida
    // debe caer dentro del tramo largo, no en el vértice de división por índice
    const medio = puntoMedio([
      [0, 0],
      [0, 0.01],
      [0, 10],
    ])
    expect(medio.lat).toBeGreaterThan(0.01)
    expect(medio.lat).toBeLessThan(10)
  })
})

import { describe, expect, test } from 'vitest'
import { pixelarRegion, pixelarRegiones } from '../desenfoque'

/** `ImageData` de prueba: cada pixel es un color distinto y reconocible
 * (basado en su posición), para poder verificar que el detalle original
 * desaparece dentro de la región pixelada. */
function imagenDePrueba(ancho: number, alto: number): ImageData {
  const data = new Uint8ClampedArray(ancho * alto * 4)
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      const i = (y * ancho + x) * 4
      data[i] = (x * 7) % 256
      data[i + 1] = (y * 13) % 256
      data[i + 2] = (x + y) % 256
      data[i + 3] = 255
    }
  }
  return { data, width: ancho, height: alto, colorSpace: 'srgb' } as ImageData
}

function pixel(datos: ImageData, x: number, y: number): [number, number, number, number] {
  const i = (y * datos.width + x) * 4
  return [datos.data[i], datos.data[i + 1], datos.data[i + 2], datos.data[i + 3]]
}

describe('pixelarRegion', () => {
  test('cada bloque queda con un único color uniforme: el detalle original no sobrevive', () => {
    const datos = imagenDePrueba(40, 40)
    pixelarRegion(datos, { x: 0, y: 0, ancho: 20, alto: 20 }, 5)

    for (let by = 0; by < 20; by += 5) {
      for (let bx = 0; bx < 20; bx += 5) {
        const referencia = pixel(datos, bx, by)
        for (let y = by; y < by + 5; y += 1) {
          for (let x = bx; x < bx + 5; x += 1) {
            expect(pixel(datos, x, y)).toEqual(referencia)
          }
        }
      }
    }
  })

  test('los pixeles cambiaron respecto del original dentro de la región', () => {
    const original = imagenDePrueba(20, 20)
    const datos = imagenDePrueba(20, 20)

    pixelarRegion(datos, { x: 0, y: 0, ancho: 20, alto: 20 }, 4)

    let algunoDistinto = false
    for (let i = 0; i < datos.data.length; i += 4) {
      if (datos.data[i] !== original.data[i] || datos.data[i + 1] !== original.data[i + 1]) {
        algunoDistinto = true
        break
      }
    }
    expect(algunoDistinto).toBe(true)
  })

  test('no toca los pixeles fuera de la región', () => {
    const datos = imagenDePrueba(40, 40)
    const original = imagenDePrueba(40, 40)

    pixelarRegion(datos, { x: 10, y: 10, ancho: 10, alto: 10 }, 5)

    expect(pixel(datos, 0, 0)).toEqual(pixel(original, 0, 0))
    expect(pixel(datos, 39, 39)).toEqual(pixel(original, 39, 39))
  })

  test('recorta la región a los límites de la imagen sin tirar error', () => {
    const datos = imagenDePrueba(10, 10)
    expect(() => pixelarRegion(datos, { x: 5, y: 5, ancho: 100, alto: 100 }, 4)).not.toThrow()
  })

  test('una región vacía o fuera de cuadro no hace nada', () => {
    const datos = imagenDePrueba(10, 10)
    const original = imagenDePrueba(10, 10)

    pixelarRegion(datos, { x: 20, y: 20, ancho: 5, alto: 5 }, 4)

    expect(datos.data).toEqual(original.data)
  })
})

describe('pixelarRegiones', () => {
  test('pixela varias regiones sobre el mismo ImageData', () => {
    const datos = imagenDePrueba(40, 40)
    pixelarRegiones(
      datos,
      [
        { x: 0, y: 0, ancho: 10, alto: 10 },
        { x: 20, y: 20, ancho: 10, alto: 10 },
      ],
      5,
    )

    expect(pixel(datos, 0, 0)).toEqual(pixel(datos, 4, 4))
    expect(pixel(datos, 20, 20)).toEqual(pixel(datos, 24, 24))
  })
})

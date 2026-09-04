import { describe, expect, test } from 'vitest'
import {
  agregarGps,
  agregarMovimiento,
  cerrarSegmentoSiCorresponde,
  crearAgregador,
  lecturaDesdePunto,
  type Agregador,
  type LecturaGps,
} from '@/lib/sensores/agregador'

const T0 = 1_700_000_000_000
const LAT = -36.85
const LNG = -57.88

function gps(cambios: Partial<LecturaGps> = {}): LecturaGps {
  return { lat: LAT, lng: LNG, velocidadKmh: 40, rumbo: 90, altitud: 12, t: T0, ...cambios }
}

/** Agregador con una lectura GPS y `cantidad` eventos de movimiento de `az`. */
function conMovimiento(az: number, cantidad: number, lectura = gps()): Agregador {
  let estado = agregarGps(crearAgregador(T0), lectura)
  for (let i = 0; i < cantidad; i += 1) {
    estado = agregarMovimiento(estado, { az, aLong: 0, aLat: 0, t: T0 + i })
  }
  return estado
}

describe('cierre del segmento', () => {
  test('cierra a los 5 s y no antes', () => {
    const estado = conMovimiento(0.5, 4)

    expect(cerrarSegmentoSiCorresponde(estado, T0 + 4999).segmento).toBeNull()

    const cierre = cerrarSegmentoSiCorresponde(estado, T0 + 5000)

    expect(cierre.segmento?.t).toBe(T0 + 5000)
    expect(cierre.segmento?.muestras).toBe(4)
    // El estado siguiente arranca vacío pero conserva la última posición.
    expect(cierre.estado.inicio).toBe(T0 + 5000)
    expect(cierre.estado.muestras).toBe(0)
    expect(cierre.estado.origen).toEqual({ lat: LAT, lng: LNG })
  })

  test('cierra a los 100 m antes de los 5 s', () => {
    let estado = conMovimiento(0.5, 3)
    // 0.001° de latitud son ~111 m.
    estado = agregarGps(estado, gps({ lat: LAT + 0.001, t: T0 + 2000 }))

    const cierre = cerrarSegmentoSiCorresponde(estado, T0 + 2000)

    expect(cierre.segmento).not.toBeNull()
    expect(cierre.segmento?.lat).toBeCloseTo(LAT + 0.001, 6)
  })

  test('no cierra por distancia si todavía no recorrió 100 m', () => {
    let estado = conMovimiento(0.5, 3)
    estado = agregarGps(estado, gps({ lat: LAT + 0.0004, t: T0 + 2000 })) // ~44 m

    expect(cerrarSegmentoSiCorresponde(estado, T0 + 2000).segmento).toBeNull()
  })
})

describe('agregado del segmento', () => {
  test('calcula RMS, pico, frenadas y laterales', () => {
    let estado = agregarGps(crearAgregador(T0), gps())
    estado = agregarMovimiento(estado, { az: 1, aLong: -4, aLat: 0, t: T0 })
    estado = agregarMovimiento(estado, { az: -3, aLong: -3, aLat: 4, t: T0 + 1 })
    estado = agregarMovimiento(estado, { az: 0, aLong: 0, aLat: -3, t: T0 + 2 })

    const { segmento } = cerrarSegmentoSiCorresponde(estado, T0 + 5000)

    expect(segmento?.rmsVertical).toBeCloseTo(Math.sqrt(10 / 3), 6)
    expect(segmento?.picoVertical).toBe(3)
    expect(segmento?.muestras).toBe(3)
    // Los umbrales son estrictos: -3 no es frenada y 3 no es lateral.
    expect(segmento?.frenadas).toBe(1)
    expect(segmento?.laterales).toBe(1)
  })

  test('promedia la velocidad de las lecturas y copia rumbo y altitud de la última', () => {
    let estado = agregarGps(crearAgregador(T0), gps({ velocidadKmh: 30 }))
    estado = agregarGps(estado, gps({ velocidadKmh: 50, rumbo: 180, altitud: 20, t: T0 + 1000 }))
    estado = agregarMovimiento(estado, { az: 0.5, aLong: 0, aLat: 0, t: T0 })

    const { segmento } = cerrarSegmentoSiCorresponde(estado, T0 + 5000)

    expect(segmento?.velocidadKmh).toBe(40)
    expect(segmento?.rumbo).toBe(180)
    expect(segmento?.altitud).toBe(20)
    expect(segmento?.calidad).toBe('bueno')
  })

  test('clasifica la calidad por el RMS vertical', () => {
    const calidad = (az: number) =>
      cerrarSegmentoSiCorresponde(conMovimiento(az, 2), T0 + 5000).segmento?.calidad

    expect(calidad(0.5)).toBe('bueno')
    expect(calidad(1)).toBe('regular')
    expect(calidad(2)).toBe('malo')
    expect(calidad(3.5)).toBe('intransitable')
  })

  test('debajo de 15 km/h el segmento queda sin dato', () => {
    const estado = conMovimiento(0.5, 3, gps({ velocidadKmh: 10 }))

    const { segmento } = cerrarSegmentoSiCorresponde(estado, T0 + 5000)

    expect(segmento?.calidad).toBe('sin_dato')
    // Los datos se guardan igual: el km recorrido cuenta aunque no se clasifique.
    expect(segmento?.muestras).toBe(3)
    expect(segmento?.velocidadKmh).toBe(10)
  })
})

describe('segmentos sin GPS', () => {
  test('sin ninguna posición conocida el segmento se descarta', () => {
    let estado = crearAgregador(T0)
    estado = agregarMovimiento(estado, { az: 2, aLong: 0, aLat: 0, t: T0 })

    const cierre = cerrarSegmentoSiCorresponde(estado, T0 + 5000)

    expect(cierre.segmento).toBeNull()
    expect(cierre.estado.inicio).toBe(T0 + 5000)
  })

  test('sin lecturas en la ventana usa la última posición conocida y queda sin dato', () => {
    const primero = cerrarSegmentoSiCorresponde(conMovimiento(0.5, 2), T0 + 5000)
    let estado = primero.estado
    estado = agregarMovimiento(estado, { az: 2, aLong: 0, aLat: 0, t: T0 + 6000 })

    const { segmento } = cerrarSegmentoSiCorresponde(estado, T0 + 10_000)

    expect(segmento?.lat).toBe(LAT)
    expect(segmento?.lng).toBe(LNG)
    expect(segmento?.velocidadKmh).toBe(0)
    expect(segmento?.calidad).toBe('sin_dato')
  })
})

describe('lecturaDesdePunto', () => {
  const punto = { lat: LAT, lng: LNG, t: T0 }

  test('prefiere la velocidad, el rumbo y la altitud del navegador', () => {
    const lectura = lecturaDesdePunto(null, punto, { speed: 10, heading: 90, altitude: 15 })

    expect(lectura.velocidadKmh).toBeCloseTo(36, 6)
    expect(lectura.rumbo).toBe(90)
    expect(lectura.altitud).toBe(15)
  })

  test('sin datos del navegador deriva velocidad y rumbo del punto anterior', () => {
    // 0.001° de latitud hacia el norte (~111 m) en 10 s.
    const lectura = lecturaDesdePunto(punto, { lat: LAT + 0.001, lng: LNG, t: T0 + 10_000 })

    expect(lectura.velocidadKmh).toBeCloseTo(40, 0)
    expect(lectura.rumbo).toBeCloseTo(0, 3)
    expect(lectura.altitud).toBeNull()
  })

  test('sin punto anterior ni datos del navegador no inventa nada', () => {
    const lectura = lecturaDesdePunto(null, punto, { speed: null, heading: null, altitude: null })

    expect(lectura).toEqual({ lat: LAT, lng: LNG, t: T0, velocidadKmh: 0, rumbo: null, altitud: null })
  })

  test('normaliza un rumbo fuera de rango', () => {
    expect(lecturaDesdePunto(null, punto, { heading: 370 }).rumbo).toBe(10)
    expect(lecturaDesdePunto(null, punto, { heading: -90 }).rumbo).toBe(270)
  })
})

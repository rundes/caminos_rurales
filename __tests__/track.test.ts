import { describe, expect, test } from 'vitest'
import {
  derivarCortes,
  derivarCortesDeMuestras,
  derivarCortesPorDistancia,
  evaluarPlausibilidad,
  filtrarPunto,
  kmDeTrack,
  partirEnSegmentos,
  simplificar,
  unionCortes,
  UMBRAL_INTERRUPCION_DISTANCIA_M,
  velocidadMaximaKmh,
  velocidadMediaKmh,
  type PuntoGps,
} from '@/lib/track'

const KM_POR_GRADO = (Math.PI / 180) * 6371
const LAT_BASE = -36.88

function offsetLatKm(km: number): number {
  return km / KM_POR_GRADO
}

function offsetLngKm(km: number, latGrados: number): number {
  return km / (KM_POR_GRADO * Math.cos((latGrados * Math.PI) / 180))
}

function punto(lat: number, lng: number, t = 0, precision = 5): PuntoGps {
  return { lat, lng, t, precision }
}

describe('filtrarPunto', () => {
  test('acepta el primer punto (sin último) si la precisión es buena', () => {
    expect(filtrarPunto(null, punto(LAT_BASE, -60, 0, 10))).toBe(true)
  })

  test('rechaza un punto con precisión peor que el máximo', () => {
    expect(filtrarPunto(null, punto(LAT_BASE, -60, 0, 60))).toBe(false)
  })

  test('rechaza un punto demasiado cercano al último (menos de 5 m)', () => {
    const ultimo = punto(LAT_BASE, -60, 0, 5)
    const nuevo = punto(LAT_BASE + offsetLatKm(0.001), -60, 1, 5) // 1 m
    expect(filtrarPunto(ultimo, nuevo)).toBe(false)
  })

  test('acepta un punto suficientemente lejos del último', () => {
    const ultimo = punto(LAT_BASE, -60, 0, 5)
    const nuevo = punto(LAT_BASE + offsetLatKm(0.01), -60, 1, 5) // 10 m
    expect(filtrarPunto(ultimo, nuevo)).toBe(true)
  })

  test('respeta opciones custom', () => {
    const ultimo = punto(LAT_BASE, -60, 0, 5)
    const nuevo = punto(LAT_BASE + offsetLatKm(0.008), -60, 1, 5) // 8 m
    expect(filtrarPunto(ultimo, nuevo, { precisionMax: 50, distanciaMinM: 10 })).toBe(false)
    expect(filtrarPunto(ultimo, nuevo, { precisionMax: 50, distanciaMinM: 5 })).toBe(true)
  })
})

describe('simplificar', () => {
  test('devuelve el mismo array si hay 2 puntos o menos', () => {
    const puntos = [punto(LAT_BASE, -60, 0), punto(LAT_BASE + 0.01, -60, 1)]
    expect(simplificar(puntos)).toEqual(puntos)
    expect(simplificar([punto(LAT_BASE, -60, 0)])).toEqual([punto(LAT_BASE, -60, 0)])
  })

  test('elimina un punto colineal intermedio', () => {
    const inicio = punto(LAT_BASE, -60, 0)
    const medio = punto(LAT_BASE + offsetLatKm(0.5), -60, 1)
    const fin = punto(LAT_BASE + offsetLatKm(1), -60, 2)
    const resultado = simplificar([inicio, medio, fin], 10)
    expect(resultado).toEqual([inicio, fin])
  })

  test('conserva un punto con desvío de 30 m (tolerancia 10 m)', () => {
    const inicio = punto(LAT_BASE, -60, 0)
    const fin = punto(LAT_BASE + offsetLatKm(1), -60, 2)
    const desviado = punto(
      LAT_BASE + offsetLatKm(0.5),
      -60 + offsetLngKm(0.03, LAT_BASE), // 30 m al este
      1,
    )
    const resultado = simplificar([inicio, desviado, fin], 10)
    expect(resultado).toHaveLength(3)
    expect(resultado[1]).toEqual(desviado)
  })

  test('conserva siempre el primer y el último punto', () => {
    const inicio = punto(LAT_BASE, -60, 0)
    const medio1 = punto(LAT_BASE + offsetLatKm(0.3), -60, 1)
    const medio2 = punto(LAT_BASE + offsetLatKm(0.6), -60, 2)
    const fin = punto(LAT_BASE + offsetLatKm(1), -60, 3)
    const resultado = simplificar([inicio, medio1, medio2, fin], 10)
    expect(resultado[0]).toEqual(inicio)
    expect(resultado[resultado.length - 1]).toEqual(fin)
  })

  test('20 mil puntos casi colineales: no revienta la pila y responde rápido', () => {
    // Pila explícita en vez de recursión: un track largo y casi recto (una
    // ruta rural, el caso más común) no puede depender de la profundidad de
    // la pila de llamadas de JS. El ruido lateral queda por debajo de la
    // tolerancia (5 m < 10 m) salvo un pico ocasional cada 500 puntos (ruido
    // real de GPS): así el algoritmo hace trabajo real (recorta la mayoría,
    // conserva los picos) sin degenerar en el caso cuadrático de un zigzag
    // parejo por encima de la tolerancia en cada punto.
    const CANTIDAD = 20_000
    const puntos: PuntoGps[] = Array.from({ length: CANTIDAD }, (_, i) => {
      const lateralM = i % 500 === 250 ? 20 : (i % 2 === 0 ? 1 : -1) * 5
      return punto(LAT_BASE + offsetLatKm(i * 0.001), -60 + offsetLngKm(lateralM / 1000, LAT_BASE), i)
    })

    const inicioMs = Date.now()
    const resultado = simplificar(puntos, 10)
    const duracionMs = Date.now() - inicioMs

    expect(resultado[0]).toEqual(puntos[0])
    expect(resultado[resultado.length - 1]).toEqual(puntos[CANTIDAD - 1])
    expect(resultado.length).toBeLessThan(CANTIDAD)
    expect(resultado.length).toBeGreaterThan(1)
    expect(duracionMs).toBeLessThan(1000)
  })

  test('caso adversario (partición despareja en cada paso) no desborda la pila', () => {
    // Zigzag con amplitud por encima de la tolerancia en cada punto: el punto
    // más lejano de cada rango termina siempre pegado a un extremo, así que
    // una implementación recursiva acumularía una llamada por punto (miles de
    // cuadros de pila). Con la pila explícita esto es solo iteración.
    const CANTIDAD = 5_000
    const puntos: PuntoGps[] = Array.from({ length: CANTIDAD }, (_, i) => {
      const lateralM = (i % 2 === 0 ? 1 : -1) * 15
      return punto(LAT_BASE + offsetLatKm(i * 0.001), -60 + offsetLngKm(lateralM / 1000, LAT_BASE), i)
    })

    expect(() => simplificar(puntos, 10)).not.toThrow()
    const resultado = simplificar(puntos, 10)
    expect(resultado[0]).toEqual(puntos[0])
    expect(resultado[resultado.length - 1]).toEqual(puntos[CANTIDAD - 1])
  })
})

describe('partirEnSegmentos', () => {
  test('sin cortes devuelve un único segmento con todos los puntos', () => {
    const puntos = [1, 2, 3, 4]

    expect(partirEnSegmentos(puntos, [])).toEqual([[1, 2, 3, 4]])
  })

  test('un corte separa el track en dos segmentos', () => {
    const puntos = [1, 2, 3, 4]

    expect(partirEnSegmentos(puntos, [2])).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  test('varios cortes generan varios segmentos, en orden aunque lleguen desordenados', () => {
    const puntos = [1, 2, 3, 4, 5, 6]

    expect(partirEnSegmentos(puntos, [4, 2])).toEqual([[1, 2], [3, 4], [5, 6]])
  })

  test('cortes fuera de rango o duplicados se ignoran', () => {
    const puntos = [1, 2, 3]

    expect(partirEnSegmentos(puntos, [0, 3, 10, -1, 1, 1])).toEqual([[1], [2, 3]])
  })

  test('track vacío devuelve sin segmentos', () => {
    expect(partirEnSegmentos([], [1])).toEqual([])
  })
})

describe('kmDeTrack', () => {
  test('suma 0 para un solo punto o track vacío', () => {
    expect(kmDeTrack([])).toBe(0)
    expect(kmDeTrack([punto(LAT_BASE, -60)])).toBe(0)
  })

  test('dos puntos separados por 1 km dan ~1 km', () => {
    const a = punto(LAT_BASE, -60)
    const b = punto(LAT_BASE + offsetLatKm(1), -60)
    expect(kmDeTrack([a, b])).toBeCloseTo(1, 2)
  })

  test('suma las distancias de un track de varios puntos', () => {
    const a = punto(LAT_BASE, -60)
    const b = punto(LAT_BASE + offsetLatKm(1), -60)
    const c = punto(LAT_BASE + offsetLatKm(2), -60)
    expect(kmDeTrack([a, b, c])).toBeCloseTo(2, 2)
  })

  test('un hueco de 50 km entre dos segmentos no aporta nada si se pasa el corte', () => {
    const a = punto(LAT_BASE, -60)
    const b = punto(LAT_BASE + offsetLatKm(1), -60) // segmento 1: ~1 km
    const lejos = punto(LAT_BASE + offsetLatKm(51), -60) // salto de 50 km
    const c = punto(LAT_BASE + offsetLatKm(52), -60) // segmento 2: ~1 km

    // sin cortes, el salto de 50 km se suma igual que el resto (comportamiento previo)
    expect(kmDeTrack([a, b, lejos, c])).toBeCloseTo(52, 0)
    // con un corte justo antes de `lejos`, el salto no cuenta: solo 1 + 1 km
    expect(kmDeTrack([a, b, lejos, c], [2])).toBeCloseTo(2, 2)
  })

  test('varios cortes: solo suma la distancia dentro de cada segmento', () => {
    const puntos = [
      punto(LAT_BASE, -60),
      punto(LAT_BASE + offsetLatKm(1), -60),
      punto(LAT_BASE + offsetLatKm(100), -60), // corte antes de este punto
      punto(LAT_BASE + offsetLatKm(101), -60),
      punto(LAT_BASE + offsetLatKm(200), -60), // corte antes de este punto
      punto(LAT_BASE + offsetLatKm(201), -60),
    ]
    // 1 km (seg. 1) + 1 km (seg. 2) + 1 km (seg. 3) = 3 km; los saltos de 99 y 99 km no cuentan
    expect(kmDeTrack(puntos, [2, 4])).toBeCloseTo(3, 1)
  })

  test('un array de cortes vacío se comporta igual que no pasar el parámetro', () => {
    const a = punto(LAT_BASE, -60)
    const b = punto(LAT_BASE + offsetLatKm(1), -60)
    expect(kmDeTrack([a, b], [])).toBe(kmDeTrack([a, b]))
  })
})

describe('derivarCortes', () => {
  test('sin huecos de tiempo no genera ningún corte', () => {
    const puntos = [punto(LAT_BASE, -60, 0), punto(LAT_BASE, -60, 5_000), punto(LAT_BASE, -60, 10_000)]
    expect(derivarCortes(puntos)).toEqual([])
  })

  test('un hueco por encima del umbral genera un corte en el índice del punto siguiente', () => {
    const puntos = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE, -60, 5_000),
      punto(LAT_BASE, -60, 5_000 + 31_000), // 31 s de hueco: por encima del umbral (30 s)
    ]
    expect(derivarCortes(puntos)).toEqual([2])
  })

  test('un hueco justo en el umbral (30 s) no corta; por encima sí', () => {
    const base = [punto(LAT_BASE, -60, 0)]
    expect(derivarCortes([...base, punto(LAT_BASE, -60, 30_000)])).toEqual([])
    expect(derivarCortes([...base, punto(LAT_BASE, -60, 30_001)])).toEqual([1])
  })

  test('varios huecos generan varios cortes, uno por cada hueco', () => {
    const puntos = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE, -60, 40_000),
      punto(LAT_BASE, -60, 45_000),
      punto(LAT_BASE, -60, 90_000),
    ]
    expect(derivarCortes(puntos)).toEqual([1, 3])
  })

  test('respeta un umbral personalizado', () => {
    const puntos = [punto(LAT_BASE, -60, 0), punto(LAT_BASE, -60, 5_000)]
    expect(derivarCortes(puntos, 1_000)).toEqual([1])
    expect(derivarCortes(puntos, 10_000)).toEqual([])
  })

  test('puntos fuera de orden (t no creciente) no generan corte', () => {
    const puntos = [punto(LAT_BASE, -60, 10_000), punto(LAT_BASE, -60, 0)]
    expect(derivarCortes(puntos)).toEqual([])
  })

  test('track vacío o de un solo punto no genera cortes', () => {
    expect(derivarCortes([])).toEqual([])
    expect(derivarCortes([punto(LAT_BASE, -60, 0)])).toEqual([])
  })
})

describe('derivarCortesPorDistancia', () => {
  test('sin saltos grandes no genera ningún corte', () => {
    const puntos = [punto(LAT_BASE, -60), punto(LAT_BASE + offsetLatKm(0.1), -60), punto(LAT_BASE + offsetLatKm(0.2), -60)]
    expect(derivarCortesPorDistancia(puntos)).toEqual([])
  })

  test('un salto por encima del umbral (5 km) genera un corte en el índice del punto siguiente', () => {
    const puntos = [
      punto(LAT_BASE, -60),
      punto(LAT_BASE + offsetLatKm(1), -60),
      punto(LAT_BASE + offsetLatKm(1 + 6), -60), // salto de 6 km: por encima del umbral
    ]
    expect(derivarCortesPorDistancia(puntos)).toEqual([2])
  })

  test('un salto apenas debajo del umbral no corta; apenas por encima sí', () => {
    const base = punto(LAT_BASE, -60)
    const umbralKm = UMBRAL_INTERRUPCION_DISTANCIA_M / 1000
    const debajo = punto(LAT_BASE + offsetLatKm(umbralKm - 0.1), -60)
    const encima = punto(LAT_BASE + offsetLatKm(umbralKm + 0.1), -60)
    expect(derivarCortesPorDistancia([base, debajo])).toEqual([])
    expect(derivarCortesPorDistancia([base, encima])).toEqual([1])
  })

  test('respeta un umbral personalizado', () => {
    const puntos = [punto(LAT_BASE, -60), punto(LAT_BASE + offsetLatKm(0.5), -60)]
    expect(derivarCortesPorDistancia(puntos, 300)).toEqual([1]) // 500 m > 300 m
    expect(derivarCortesPorDistancia(puntos, 600)).toEqual([]) // 500 m < 600 m
  })

  test('track vacío o de un solo punto no genera cortes', () => {
    expect(derivarCortesPorDistancia([])).toEqual([])
    expect(derivarCortesPorDistancia([punto(LAT_BASE, -60)])).toEqual([])
  })

  test('un camino recto simplificado (Douglas-Peucker) de varios km no se corta de más', () => {
    // Un camino rural recto de 3 km, con puntos crudos cada 20 m (espaciado
    // típico a velocidad de relevamiento) y sin ningún desvío lateral: DP con
    // la tolerancia real de subida (10 m, `TOLERANCIA_SIMPLIFICADO_M` en
    // `lib/local/payload.ts`) lo colapsa a sólo dos vértices, así que el
    // salto entre ellos (los 3 km enteros) queda por debajo del umbral de
    // corte por distancia (5 km) y no se corta: un tramo recto real no se
    // subcuenta como si fuera una pausa.
    const CANTIDAD = 151
    const crudos: PuntoGps[] = Array.from({ length: CANTIDAD }, (_, i) => punto(LAT_BASE + offsetLatKm(i * 0.02), -60, i))

    const simplificado = simplificar(crudos, 10)

    expect(simplificado).toHaveLength(2) // colineal: DP conserva sólo los extremos
    expect(derivarCortesPorDistancia(simplificado)).toEqual([])
  })
})

describe('unionCortes', () => {
  test('una sola lista se devuelve ordenada', () => {
    expect(unionCortes([3, 1, 2])).toEqual([1, 2, 3])
  })

  test('combina varias listas sin duplicar índices', () => {
    expect(unionCortes([2, 5], [5, 8], [1])).toEqual([1, 2, 5, 8])
  })

  test('listas vacías no aportan nada', () => {
    expect(unionCortes([], [3], [])).toEqual([3])
    expect(unionCortes([], [])).toEqual([])
    expect(unionCortes()).toEqual([])
  })
})

describe('derivarCortesDeMuestras', () => {
  test('un hueco de tiempo sin salto de distancia igual corta', () => {
    const puntos = [
      { lat: LAT_BASE, lng: -60, t: 0 },
      { lat: LAT_BASE, lng: -60, t: 31_000 }, // 31 s: por encima del umbral de tiempo
    ]
    expect(derivarCortesDeMuestras(puntos)).toEqual([1])
  })

  test('un salto de distancia sin hueco de tiempo igual corta', () => {
    const puntos = [
      { lat: LAT_BASE, lng: -60, t: 0 },
      { lat: LAT_BASE + offsetLatKm(6), lng: -60, t: 1_000 }, // 6 km, 1 s: por encima del umbral de distancia
    ]
    expect(derivarCortesDeMuestras(puntos)).toEqual([1])
  })

  test('sin ninguna de las dos señales no corta', () => {
    const puntos = [
      { lat: LAT_BASE, lng: -60, t: 0 },
      { lat: LAT_BASE + offsetLatKm(0.1), lng: -60, t: 5_000 },
    ]
    expect(derivarCortesDeMuestras(puntos)).toEqual([])
  })

  test('la unión no duplica un índice que cortarían las dos señales a la vez', () => {
    const puntos = [
      { lat: LAT_BASE, lng: -60, t: 0 },
      { lat: LAT_BASE + offsetLatKm(6), lng: -60, t: 60_000 }, // hueco de tiempo Y de distancia
    ]
    expect(derivarCortesDeMuestras(puntos)).toEqual([1])
  })

  test('respeta umbrales personalizados', () => {
    const puntos = [
      { lat: LAT_BASE, lng: -60, t: 0 },
      { lat: LAT_BASE + offsetLatKm(0.5), lng: -60, t: 2_000 },
    ]
    expect(derivarCortesDeMuestras(puntos, { umbralMs: 1_000, umbralDistanciaM: 10_000 })).toEqual([1]) // corta por tiempo
    expect(derivarCortesDeMuestras(puntos, { umbralMs: 10_000, umbralDistanciaM: 300 })).toEqual([1]) // corta por distancia
    expect(derivarCortesDeMuestras(puntos, { umbralMs: 10_000, umbralDistanciaM: 10_000 })).toEqual([])
  })
})

const INICIO = new Date('2026-09-03T10:00:00.000Z')
const UNA_HORA_DESPUES = new Date('2026-09-03T11:00:00.000Z')

describe('velocidadMediaKmh', () => {
  test('50 km en una hora son 50 km/h', () => {
    expect(velocidadMediaKmh(50, INICIO, UNA_HORA_DESPUES)).toBeCloseTo(50, 6)
  })

  test('30 km en media hora son 60 km/h', () => {
    const media = new Date(INICIO.getTime() + 30 * 60 * 1000)
    expect(velocidadMediaKmh(30, INICIO, media)).toBeCloseTo(60, 6)
  })

  test('duración nula con desplazamiento es infinita, sin desplazamiento es 0', () => {
    expect(velocidadMediaKmh(5, INICIO, INICIO)).toBe(Infinity)
    expect(velocidadMediaKmh(0, INICIO, INICIO)).toBe(0)
  })
})

describe('velocidadMaximaKmh', () => {
  test('devuelve la velocidad del segmento más rápido', () => {
    const puntos = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE + offsetLatKm(0.01), -60, 10_000), // 10 m en 10 s = 3,6 km/h
      punto(LAT_BASE + offsetLatKm(1.01), -60, 20_000), // 1 km en 10 s = 360 km/h
    ]
    expect(velocidadMaximaKmh(puntos)).toBeCloseTo(360, 0)
  })

  test('ignora los segmentos de menos de 1 s', () => {
    const puntos = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE + offsetLatKm(1), -60, 500), // salto de 1 km en 0,5 s: se descarta
    ]
    expect(velocidadMaximaKmh(puntos)).toBe(0)
  })

  test('un track de menos de dos puntos no tiene velocidad', () => {
    expect(velocidadMaximaKmh([])).toBe(0)
    expect(velocidadMaximaKmh([punto(LAT_BASE, -60, 0)])).toBe(0)
  })
})

describe('evaluarPlausibilidad', () => {
  test('acepta un recorrido normal de 40 km en una hora', () => {
    const resultado = evaluarPlausibilidad({ km: 40, inicio: INICIO, fin: UNA_HORA_DESPUES })
    expect(resultado).toEqual({ ok: true, motivos: [] })
  })

  test('rechaza una velocidad media por encima del límite', () => {
    const resultado = evaluarPlausibilidad({ km: 150, inicio: INICIO, fin: UNA_HORA_DESPUES })
    expect(resultado.ok).toBe(false)
    expect(resultado.motivos).toEqual([expect.stringMatching(/velocidad media/i)])
  })

  test('rechaza un salto entre muestras por encima del límite', () => {
    const puntos = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE + offsetLatKm(1), -60, 10_000), // 1 km en 10 s = 360 km/h
    ]
    const resultado = evaluarPlausibilidad({ km: 1, inicio: INICIO, fin: UNA_HORA_DESPUES, puntos })
    expect(resultado.ok).toBe(false)
    expect(resultado.motivos).toEqual([expect.stringMatching(/velocidad máxima/i)])
  })

  test('rechaza una precisión media insuficiente', () => {
    const resultado = evaluarPlausibilidad({
      km: 10,
      inicio: INICIO,
      fin: UNA_HORA_DESPUES,
      precisionMedia: 90,
    })
    expect(resultado.ok).toBe(false)
    expect(resultado.motivos).toEqual([expect.stringMatching(/precisión media/i)])
  })

  test('calcula la precisión media desde los puntos cuando no se pasa', () => {
    const puntos = [punto(LAT_BASE, -60, 0, 20), punto(LAT_BASE + offsetLatKm(0.05), -60, 60_000, 120)]
    const resultado = evaluarPlausibilidad({ km: 0.05, inicio: INICIO, fin: UNA_HORA_DESPUES, puntos })
    expect(resultado.ok).toBe(false) // media 70 m > 60 m
    expect(resultado.motivos).toEqual([expect.stringMatching(/precisión media/i)])
  })

  test('rechaza un recorrido que supera el techo de km', () => {
    const dias = new Date(INICIO.getTime() + 24 * 60 * 60 * 1000)
    const resultado = evaluarPlausibilidad({ km: 500, inicio: INICIO, fin: dias })
    expect(resultado.ok).toBe(false)
    expect(resultado.motivos).toEqual([expect.stringMatching(/km fuera de rango/i)])
  })

  test('acumula todos los motivos y respeta límites custom', () => {
    const resultado = evaluarPlausibilidad(
      { km: 500, inicio: INICIO, fin: UNA_HORA_DESPUES, precisionMedia: 90 },
      { velocidadMediaMax: 120, velocidadMaximaMax: 160, precisionMediaMax: 60, kmMaxPorRecorrido: 400 },
    )
    expect(resultado.ok).toBe(false)
    expect(resultado.motivos).toHaveLength(3)

    const laxo = evaluarPlausibilidad(
      { km: 500, inicio: INICIO, fin: UNA_HORA_DESPUES, precisionMedia: 90 },
      { velocidadMediaMax: 600, velocidadMaximaMax: 900, precisionMediaMax: 200, kmMaxPorRecorrido: 900 },
    )
    expect(laxo).toEqual({ ok: true, motivos: [] })
  })
})

import { describe, expect, test } from 'vitest'
import {
  derivarCortes,
  derivarCortesDeCadencia,
  derivarCortesDeMuestras,
  derivarCortesDeTrack,
  derivarCortesPorVelocidad,
  evaluarPlausibilidad,
  filtrarPunto,
  kmDeTrack,
  LIMITES_PLAUSIBILIDAD,
  partirEnSegmentos,
  simplificar,
  unionCortes,
  velocidadMaximaKmh,
  velocidadMediaKmh,
  type PuntoGps,
} from '@/lib/track'

/**
 * Reproduce (para tests) el muestreo por tiempo de `armarCadencia`
 * (`lib/local/payload.ts`): una entrada cada `intervaloMs` de tiempo real
 * transcurrido, tomada de `crudos` en orden, conservando siempre el primer y
 * el último punto. No importa el ajuste adaptativo del intervalo (el tope de
 * `MAX_PUNTOS_CADENCIA_PAYLOAD`): estos tests nunca generan cadencias tan
 * largas como para necesitarlo.
 */
function cadenciaDe(crudos: readonly PuntoGps[], intervaloMs: number): PuntoGps[] {
  if (crudos.length === 0) return []
  const salida: PuntoGps[] = [crudos[0]]
  let proximo = crudos[0].t + intervaloMs
  for (let i = 1; i < crudos.length; i += 1) {
    if (crudos[i].t >= proximo) {
      salida.push(crudos[i])
      proximo = crudos[i].t + intervaloMs
    }
  }
  const ultimo = crudos[crudos.length - 1]
  if (salida[salida.length - 1] !== ultimo) salida.push(ultimo)
  return salida
}

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

describe('derivarCortesPorVelocidad', () => {
  const UMBRAL_KMH = LIMITES_PLAUSIBILIDAD.velocidadMaximaMax // 160 km/h
  const UNA_HORA_MS = 3_600_000

  test('sin velocidad implícita implausible no genera ningún corte', () => {
    const puntos = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE + offsetLatKm(1), -60, 60_000), // 1 km en 60 s = 60 km/h
      punto(LAT_BASE + offsetLatKm(2), -60, 120_000), // otro tanto
    ]
    expect(derivarCortesPorVelocidad(puntos)).toEqual([])
  })

  test('una velocidad implícita por encima del límite genera un corte en el índice del punto siguiente', () => {
    const puntos = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE + offsetLatKm(1), -60, 60_000), // 1 km en 60 s = 60 km/h: normal
      punto(LAT_BASE + offsetLatKm(1 + 6), -60, 60_000 + 10_000), // 6 km en 10 s = 2160 km/h: imposible
    ]
    expect(derivarCortesPorVelocidad(puntos)).toEqual([2])
  })

  test('una velocidad apenas debajo del límite no corta; apenas por encima sí', () => {
    const base = punto(LAT_BASE, -60, 0)
    const debajo = punto(LAT_BASE + offsetLatKm(UMBRAL_KMH - 0.1), -60, UNA_HORA_MS)
    const encima = punto(LAT_BASE + offsetLatKm(UMBRAL_KMH + 0.1), -60, UNA_HORA_MS)
    expect(derivarCortesPorVelocidad([base, debajo])).toEqual([])
    expect(derivarCortesPorVelocidad([base, encima])).toEqual([1])
  })

  test('respeta un umbral personalizado', () => {
    const puntos = [punto(LAT_BASE, -60, 0), punto(LAT_BASE + offsetLatKm(0.5), -60, 60_000)] // 0,5 km en 60 s = 30 km/h
    expect(derivarCortesPorVelocidad(puntos, 20)).toEqual([1]) // 30 km/h > 20 km/h
    expect(derivarCortesPorVelocidad(puntos, 40)).toEqual([]) // 30 km/h < 40 km/h
  })

  test('track vacío o de un solo punto no genera cortes', () => {
    expect(derivarCortesPorVelocidad([])).toEqual([])
    expect(derivarCortesPorVelocidad([punto(LAT_BASE, -60, 0)])).toEqual([])
  })

  test('fail-closed: un desplazamiento real sin tiempo transcurrido (timestamps iguales o invertidos) corta igual', () => {
    // Comprimir dos timestamps al mismo instante (o invertirlos) para
    // esconder un salto no logra esquivar esta señal: se trata como
    // velocidad infinita en vez de ignorarse.
    const a = punto(LAT_BASE, -60, 1_000)
    const mismoInstante = punto(LAT_BASE + offsetLatKm(1), -60, 1_000)
    const instanteAnterior = punto(LAT_BASE + offsetLatKm(2), -60, 500)
    expect(derivarCortesPorVelocidad([a, mismoInstante])).toEqual([1])
    expect(derivarCortesPorVelocidad([a, instanteAnterior])).toEqual([1])
  })

  test('sin desplazamiento, un tiempo nulo o invertido no corta', () => {
    const a = punto(LAT_BASE, -60, 1_000)
    const mismoPunto = punto(LAT_BASE, -60, 1_000)
    const mismoPuntoAntes = punto(LAT_BASE, -60, 500)
    expect(derivarCortesPorVelocidad([a, mismoPunto])).toEqual([])
    expect(derivarCortesPorVelocidad([a, mismoPuntoAntes])).toEqual([])
  })

  test('un camino recto simplificado (Douglas-Peucker) de varios km, recorrido a velocidad normal, no se corta de más', () => {
    // Un camino rural recto de 3 km, con puntos crudos cada 20 m (espaciado
    // típico a velocidad de relevamiento, ~72 km/h a 1 punto por segundo) y
    // sin ningún desvío lateral: DP con la tolerancia real de subida (10 m,
    // `TOLERANCIA_SIMPLIFICADO_M` en `lib/local/payload.ts`) lo colapsa a
    // sólo dos vértices. La distancia entre ellos (los 3 km enteros) es
    // grande, pero el tiempo real transcurrido también lo es: la velocidad
    // implícita sigue siendo la del recorrido real (~72 km/h), muy por
    // debajo del límite físico — un tramo recto real no se subcuenta como si
    // fuera una pausa.
    const CANTIDAD = 151
    const crudos: PuntoGps[] = Array.from({ length: CANTIDAD }, (_, i) =>
      punto(LAT_BASE + offsetLatKm(i * 0.02), -60, i * 1_000),
    )

    const simplificado = simplificar(crudos, 10)

    expect(simplificado).toHaveLength(2) // colineal: DP conserva sólo los extremos
    expect(derivarCortesPorVelocidad(simplificado)).toEqual([])
  })
})

/** PRNG determinístico (mulberry32): el test de ruido GPS no puede ser flaky. */
function mulberry32(semilla: number): () => number {
  let a = semilla
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ruido gaussiano estándar (Box-Muller) a partir de un generador uniforme [0, 1). */
function ruidoGaussiano(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-9)
  const u2 = rand()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

describe('un camino recto real de 20 km con ruido GPS no se corta de más (el caso que exponía el corte por distancia fija)', () => {
  // Reproduce lo medido a mano contra el `simplificar` real: un camino recto
  // de 20 km a 70 km/h muestreado a 1 Hz (1029 puntos crudos) colapsa, con
  // ruido lateral de GPS, a muy pocos vértices tras Douglas-Peucker — la
  // distancia entre ellos puede ser de varios km enteros, muy por encima del
  // viejo umbral fijo de 5 km (`UMBRAL_INTERRUPCION_DISTANCIA_M`), así que
  // ese umbral cortaba un camino recto real relevado de punta a punta. La
  // regla por velocidad no: el tiempo transcurrido entre vértices también es
  // el real, así que la velocidad implícita sigue rondando los 70 km/h.
  const DISTANCIA_KM = 20
  const CANTIDAD_RAW = 1_029 // 20 km a 70 km/h, 1 muestra por segundo (~1028,6 s)

  /**
   * Ruido lateral gaussiano de desvío `sigmaM`, pero *correlado* entre
   * muestras consecutivas (proceso AR(1), `alpha` = correlación entre un
   * instante y el siguiente) en vez de independiente muestra a muestra.
   *
   * Un GPS real no salta de +sigma a -sigma de una lectura a la siguiente a
   * 1 Hz — el error de posición de un receptor real está autocorrelado en el
   * tiempo (el mismo sesgo atmosférico/multipath persiste varios segundos),
   * así que dos fixes consecutivos casi nunca difieren en varias veces sigma
   * entre sí, aunque cada uno individualmente esté a sigma del camino real.
   * Modelar el ruido como independiente por muestra (lo que hacía la primera
   * versión de este test) es más adversarial que cualquier GPS real: dos
   * puntos crudos consecutivos (1 s aparte, ~19 m de avance a 70 km/h) con
   * ruido lateral independiente pueden terminar en lados opuestos de la
   * recta y, si Douglas-Peucker conserva a ambos como vértices, la velocidad
   * implícita entre ellos (dominada por el zigzag del ruido, no por avance
   * real) supera igual el límite físico — un falso positivo de la propia
   * simulación, no del código bajo prueba (con `alpha = 0.8`, 200 semillas x
   * sigma 5/10 no generaron ningún falso corte; con ruido independiente,
   * varias semillas sí).
   */
  function trackRectoConRuido(sigmaM: number, semilla: number, alpha = 0.8): PuntoGps[] {
    const rand = mulberry32(semilla)
    let ruidoPrevio = 0
    return Array.from({ length: CANTIDAD_RAW }, (_, i) => {
      const avanceKm = (i / (CANTIDAD_RAW - 1)) * DISTANCIA_KM
      ruidoPrevio = alpha * ruidoPrevio + Math.sqrt(1 - alpha * alpha) * ruidoGaussiano(rand)
      const ruidoLateralKm = (ruidoPrevio * sigmaM) / 1000
      return punto(LAT_BASE + offsetLatKm(avanceKm), -60 + offsetLngKm(ruidoLateralKm, LAT_BASE), i * 1_000)
    })
  }

  test.each([0, 1, 3, 5])('sigma = %i m de ruido lateral: el km se acredita entero y no se deriva ningún corte', (sigmaM) => {
    const crudos = trackRectoConRuido(sigmaM, 20_260_908 + sigmaM)
    const simplificado = simplificar(crudos, 10)
    const cadencia = cadenciaDe(crudos, 5_000)

    expect(derivarCortesPorVelocidad(simplificado)).toEqual([])
    // El pipeline completo que usa el servidor (`derivarCortesDeTrack`,
    // velocidad sobre el track ∪ cadencia real de fixes): tampoco corta un
    // tramo recto real. Ojo: NO se usa `derivarCortesDeMuestras(simplificado)`
    // acá — esa función combina la señal de *tiempo*, que sobre el track ya
    // simplificado sigue reintroduciendo el mismo falso corte que este test
    // existe para prevenir (ver `derivarCortesDeTrack` en `lib/track.ts`).
    expect(derivarCortesDeTrack(simplificado, cadencia)).toEqual([])
    expect(kmDeTrack(simplificado)).toBeCloseTo(DISTANCIA_KM, 1)
  })

  test('sigma = 10 m: DP conserva muchos más vértices, pero sigue sin cortar (mismo recorrido real)', () => {
    const crudos = trackRectoConRuido(10, 20_260_908 + 10)
    const simplificado = simplificar(crudos, 10)
    const cadencia = cadenciaDe(crudos, 5_000)

    expect(simplificado.length).toBeGreaterThan(2)
    expect(derivarCortesPorVelocidad(simplificado)).toEqual([])
    expect(derivarCortesDeTrack(simplificado, cadencia)).toEqual([])
    // A este nivel de ruido, sumar la geometría zigzagueante de cada
    // vértice conservado (en vez de la recta ideal) infla la distancia
    // medida unos puntos porcentuales por encima de los 20 km reales — el
    // mismo efecto conocido de cualquier distancia GPS acumulada por tramos
    // ruidosos, no una regresión de este cambio: lo que importa acá es que
    // NO se corta nada (arriba), o sea que se acredita de más, nunca de
    // menos.
    const km = kmDeTrack(simplificado)
    expect(km).toBeGreaterThanOrEqual(DISTANCIA_KM)
    expect(km).toBeLessThan(DISTANCIA_KM * 1.05)
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

  test('una velocidad implícita implausible sin hueco de tiempo igual corta', () => {
    const puntos = [
      { lat: LAT_BASE, lng: -60, t: 0 },
      { lat: LAT_BASE + offsetLatKm(6), lng: -60, t: 1_000 }, // 6 km en 1 s: muy por encima del límite de velocidad
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
      { lat: LAT_BASE + offsetLatKm(6), lng: -60, t: 60_000 }, // hueco de tiempo Y velocidad implausible
    ]
    expect(derivarCortesDeMuestras(puntos)).toEqual([1])
  })

  test('respeta umbrales personalizados', () => {
    const puntos = [
      { lat: LAT_BASE, lng: -60, t: 0 },
      { lat: LAT_BASE + offsetLatKm(0.5), lng: -60, t: 2_000 }, // 0,5 km en 2 s = 900 km/h
    ]
    expect(derivarCortesDeMuestras(puntos, { umbralMs: 1_000, velocidadMaxKmh: 10_000 })).toEqual([1]) // corta por tiempo
    expect(derivarCortesDeMuestras(puntos, { umbralMs: 10_000, velocidadMaxKmh: 300 })).toEqual([1]) // corta por velocidad
    expect(derivarCortesDeMuestras(puntos, { umbralMs: 10_000, velocidadMaxKmh: 10_000 })).toEqual([])
  })
})

describe('derivarCortesDeCadencia', () => {
  test('un hueco de la cadencia se mapea al primer punto del track cuyo t es >= al fin del hueco', () => {
    const puntosTrack = [{ t: 0 }, { t: 10_000 }, { t: 2_400_000 }, { t: 2_410_000 }]
    const cadencia = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE, -60, 5_000),
      punto(LAT_BASE, -60, 2_400_000), // 2.395 s de hueco real: por encima del umbral (30 s)
    ]
    // el hueco termina en t=2_400_000: el primer punto del track con ese t o más es el índice 2
    expect(derivarCortesDeCadencia(cadencia, puntosTrack)).toEqual([2])
  })

  test('un hueco que empieza y termina entre dos puntos del track cae en el punto siguiente, no en uno exacto', () => {
    const puntosTrack = [{ t: 0 }, { t: 3_000_000 }]
    const cadencia = [punto(LAT_BASE, -60, 0), punto(LAT_BASE, -60, 2_400_000)]
    expect(derivarCortesDeCadencia(cadencia, puntosTrack)).toEqual([1])
  })

  test('un hueco cuyo fin queda después del último punto del track no aporta ningún índice', () => {
    const puntosTrack = [{ t: 0 }, { t: 5_000 }]
    const cadencia = [punto(LAT_BASE, -60, 0), punto(LAT_BASE, -60, 5_000), punto(LAT_BASE, -60, 999_999)]
    expect(derivarCortesDeCadencia(cadencia, puntosTrack)).toEqual([])
  })

  test('sin huecos en la cadencia (entradas cada pocos segundos) no genera cortes', () => {
    const puntosTrack = [{ t: 0 }, { t: 100_000 }]
    const cadencia = Array.from({ length: 21 }, (_, i) => punto(LAT_BASE, -60, i * 5_000))
    expect(derivarCortesDeCadencia(cadencia, puntosTrack)).toEqual([])
  })

  test('una velocidad implícita implausible dentro de la cadencia también mapea un corte', () => {
    const puntosTrack = [{ t: 0 }, { t: 10_000 }]
    const cadencia = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE + offsetLatKm(6), -60, 5_000), // 6 km en 5 s: imposible, sin hueco de tiempo
    ]
    expect(derivarCortesDeCadencia(cadencia, puntosTrack)).toEqual([1])
  })

  test('respeta umbrales personalizados', () => {
    const puntosTrack = [{ t: 0 }, { t: 20_000 }]
    const cadencia = [punto(LAT_BASE, -60, 0), punto(LAT_BASE, -60, 15_000)]
    expect(derivarCortesDeCadencia(cadencia, puntosTrack, { umbralMs: 10_000 })).toEqual([1])
    expect(derivarCortesDeCadencia(cadencia, puntosTrack, { umbralMs: 20_000 })).toEqual([])
  })
})

describe('derivarCortesDeTrack: el caso que la velocidad implícita sola no puede detectar', () => {
  // Reproduce, a partir de puntos crudos reales pasados por `simplificar`, el
  // caso que motiva toda esta señal: un usuario para 40 minutos (dos
  // "clusters" de manejo real separados por un hueco sin ningún punto
  // grabado en el medio) y después recorre 50 km a una velocidad plausible
  // (80 km/h). Si todo queda sobre la misma recta, Douglas-Peucker colapsa
  // el recorrido entero —incluida la pausa— a sólo 2 vértices (igual que el
  // tramo recto de 20 km de arriba), y la velocidad implícita promedio entre
  // esos 2 vértices (~39 km/h) es perfectamente plausible: `derivarCortesPorVelocidad`
  // sola no encuentra nada que cortar. La cadencia real de fixes sí: durante
  // los 40 minutos de pausa no hay ninguna entrada, así que el hueco entre
  // dos entradas consecutivas de la cadencia supera `UMBRAL_INTERRUPCION_MS`
  // aunque el hueco entre los 2 vértices del track no diga nada por sí solo.
  const PAUSA_MS = 40 * 60_000

  /** Pre-pausa: 2 min a 60 km/h, 1 Hz. */
  function tramoPre(): PuntoGps[] {
    return Array.from({ length: 120 }, (_, i) => punto(LAT_BASE + offsetLatKm((i * 60) / 3600), -60, i * 1_000))
  }

  function crudosConPausaYManejo(): PuntoGps[] {
    const pre = tramoPre()
    const tFinPre = pre[pre.length - 1].t
    const kmPre = (pre.length - 1) * (60 / 3600)
    const tInicioPost = tFinPre + PAUSA_MS
    // Post-pausa: 50 km a 80 km/h, 1 Hz, misma recta (sigue en la misma latitud/longitud).
    const post: PuntoGps[] = Array.from({ length: 2_250 }, (_, i) =>
      punto(LAT_BASE + offsetLatKm(kmPre + (i * 80) / 3600), -60, tInicioPost + i * 1_000),
    )
    return [...pre, ...post]
  }

  test('velocidad sola no corta; con la cadencia real de fixes sí, y los 50 km no se acreditan', () => {
    const crudos = crudosConPausaYManejo()
    const simplificado = simplificar(crudos, 10)
    // Colineal: DP colapsa toda la pausa+manejo a 2 vértices, igual que el
    // tramo recto de 20 km — la firma geométrica de una pausa real y la de
    // un tramo recto sin pausa son indistinguibles en `track`/`puntos` solos.
    expect(simplificado).toHaveLength(2)
    expect(derivarCortesPorVelocidad(simplificado)).toEqual([]) // confirma que la velocidad sola no la detecta

    const cadencia = cadenciaDe(crudos, 5_000)
    const cortes = derivarCortesDeTrack(simplificado, cadencia)
    expect(cortes).toEqual([1])
    // Con el corte, sólo queda un punto por segmento: no se acredita nada de
    // los ~52 km reales (ni los del cluster 2, los 50 km de la "pausa").
    expect(kmDeTrack(simplificado, cortes)).toBe(0)
  })

  test('sin la pausa (mismo camino recto, cadencia sin huecos) se acredita todo, sin cortes', () => {
    // Control: mismo camino, sin la pausa de 40 min en el medio (post
    // arranca inmediatamente después de pre).
    const pre = tramoPre()
    const tFinPre = pre[pre.length - 1].t
    const kmPre = (pre.length - 1) * (60 / 3600)
    const post: PuntoGps[] = Array.from({ length: 2_250 }, (_, i) =>
      punto(LAT_BASE + offsetLatKm(kmPre + (i * 80) / 3600), -60, tFinPre + 1_000 + i * 1_000),
    )
    const crudos = [...pre, ...post]
    const simplificado = simplificar(crudos, 10)
    const cadencia = cadenciaDe(crudos, 5_000)

    expect(derivarCortesDeTrack(simplificado, cadencia)).toEqual([])
    expect(kmDeTrack(simplificado)).toBeCloseTo(kmPre + 50, 1)
  })

  test('una cadencia fabricada para tapar el hueco (repite la posición previa a la pausa y salta al reanudar) igual se corta, por la velocidad implícita dentro de la propia cadencia', () => {
    // Caso más simple y explícito (2 puntos de track) del mismo mecanismo:
    // un salto real de 50 km con una pausa real de 40 min entre medio.
    const A = punto(LAT_BASE, -60, 0)
    const B = punto(LAT_BASE + offsetLatKm(50), -60, PAUSA_MS) // 50 km en 40 min: ~75 km/h, plausible
    const puntosTrack = [A, B]
    expect(derivarCortesPorVelocidad(puntosTrack)).toEqual([]) // la velocidad promedio sola no alcanza

    // Cadencia honesta: sólo los 2 extremos, con el hueco real entre medio.
    const cadenciaHonesta = [A, B]
    expect(derivarCortesDeTrack(puntosTrack, cadenciaHonesta)).toEqual([1])

    // Cadencia fabricada: entradas cada 5 s repitiendo la posición de A (el
    // tramposo no tiene datos reales de ese tramo, así que repite "seguí
    // parado acá") hasta último momento, y ahí aparece la posición real de
    // B — la que de verdad tiene el GPS al reanudar. El paso entre la última
    // entrada fabricada y la primera real cubre los 50 km completos en un
    // solo intervalo de cadencia (5 s): velocidad implícita disparatada.
    const cadenciaFabricada: PuntoGps[] = []
    for (let t = 0; t < PAUSA_MS; t += 5_000) cadenciaFabricada.push(punto(A.lat, A.lng, t))
    cadenciaFabricada.push(B)

    expect(derivarCortesDeTrack(puntosTrack, cadenciaFabricada)).toEqual([1])
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

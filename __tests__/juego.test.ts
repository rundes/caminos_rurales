import { describe, expect, test } from 'vitest'
import {
  calcularPuntos,
  ETIQUETA_INSIGNIA,
  evaluarInsignias,
  kmConSensores,
  PUNTOS_KM_NUEVO,
  PUNTOS_KM_REPETIDO,
  PUNTOS_KM_SENSOR,
  PUNTOS_OBSERVACION,
  type CoberturaLocalidad,
  type MuestraCobertura,
} from '@/lib/juego'
import type { CalidadSegmento } from '@/lib/sensores/tipos'

describe('calcularPuntos', () => {
  test('redondea los puntos por km nuevo y repetido', () => {
    const eventos = calcularPuntos({ kmNuevos: 1.24, kmRepetidos: 0.3, observacionesConEvidencia: 0 })
    expect(eventos).toHaveLength(2)
    expect(eventos[0]).toMatchObject({ motivo: 'km_nuevos', puntos: 12 })
    expect(eventos[0].puntos).toBe(Math.round(1.24 * PUNTOS_KM_NUEVO))
    expect(eventos[1]).toMatchObject({ motivo: 'km_repetidos', puntos: Math.round(0.3 * PUNTOS_KM_REPETIDO) })
  })

  test('omite motivos con 0 puntos', () => {
    const eventos = calcularPuntos({ kmNuevos: 0, kmRepetidos: 0, observacionesConEvidencia: 0 })
    expect(eventos).toEqual([])
  })

  test('calcula puntos por observaciones con evidencia', () => {
    const eventos = calcularPuntos({ kmNuevos: 0, kmRepetidos: 0, observacionesConEvidencia: 3 })
    expect(eventos).toEqual([
      { motivo: 'observaciones', puntos: 3 * PUNTOS_OBSERVACION, detalle: '3 observaciones con evidencia' },
    ])
  })

  test('combina los tres motivos cuando todos aportan puntos', () => {
    const eventos = calcularPuntos({ kmNuevos: 2, kmRepetidos: 1, observacionesConEvidencia: 1 })
    expect(eventos.map((e) => e.motivo)).toEqual(['km_nuevos', 'km_repetidos', 'observaciones'])
    expect(eventos[0].puntos).toBe(2 * PUNTOS_KM_NUEVO)
    expect(eventos[1].puntos).toBe(1 * PUNTOS_KM_REPETIDO)
    expect(eventos[2].puntos).toBe(1 * PUNTOS_OBSERVACION)
  })

  test('km muy chico que redondea a 0 puntos se omite', () => {
    const eventos = calcularPuntos({ kmNuevos: 0.01, kmRepetidos: 0, observacionesConEvidencia: 0 })
    expect(eventos).toEqual([])
  })
})

describe('evaluarInsignias', () => {
  const base = {
    esPrimerRecorrido: false,
    kmTotalesUsuario: 0,
    coberturaPorLocalidad: [] as CoberturaLocalidad[],
    yaObtenidas: [] as string[],
  }

  test('primer_recorrido cuando es el primer recorrido', () => {
    expect(evaluarInsignias({ ...base, esPrimerRecorrido: true })).toContain('primer_recorrido')
  })

  test('no otorga primer_recorrido si no es el primero', () => {
    expect(evaluarInsignias({ ...base, esPrimerRecorrido: false })).not.toContain('primer_recorrido')
  })

  test('explorador_50km a partir de 50 km totales', () => {
    expect(evaluarInsignias({ ...base, kmTotalesUsuario: 49.9 })).not.toContain('explorador_50km')
    expect(evaluarInsignias({ ...base, kmTotalesUsuario: 50 })).toContain('explorador_50km')
  })

  test('cartografo_200km a partir de 200 km totales', () => {
    expect(evaluarInsignias({ ...base, kmTotalesUsuario: 199 })).not.toContain('cartografo_200km')
    const insignias = evaluarInsignias({ ...base, kmTotalesUsuario: 200 })
    expect(insignias).toContain('cartografo_200km')
    expect(insignias).toContain('explorador_50km')
  })

  test('localidad_completa:<localidad> cuando cubiertos === tramos y tramos > 0', () => {
    const coberturaPorLocalidad: CoberturaLocalidad[] = [
      { localidad: 'Santo Domingo', tramos: 5, cubiertos: 5 },
      { localidad: 'Otra', tramos: 3, cubiertos: 1 },
    ]
    const insignias = evaluarInsignias({ ...base, coberturaPorLocalidad })
    expect(insignias).toContain('localidad_completa:Santo Domingo')
    expect(insignias).not.toContain('localidad_completa:Otra')
  })

  test('no otorga localidad_completa cuando tramos es 0', () => {
    const coberturaPorLocalidad: CoberturaLocalidad[] = [{ localidad: 'Vacía', tramos: 0, cubiertos: 0 }]
    expect(evaluarInsignias({ ...base, coberturaPorLocalidad })).toEqual([])
  })

  test('municipio_100 cuando todas las localidades están completas', () => {
    const coberturaPorLocalidad: CoberturaLocalidad[] = [
      { localidad: 'A', tramos: 2, cubiertos: 2 },
      { localidad: 'B', tramos: 4, cubiertos: 4 },
    ]
    const insignias = evaluarInsignias({ ...base, coberturaPorLocalidad })
    expect(insignias).toContain('municipio_100')
    expect(insignias).toContain('localidad_completa:A')
    expect(insignias).toContain('localidad_completa:B')
  })

  test('no otorga municipio_100 si alguna localidad falta', () => {
    const coberturaPorLocalidad: CoberturaLocalidad[] = [
      { localidad: 'A', tramos: 2, cubiertos: 2 },
      { localidad: 'B', tramos: 4, cubiertos: 3 },
    ]
    expect(evaluarInsignias({ ...base, coberturaPorLocalidad })).not.toContain('municipio_100')
  })

  test('excluye insignias ya obtenidas', () => {
    const insignias = evaluarInsignias({
      ...base,
      esPrimerRecorrido: true,
      kmTotalesUsuario: 60,
      yaObtenidas: ['primer_recorrido'],
    })
    expect(insignias).not.toContain('primer_recorrido')
    expect(insignias).toContain('explorador_50km')
  })
})

describe('ETIQUETA_INSIGNIA', () => {
  test('etiquetas fijas conocidas', () => {
    expect(ETIQUETA_INSIGNIA('primer_recorrido')).toBe('Primer recorrido')
    expect(ETIQUETA_INSIGNIA('explorador_50km')).toBe('Explorador 50 km')
    expect(ETIQUETA_INSIGNIA('cartografo_200km')).toBe('Cartógrafo 200 km')
    expect(ETIQUETA_INSIGNIA('municipio_100')).toBe('Municipio 100%')
  })

  test('localidad_completa:<localidad> arma la etiqueta con el nombre', () => {
    expect(ETIQUETA_INSIGNIA('localidad_completa:Santo Domingo')).toBe('Localidad completa: Santo Domingo')
  })

  test('código desconocido devuelve el código tal cual', () => {
    expect(ETIQUETA_INSIGNIA('codigo_raro')).toBe('codigo_raro')
  })
})

describe('kmConSensores', () => {
  /** Muestras sobre el ecuador: 0.002° de longitud son ~0,222 km. */
  function muestra(lng: number, calidad: CalidadSegmento = 'bueno'): MuestraCobertura {
    return { lat: 0, lng, calidad }
  }

  test('suma la distancia que aporta cada muestra con calidad estimada', () => {
    const km = kmConSensores([muestra(0), muestra(0.002), muestra(0.004)], 10)
    expect(km).toBeCloseTo(0.445, 3)
  })

  test('los segmentos sin dato no aportan km', () => {
    const km = kmConSensores([muestra(0), muestra(0.002, 'sin_dato'), muestra(0.004)], 10)
    expect(km).toBeCloseTo(0.222, 3)
  })

  test('nunca devuelve más km que los del recorrido', () => {
    expect(kmConSensores([muestra(0), muestra(0.01)], 0.5)).toBe(0.5)
  })

  test('sin muestras suficientes o sin km de recorrido devuelve 0', () => {
    expect(kmConSensores([], 10)).toBe(0)
    expect(kmConSensores([muestra(0)], 10)).toBe(0)
    expect(kmConSensores([muestra(0), muestra(0.01)], 0)).toBe(0)
  })
})

describe('calcularPuntos con sensores', () => {
  test('premia los km con sensores cuando cubren al menos la mitad del recorrido', () => {
    const eventos = calcularPuntos({
      kmNuevos: 0,
      kmRepetidos: 0,
      observacionesConEvidencia: 0,
      kmSensor: 6,
      kmRecorrido: 10,
    })
    expect(eventos).toEqual([
      { motivo: 'km_sensor', puntos: 6 * PUNTOS_KM_SENSOR, detalle: '6.0 km con sensores' },
    ])
  })

  test('justo en la mitad del recorrido ya premia', () => {
    const eventos = calcularPuntos({
      kmNuevos: 0,
      kmRepetidos: 0,
      observacionesConEvidencia: 0,
      kmSensor: 5,
      kmRecorrido: 10,
    })
    expect(eventos.map((e) => e.motivo)).toEqual(['km_sensor'])
  })

  test('no premia si los sensores cubrieron menos de la mitad', () => {
    const eventos = calcularPuntos({
      kmNuevos: 1,
      kmRepetidos: 0,
      observacionesConEvidencia: 0,
      kmSensor: 4.9,
      kmRecorrido: 10,
    })
    expect(eventos.map((e) => e.motivo)).toEqual(['km_nuevos'])
  })

  test('sin datos de sensores el cálculo no cambia', () => {
    expect(
      calcularPuntos({ kmNuevos: 1, kmRepetidos: 0, observacionesConEvidencia: 0 }).map((e) => e.motivo),
    ).toEqual(['km_nuevos'])
  })

  test('un tramo con sensores demasiado corto no llega a sumar un punto', () => {
    const eventos = calcularPuntos({
      kmNuevos: 0,
      kmRepetidos: 0,
      observacionesConEvidencia: 0,
      kmSensor: 0.4,
      kmRecorrido: 0.5,
    })
    expect(eventos).toEqual([])
  })
})

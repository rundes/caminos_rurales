import { describe, expect, test } from 'vitest'
import type { TramoGeometria } from '@/lib/cobertura'
import {
  descripcionImpacto,
  filasImpactos,
  filasMuestras,
  guardarSensores,
  kmPorCalidad,
} from '@/lib/recorrido-sensores-servidor'
import type { ClienteServidor, Contexto } from '@/lib/recorrido-servidor'
import { crearAsignadorTramos } from '@/lib/sensores/asignacion'
import type { CalidadSegmento } from '@/lib/sensores/tipos'
import type { MuestraPayload, RecorridoPayload } from '@/lib/validaciones'

const CTX: Contexto = { usuarioId: 'u1', municipio: 'maipu', recorridoId: 'r1' }

const TRAMOS: TramoGeometria[] = [{ id: 'w1', km: 1.1, geometria: [[0, 0], [0.01, 0]] }]

const asignador = crearAsignadorTramos(TRAMOS)

/**
 * `t` por defecto separado por `lng` (no constante): `guardarSensores` deriva
 * los cortes de las propias muestras (`derivarCortesDeMuestras`), que trata
 * dos muestras con el mismo `t` pero distinta posición como velocidad
 * infinita (fail-closed) y las corta. El paso (5.000.000 por grado de `lng`)
 * da ~80 km/h entre muestras separadas 0,002 (el paso típico en estos
 * tests): plausible y sin disparar ningún corte que el test no esté
 * buscando probar.
 */
function muestra(lng: number, calidad: CalidadSegmento = 'bueno'): MuestraPayload {
  return {
    t: 1_756_900_000_000 + Math.round(lng * 5_000_000),
    lat: 0,
    lng,
    velocidadKmh: 42,
    rumbo: null,
    altitud: null,
    rmsVertical: 0.8,
    picoVertical: 3.2,
    frenadas: 1,
    laterales: 2,
    muestras: 180,
    calidad,
  }
}

describe('kmPorCalidad', () => {
  test('reparte la distancia entre muestras según la calidad de la que cierra', () => {
    const km = kmPorCalidad([muestra(0), muestra(0.002), muestra(0.004, 'malo')])
    expect(km.bueno).toBeCloseTo(0.222, 3)
    expect(km.malo).toBeCloseTo(0.222, 3)
    expect(km.regular).toBe(0)
  })

  test('con menos de dos muestras no hay distancia que repartir', () => {
    expect(kmPorCalidad([])).toEqual({
      sin_dato: 0,
      bueno: 0,
      regular: 0,
      malo: 0,
      intransitable: 0,
    })
    expect(kmPorCalidad([muestra(0)]).bueno).toBe(0)
  })

  test('con cortes, no reparte distancia entre segmentos (no bridgea una pausa)', () => {
    // 4 muestras: dos clusters de una muestra "malo" cada uno (0 y 0.01),
    // unidos por un salto de 0.002 a 0.008 que cierra en una muestra "bueno".
    // Sin cortes ese salto se reparte igual que cualquier otro segmento. Con
    // un corte justo ahí, el salto desaparece entero — la misma regla que ya
    // usa `kmDeTrack` (`lib/track.ts`) para los km del track y
    // `kmConSensores` (`lib/juego.ts`) para el premio por sensores.
    const muestras = [muestra(0, 'malo'), muestra(0.002, 'malo'), muestra(0.008), muestra(0.01, 'malo')]

    const sinCorte = kmPorCalidad(muestras)
    expect(sinCorte.malo).toBeCloseTo(0.445, 3) // los dos segmentos "malo" (0->0.002 y 0.008->0.01)
    expect(sinCorte.bueno).toBeCloseTo(0.667, 3) // el salto de 0.002 a 0.008, que cierra en "bueno"

    const conCorte = kmPorCalidad(muestras, [2])
    expect(conCorte.malo).toBeCloseTo(0.445, 3) // no cambia: ninguno de los dos segmentos cruza el corte
    expect(conCorte.bueno).toBe(0) // el salto que cruzaba el corte ya no se reparte
  })
})

describe('descripcionImpacto', () => {
  test('describe el pico con un decimal y la velocidad redondeada', () => {
    expect(descripcionImpacto({ t: 1, lat: 0, lng: 0, pico: 8, velocidadKmh: 33.4 })).toBe(
      'Impacto detectado: 8.0 m/s² a 33 km/h',
    )
  })
})

describe('filasMuestras', () => {
  test('mapea al esquema de la tabla y asigna el tramo más cercano', () => {
    const filas = filasMuestras(CTX, [muestra(0.004)], asignador)
    expect(filas).toEqual([
      {
        recorrido_id: 'r1',
        usuario_id: 'u1',
        tramo_id: 'w1',
        t: new Date(1_756_900_020_000).toISOString(),
        latitud: 0,
        longitud: 0.004,
        velocidad_kmh: 42,
        rumbo: null,
        altitud: null,
        rms_vertical: 0.8,
        pico_vertical: 3.2,
        frenadas: 1,
        laterales: 2,
        muestras: 180,
        calidad: 'bueno',
      },
    ])
  })

  test('deja el tramo en null si no hay ninguno cerca', () => {
    const filas = filasMuestras(CTX, [{ ...muestra(0), lat: -37.1, lng: -57.9 }], asignador)
    expect(filas[0].tramo_id).toBeNull()
  })
})

/** Encadenable `delete().eq().eq()...` que siempre resuelve sin error. */
interface ConsultaFake {
  eq: () => ConsultaFake
  then: PromiseLike<{ error: null }>['then']
}

function crearConsultaFake(): ConsultaFake {
  const promesa = Promise.resolve<{ error: null }>({ error: null })
  const consulta: ConsultaFake = {
    eq: () => consulta,
    then: promesa.then.bind(promesa),
  }
  return consulta
}

/**
 * Cliente Supabase mínimo para probar `guardarSensores` sin una base real:
 * `delete().eq(...)` resuelve `{ error: null }` y cada `insert` queda
 * registrado por tabla para poder inspeccionarlo.
 */
function crearClienteFake(insertados: Record<string, unknown[]>): ClienteServidor {
  return {
    from: (tabla: string) => ({
      delete: () => crearConsultaFake(),
      insert: (filas: unknown[]) => {
        insertados[tabla] = [...(insertados[tabla] ?? []), ...filas]
        return Promise.resolve({ error: null })
      },
    }),
  } as unknown as ClienteServidor
}

describe('guardarSensores', () => {
  test('recalcula la calidad de cada segmento en el servidor, ignorando la del cliente', async () => {
    const insertados: Record<string, unknown[]> = {}
    const cliente = crearClienteFake(insertados)

    const datos = {
      muestras: [
        // sin eventos de movimiento: sin_dato, aunque el cliente diga "bueno"
        { ...muestra(0), muestras: 0, calidad: 'bueno' },
        // suficientes eventos, rugosidad baja: "bueno" pese a que el cliente diga "intransitable"
        { ...muestra(0.002), muestras: 40, rmsVertical: 0.5, velocidadKmh: 60, calidad: 'intransitable' },
        // ídem, con otra rugosidad baja
        { ...muestra(0.004), muestras: 40, rmsVertical: 0.3, velocidadKmh: 60, calidad: 'intransitable' },
      ],
      impactos: [],
    } as unknown as RecorridoPayload

    const resumen = await guardarSensores(cliente, CTX, datos, TRAMOS)

    const filas = insertados.muestras_sensor as { calidad: CalidadSegmento }[]
    expect(filas.map((f) => f.calidad)).toEqual(['sin_dato', 'bueno', 'bueno'])
    expect(resumen.kmPorCalidad.sin_dato).toBe(0)
    expect(resumen.kmPorCalidad.bueno).toBeGreaterThan(0)
  })
})

describe('filasImpactos', () => {
  test('arma la observación automática con severidad, magnitud y tramo', () => {
    const filas = filasImpactos(
      'r1',
      [{ t: 1_756_900_000_000, lat: 0, lng: 0.004, pico: 14, velocidadKmh: 51 }],
      asignador,
    )
    expect(filas).toEqual([
      {
        recorrido_id: 'r1',
        tipo_falla: 'bache',
        severidad: 'alta',
        latitud: 0,
        longitud: 0.004,
        descripcion: 'Impacto detectado: 14.0 m/s² a 51 km/h',
        origen: 'sensor',
        magnitud: 14,
        tramo_id: 'w1',
      },
    ])
  })
})

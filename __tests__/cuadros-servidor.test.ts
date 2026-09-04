import { describe, expect, test } from 'vitest'
import type { TramoGeometria } from '@/lib/cobertura'
import {
  ERROR_RUTA_AJENA,
  filasCuadros,
  guardarCuadros,
  prefijoRuta,
  recalcularPuntosCuadros,
} from '@/lib/cuadros-servidor'
import type { ClienteAdmin, ClienteServidor, Contexto } from '@/lib/recorrido-servidor'
import { crearAsignadorTramos } from '@/lib/sensores/asignacion'
import type { CuadroPayload } from '@/lib/validaciones'

const CTX: Contexto = { usuarioId: 'u1', municipio: 'maipu', recorridoId: 'r1' }

/** Tramo recto de ~1,1 km sobre el ecuador; los cuadros caen encima. */
const TRAMOS: TramoGeometria[] = [{ id: 'w1', km: 1.1, geometria: [[0, 0], [0.01, 0]] }]

const asignador = crearAsignadorTramos(TRAMOS)

const T_BASE = 1_756_900_000_000

function cuadro(extra: Partial<CuadroPayload> = {}): CuadroPayload {
  return {
    t: T_BASE,
    lat: 0,
    lng: 0.004,
    rumbo: 90,
    velocidadKmh: 42,
    ruta: `u1/r1/cuadro-${T_BASE}-cuadro.jpg`,
    ...extra,
  }
}

type Escritura = { tabla: string; filas: unknown; opciones?: unknown }
type Borrado = { tabla: string; filtros: unknown[][] }

/** Cliente de usuario: registra los upserts y los inserts que recibe. */
function clienteFake(escrituras: Escritura[]): ClienteServidor {
  return {
    from: (tabla: string) => ({
      upsert: (filas: unknown, opciones?: unknown) => {
        escrituras.push({ tabla, filas, opciones })
        return Promise.resolve({ error: null })
      },
      insert: (filas: unknown) => {
        escrituras.push({ tabla, filas })
        return Promise.resolve({ error: null })
      },
    }),
  } as unknown as ClienteServidor
}

/**
 * Cliente admin: `select` sobre `cuadros` devuelve el conteo configurado y las
 * escrituras y borrados sobre `puntos_eventos` quedan registrados.
 */
function adminFake(
  cuadrosGuardados: number,
  escrituras: Escritura[],
  borrados: Borrado[],
): ClienteAdmin {
  return {
    from: (tabla: string) => {
      const filtros: unknown[][] = []
      let esBorrado = false
      const consulta = {
        select: () => consulta,
        delete: () => {
          esBorrado = true
          return consulta
        },
        eq: (...args: unknown[]) => {
          filtros.push(args)
          return consulta
        },
        insert: (filas: unknown) => {
          escrituras.push({ tabla, filas })
          return Promise.resolve({ error: null })
        },
        then: (cumplir: (r: unknown) => unknown) => {
          if (esBorrado) {
            borrados.push({ tabla, filtros })
            return Promise.resolve({ data: null, error: null }).then(cumplir)
          }
          return Promise.resolve({ data: null, count: cuadrosGuardados, error: null }).then(cumplir)
        },
      }
      return consulta
    },
  } as unknown as ClienteAdmin
}

describe('prefijoRuta', () => {
  test('cuelga del usuario y del recorrido', () => {
    expect(prefijoRuta(CTX)).toBe('u1/r1/')
  })
})

describe('filasCuadros', () => {
  test('mapea al esquema de la tabla y asigna el tramo más cercano', () => {
    expect(filasCuadros(CTX, [cuadro()], asignador)).toEqual([
      {
        recorrido_id: 'r1',
        usuario_id: 'u1',
        tramo_id: 'w1',
        t: new Date(T_BASE).toISOString(),
        latitud: 0,
        longitud: 0.004,
        rumbo: 90,
        velocidad_kmh: 42,
        ruta: `u1/r1/cuadro-${T_BASE}-cuadro.jpg`,
      },
    ])
  })

  test('un cuadro lejos de todo tramo se guarda igual, con tramo_id null', () => {
    const filas = filasCuadros(CTX, [cuadro({ lat: 5, lng: 5 })], asignador)
    expect(filas[0].tramo_id).toBeNull()
  })

  test('rumbo y velocidad nulos viajan como null', () => {
    const filas = filasCuadros(CTX, [cuadro({ rumbo: null, velocidadKmh: null })], asignador)
    expect(filas[0].rumbo).toBeNull()
    expect(filas[0].velocidad_kmh).toBeNull()
  })

  test('rechaza una ruta de otro usuario', () => {
    expect(() => filasCuadros(CTX, [cuadro({ ruta: 'u2/r1/foto.jpg' })], asignador)).toThrow(
      ERROR_RUTA_AJENA,
    )
  })

  test('rechaza una ruta de otro recorrido del mismo usuario', () => {
    expect(() => filasCuadros(CTX, [cuadro({ ruta: 'u1/r2/foto.jpg' })], asignador)).toThrow(
      ERROR_RUTA_AJENA,
    )
  })

  test('una sola ruta ajena rechaza el lote entero', () => {
    expect(() =>
      filasCuadros(CTX, [cuadro(), cuadro({ t: T_BASE + 1, ruta: 'otro/r1/foto.jpg' })], asignador),
    ).toThrow(ERROR_RUTA_AJENA)
  })
})

describe('guardarCuadros', () => {
  test('hace upsert por (recorrido_id, t) con el cliente del usuario', async () => {
    const escrituras: Escritura[] = []
    const registrados = await guardarCuadros(
      clienteFake(escrituras),
      CTX,
      [cuadro(), cuadro({ t: T_BASE + 1000, ruta: 'u1/r1/otro.jpg' })],
      TRAMOS,
    )

    expect(registrados).toBe(2)
    expect(escrituras).toHaveLength(1)
    expect(escrituras[0].tabla).toBe('cuadros')
    expect(escrituras[0].opciones).toEqual({ onConflict: 'recorrido_id,t' })
    expect(escrituras[0].filas).toHaveLength(2)
  })

  test('no escribe nada si el lote llega vacío', async () => {
    const escrituras: Escritura[] = []
    expect(await guardarCuadros(clienteFake(escrituras), CTX, [], TRAMOS)).toBe(0)
    expect(escrituras).toEqual([])
  })

  test('una ruta ajena no llega a la base', async () => {
    const escrituras: Escritura[] = []
    await expect(
      guardarCuadros(clienteFake(escrituras), CTX, [cuadro({ ruta: 'u2/r1/foto.jpg' })], TRAMOS),
    ).rejects.toThrow(ERROR_RUTA_AJENA)
    expect(escrituras).toEqual([])
  })
})

describe('recalcularPuntosCuadros', () => {
  test('borra los eventos previos de cuadros y reinserta el total recalculado', async () => {
    const escrituras: Escritura[] = []
    const borrados: Borrado[] = []

    const puntos = await recalcularPuntosCuadros(adminFake(25, escrituras, borrados), CTX)

    expect(puntos).toBe(2)
    expect(borrados).toEqual([
      { tabla: 'puntos_eventos', filtros: [['recorrido_id', 'r1'], ['motivo', 'cuadros']] },
    ])
    expect(escrituras).toEqual([
      {
        tabla: 'puntos_eventos',
        filas: {
          usuario_id: 'u1',
          municipio: 'maipu',
          recorrido_id: 'r1',
          motivo: 'cuadros',
          puntos: 2,
        },
      },
    ])
  })

  test('idempotente: dos llamadas con el mismo total dejan el mismo evento', async () => {
    const escrituras: Escritura[] = []
    const borrados: Borrado[] = []
    const admin = adminFake(25, escrituras, borrados)

    expect(await recalcularPuntosCuadros(admin, CTX)).toBe(2)
    expect(await recalcularPuntosCuadros(admin, CTX)).toBe(2)

    // cada pasada borra antes de insertar: nunca quedan dos eventos vivos
    expect(borrados).toHaveLength(2)
    expect(escrituras).toHaveLength(2)
    expect(escrituras[0]).toEqual(escrituras[1])
  })

  test('con menos de diez cuadros borra el evento y no inserta ninguno', async () => {
    const escrituras: Escritura[] = []
    const borrados: Borrado[] = []

    expect(await recalcularPuntosCuadros(adminFake(9, escrituras, borrados), CTX)).toBe(0)
    expect(borrados).toHaveLength(1)
    expect(escrituras).toEqual([])
  })

  test('aplica el tope de 100 puntos por recorrido', async () => {
    const escrituras: Escritura[] = []
    const borrados: Borrado[] = []

    expect(await recalcularPuntosCuadros(adminFake(2000, escrituras, borrados), CTX)).toBe(100)
    expect(escrituras[0].filas).toMatchObject({ puntos: 100 })
  })
})

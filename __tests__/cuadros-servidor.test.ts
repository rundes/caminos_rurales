import { describe, expect, test } from 'vitest'
import type { TramoGeometria } from '@/lib/cobertura'
import {
  ERROR_RUTA_AJENA,
  ESPACIADO_MINIMO_CUADRO_MS,
  ErrorPlausibilidadCuadros,
  filasCuadros,
  guardarCuadros,
  maxCuadrosPorDuracion,
  prefijoRuta,
  recalcularPuntosCuadros,
  validarPlausibilidadCuadros,
  type VentanaRecorrido,
} from '@/lib/cuadros-servidor'
import type { ClienteAdmin, ClienteServidor, Contexto } from '@/lib/recorrido-servidor'
import { crearAsignadorTramos } from '@/lib/sensores/asignacion'
import type { CuadroPayload } from '@/lib/validaciones'

const CTX: Contexto = { usuarioId: 'u1', municipio: 'maipu', recorridoId: 'r1' }

/** Tramo recto de ~1,1 km sobre el ecuador; los cuadros caen encima. */
const TRAMOS: TramoGeometria[] = [{ id: 'w1', km: 1.1, geometria: [[0, 0], [0.01, 0]] }]

const asignador = crearAsignadorTramos(TRAMOS)

const T_BASE = 1_756_900_000_000

/** Ventana amplia (2 h) para que el tope por duración no interfiera en tests ajenos a él. */
const VENTANA: VentanaRecorrido = {
  inicio: new Date(T_BASE - 3_600_000).toISOString(),
  fin: new Date(T_BASE + 3_600_000).toISOString(),
}

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

/**
 * Cliente de usuario: registra los upserts y los inserts que recibe, y
 * responde `select('t').eq(...).limit(...)` sobre `cuadros` con los
 * `existentes` configurados (t como ISO string, igual que la columna real).
 */
function clienteFake(escrituras: Escritura[], existentes: string[] = []): ClienteServidor {
  return {
    from: (tabla: string) => ({
      select: () => ({
        eq: () => ({
          limit: () => Promise.resolve({ data: existentes.map((t) => ({ t })), error: null }),
        }),
      }),
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
      [cuadro(), cuadro({ t: T_BASE + ESPACIADO_MINIMO_CUADRO_MS, ruta: 'u1/r1/otro.jpg' })],
      TRAMOS,
      VENTANA,
    )

    expect(registrados).toBe(2)
    expect(escrituras).toHaveLength(1)
    expect(escrituras[0].tabla).toBe('cuadros')
    expect(escrituras[0].opciones).toEqual({ onConflict: 'recorrido_id,t' })
    expect(escrituras[0].filas).toHaveLength(2)
  })

  test('no escribe nada si el lote llega vacío', async () => {
    const escrituras: Escritura[] = []
    expect(await guardarCuadros(clienteFake(escrituras), CTX, [], TRAMOS, VENTANA)).toBe(0)
    expect(escrituras).toEqual([])
  })

  test('una ruta ajena no llega a la base', async () => {
    const escrituras: Escritura[] = []
    await expect(
      guardarCuadros(clienteFake(escrituras), CTX, [cuadro({ ruta: 'u2/r1/foto.jpg' })], TRAMOS, VENTANA),
    ).rejects.toThrow(ERROR_RUTA_AJENA)
    expect(escrituras).toEqual([])
  })

  test('un cuadro antes del inicio del recorrido (fuera del margen) se rechaza sin escribir', async () => {
    const escrituras: Escritura[] = []
    const antes = Date.parse(VENTANA.inicio) - 61_000
    await expect(
      guardarCuadros(clienteFake(escrituras), CTX, [cuadro({ t: antes })], TRAMOS, VENTANA),
    ).rejects.toThrow(ErrorPlausibilidadCuadros)
    expect(escrituras).toEqual([])
  })

  test('espaciado de 3 s dentro del lote se rechaza entero', async () => {
    const escrituras: Escritura[] = []
    await expect(
      guardarCuadros(
        clienteFake(escrituras),
        CTX,
        [cuadro(), cuadro({ t: T_BASE + 3000, ruta: 'u1/r1/otro.jpg' })],
        TRAMOS,
        VENTANA,
      ),
    ).rejects.toThrow(ErrorPlausibilidadCuadros)
    expect(escrituras).toEqual([])
  })

  test('espaciado de exactamente 5 s se acepta', async () => {
    const escrituras: Escritura[] = []
    const registrados = await guardarCuadros(
      clienteFake(escrituras),
      CTX,
      [cuadro(), cuadro({ t: T_BASE + ESPACIADO_MINIMO_CUADRO_MS, ruta: 'u1/r1/otro.jpg' })],
      TRAMOS,
      VENTANA,
    )
    expect(registrados).toBe(2)
  })

  test('considera los cuadros ya guardados del recorrido al chequear el espaciado', async () => {
    const escrituras: Escritura[] = []
    const existentes = [new Date(T_BASE).toISOString()]
    await expect(
      guardarCuadros(
        clienteFake(escrituras, existentes),
        CTX,
        [cuadro({ t: T_BASE + 3000, ruta: 'u1/r1/otro.jpg' })],
        TRAMOS,
        VENTANA,
      ),
    ).rejects.toThrow(ErrorPlausibilidadCuadros)
    expect(escrituras).toEqual([])
  })

  test('un lote que supera el tope de cuadros por duración se rechaza entero', async () => {
    const escrituras: Escritura[] = []
    // Ventana de 15 s: tope = floor(15000/5000)+1 = 4 cuadros como máximo.
    const ventanaCorta: VentanaRecorrido = {
      inicio: new Date(T_BASE).toISOString(),
      fin: new Date(T_BASE + 15_000).toISOString(),
    }
    const cuadros = Array.from({ length: 5 }, (_, i) =>
      cuadro({ t: T_BASE + i * ESPACIADO_MINIMO_CUADRO_MS, ruta: `u1/r1/c${i}.jpg` }),
    )
    await expect(
      guardarCuadros(clienteFake(escrituras), CTX, cuadros, TRAMOS, ventanaCorta),
    ).rejects.toThrow(ErrorPlausibilidadCuadros)
    expect(escrituras).toEqual([])
  })
})

describe('validarPlausibilidadCuadros', () => {
  test('acepta un lote plausible (caso feliz)', () => {
    const r = validarPlausibilidadCuadros([cuadro()], VENTANA, [])
    expect(r).toEqual({ ok: true })
  })

  test('rechaza un t anterior a inicio - 60 s', () => {
    const r = validarPlausibilidadCuadros(
      [cuadro({ t: Date.parse(VENTANA.inicio) - 61_000 })],
      VENTANA,
      [],
    )
    expect(r.ok).toBe(false)
  })

  test('rechaza un t posterior a fin + 60 s', () => {
    const r = validarPlausibilidadCuadros(
      [cuadro({ t: Date.parse(VENTANA.fin) + 61_000 })],
      VENTANA,
      [],
    )
    expect(r.ok).toBe(false)
  })

  test('acepta un t justo en el borde del margen (inicio - 60 s)', () => {
    const r = validarPlausibilidadCuadros(
      [cuadro({ t: Date.parse(VENTANA.inicio) - 60_000 })],
      VENTANA,
      [],
    )
    expect(r.ok).toBe(true)
  })

  test('rechaza espaciado de 3 s entre dos cuadros del lote', () => {
    const r = validarPlausibilidadCuadros(
      [cuadro({ t: T_BASE }), cuadro({ t: T_BASE + 3000 })],
      VENTANA,
      [],
    )
    expect(r.ok).toBe(false)
  })

  test('acepta espaciado de exactamente 5 s', () => {
    const r = validarPlausibilidadCuadros(
      [cuadro({ t: T_BASE }), cuadro({ t: T_BASE + ESPACIADO_MINIMO_CUADRO_MS })],
      VENTANA,
      [],
    )
    expect(r.ok).toBe(true)
  })

  test('un reintento idempotente (mismos t que los ya guardados) no viola el espaciado', () => {
    const existentes = [T_BASE, T_BASE + ESPACIADO_MINIMO_CUADRO_MS].map((t) =>
      new Date(t).toISOString(),
    )
    const r = validarPlausibilidadCuadros(
      [cuadro({ t: T_BASE }), cuadro({ t: T_BASE + ESPACIADO_MINIMO_CUADRO_MS })],
      VENTANA,
      existentes,
    )
    expect(r.ok).toBe(true)
  })

  test('maxCuadrosPorDuracion: uno cada espaciado mínimo, más el primero', () => {
    expect(maxCuadrosPorDuracion(0)).toBe(1)
    expect(maxCuadrosPorDuracion(ESPACIADO_MINIMO_CUADRO_MS)).toBe(2)
    expect(maxCuadrosPorDuracion(10 * ESPACIADO_MINIMO_CUADRO_MS)).toBe(11)
  })

  test('rechaza cuando existentes + lote superan el tope por duración', () => {
    const ventanaCorta: VentanaRecorrido = {
      inicio: new Date(T_BASE).toISOString(),
      fin: new Date(T_BASE + 15_000).toISOString(),
    }
    // tope = floor(15000/5000)+1 = 4
    const existentes = [T_BASE, T_BASE + ESPACIADO_MINIMO_CUADRO_MS].map((t) =>
      new Date(t).toISOString(),
    )
    const nuevos = [
      cuadro({ t: T_BASE + 2 * ESPACIADO_MINIMO_CUADRO_MS }),
      cuadro({ t: T_BASE + 3 * ESPACIADO_MINIMO_CUADRO_MS }),
      cuadro({ t: T_BASE + 4 * ESPACIADO_MINIMO_CUADRO_MS }),
    ]
    const r = validarPlausibilidadCuadros(nuevos, ventanaCorta, existentes)
    expect(r.ok).toBe(false)
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

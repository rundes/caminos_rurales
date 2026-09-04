import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { DestinoSubida } from '@/lib/almacenamiento/tipos'
import { LOTE_CUADROS } from '@/lib/camara/umbrales'
import {
  procesarColaCuadros,
  type DepsCuadros,
  type RespuestaCuadros,
} from '@/lib/local/cola-cuadros'
import { BACKOFF_MS, MAX_INTENTOS } from '@/lib/local/deps'
import type {
  BaseCuadros,
  CuadroGuardado,
  EstadoSubida,
  ItemColaCuadros,
  RecorridoLocal,
} from '@/lib/local/tipos'
import type { ResultadoAccion } from '@/lib/tipos'

const ID = '11111111-1111-4111-8111-111111111111'
const USUARIO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const OTRO_USUARIO = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const AHORA = 1_700_000_000_000

function destino(ruta: string): DestinoSubida {
  return {
    urlSubida: `https://subida.test/${ruta}`,
    metodo: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    urlLectura: ruta,
    ruta,
  }
}

function recorrido(estado: RecorridoLocal['estado'] = 'subido', id = ID, usuarioId = USUARIO): RecorridoLocal {
  return {
    id,
    usuarioId,
    inicio: '2026-09-03T10:00:00.000Z',
    fin: '2026-09-03T10:30:00.000Z',
    estado,
    municipio: 'maipu',
    puntosGps: 3,
    km: 1.2,
  }
}

function cuadro(indice: number, recorridoId = ID): CuadroGuardado {
  return {
    id: indice,
    recorridoId,
    t: AHORA + indice * 1000,
    lat: -36.85 + indice * 0.001,
    lng: -57.88,
    rumbo: 90,
    velocidadKmh: 40,
    blob: new Blob([`cuadro-${indice}`], { type: 'image/jpeg' }),
    estadoSubida: 'pendiente',
  }
}

type Inicial = {
  recorridos?: RecorridoLocal[]
  cuadros?: CuadroGuardado[]
  cola?: ItemColaCuadros[]
}

/** Doble en memoria de `BaseCuadros`. */
function crearBase(inicial: Inicial) {
  const recorridos = new Map((inicial.recorridos ?? []).map((r) => [r.id, r]))
  const cuadros = new Map((inicial.cuadros ?? []).map((c) => [c.id, c]))
  const cola = new Map((inicial.cola ?? []).map((c) => [c.recorridoId, c]))

  const de = (recorridoId: string, estado?: EstadoSubida) =>
    [...cuadros.values()]
      .filter((c) => c.recorridoId === recorridoId && (!estado || c.estadoSubida === estado))
      .sort((a, b) => a.t - b.t)

  const db: BaseCuadros = {
    listarRecorridos: async (usuarioId) =>
      [...recorridos.values()].filter((r) => r.usuarioId === usuarioId),
    listarCuadros: async (recorridoId, estado) => de(recorridoId, estado),
    contarCuadros: async (recorridoId, estado) => de(recorridoId, estado).length,
    marcarCuadro: async (id, estado, ruta) => {
      const guardado = cuadros.get(id)
      if (guardado) cuadros.set(id, { ...guardado, estadoSubida: estado, ...(ruta ? { ruta } : {}) })
    },
    borrarCuadrosSubidos: async (recorridoId) => {
      const subidos = de(recorridoId, 'subida').filter((c) => c.blob !== undefined)
      for (const c of subidos) cuadros.set(c.id, { ...c, blob: undefined })
      return subidos.length
    },
    marcarCuadrosEnError: async (recorridoId) => {
      const pendientes = de(recorridoId, 'pendiente')
      for (const c of pendientes) {
        cuadros.set(c.id, { ...c, estadoSubida: 'error', blob: undefined })
      }
      return pendientes.length
    },
    encolarCuadros: async (recorridoId) => {
      if (!cola.has(recorridoId)) cola.set(recorridoId, { recorridoId, intentos: 0, proximoIntento: 0 })
    },
    obtenerItemColaCuadros: async (recorridoId) => cola.get(recorridoId),
    guardarItemColaCuadros: async (item) => void cola.set(item.recorridoId, item),
    listarColaCuadros: async () => [...cola.values()],
    borrarItemColaCuadros: async (recorridoId) => void cola.delete(recorridoId),
  }

  return { db, cuadros, cola }
}

type Base = ReturnType<typeof crearBase>

type DepsEspiadas = DepsCuadros & {
  prepararSubida: ReturnType<typeof vi.fn>
  subir: ReturnType<typeof vi.fn>
  registrarCuadros: ReturnType<typeof vi.fn>
}

function crearDeps(
  base: Base,
  opciones: {
    permitida?: boolean
    respuesta?: RespuestaCuadros
    fallarSubida?: boolean
  } = {},
): DepsEspiadas {
  const { permitida = true, respuesta = { ok: true as const, data: { registrados: 0, puntos: 0 } } } =
    opciones
  let contador = 0

  return {
    db: base.db,
    prepararSubida: vi.fn(async (_recorridoId: string, _nombre: string, _tipo: string, obsId?: string) => {
      contador += 1
      return { ok: true, data: destino(`uid/rec/${obsId}-cuadro.jpg`) } as ResultadoAccion<DestinoSubida>
    }),
    subir: vi.fn(async () => {
      if (opciones.fallarSubida) throw new Error('sin red')
    }),
    registrarCuadros: vi.fn(async () => ({
      ...respuesta,
      ...(respuesta.ok ? { data: { registrados: contador, puntos: 0 } } : {}),
    })),
    ahora: () => AHORA,
    red: () => ({ permitida, verificada: true }),
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('procesarColaCuadros', () => {
  test('sube los cuadros en lotes, los marca y libera los blobs', async () => {
    const cuadros = Array.from({ length: LOTE_CUADROS + 3 }, (_, i) => cuadro(i + 1))
    const base = crearBase({
      recorridos: [recorrido()],
      cuadros,
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base)

    const resultado = await procesarColaCuadros(deps, USUARIO)

    expect(resultado).toEqual({ pendientes: 0, subidos: cuadros.length, errorCuadros: {} })
    // Dos lotes: 20 + 3.
    expect(deps.registrarCuadros).toHaveBeenCalledTimes(2)
    expect(deps.subir).toHaveBeenCalledTimes(cuadros.length)
    const primerLote = deps.registrarCuadros.mock.calls[0][0] as {
      recorridoId: string
      cuadros: { t: number; ruta: string }[]
    }
    expect(primerLote.recorridoId).toBe(ID)
    expect(primerLote.cuadros).toHaveLength(LOTE_CUADROS)
    expect(primerLote.cuadros[0].ruta).toContain(`cuadro-${cuadros[0].t}`)

    const guardados = await base.db.listarCuadros(ID)
    expect(guardados.every((c) => c.estadoSubida === 'subida')).toBe(true)
    expect(guardados.every((c) => c.blob === undefined)).toBe(true)
    expect(guardados[0].ruta).toContain('cuadro.jpg')
    expect(await base.db.listarColaCuadros()).toEqual([])
  })

  test('nombra el objeto con el t del cuadro para que el reintento lo pise', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      cuadros: [cuadro(1)],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base)

    await procesarColaCuadros(deps, USUARIO)

    expect(deps.prepararSubida).toHaveBeenCalledWith(
      ID,
      'cuadro.jpg',
      'image/jpeg',
      `cuadro-${AHORA + 1000}`,
    )
  })

  test('no sube nada si el recorrido todavía no llegó al servidor', async () => {
    const base = crearBase({
      recorridos: [recorrido('finalizado')],
      cuadros: [cuadro(1)],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base)

    const resultado = await procesarColaCuadros(deps, USUARIO)

    expect(deps.subir).not.toHaveBeenCalled()
    expect(resultado.pendientes).toBe(1)
  })

  test('con la red no permitida no sube pero informa los pendientes', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      cuadros: [cuadro(1)],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base, { permitida: false })

    const resultado = await procesarColaCuadros(deps, USUARIO)

    expect(deps.subir).not.toHaveBeenCalled()
    expect(resultado).toEqual({ pendientes: 1, subidos: 0, errorCuadros: {} })
  })

  test('encola el recorrido subido que quedó con cuadros sin item de cola', async () => {
    const base = crearBase({ recorridos: [recorrido()], cuadros: [cuadro(1)] })
    const deps = crearDeps(base)

    await procesarColaCuadros(deps, USUARIO)

    expect(deps.subir).toHaveBeenCalledTimes(1)
  })

  test('no toca los recorridos de otro usuario', async () => {
    const base = crearBase({
      recorridos: [recorrido('subido', ID, OTRO_USUARIO)],
      cuadros: [cuadro(1)],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base)

    const resultado = await procesarColaCuadros(deps, USUARIO)

    expect(deps.subir).not.toHaveBeenCalled()
    expect(deps.registrarCuadros).not.toHaveBeenCalled()
    expect(resultado).toEqual({ pendientes: 0, subidos: 0, errorCuadros: {} })
  })

  test('un fallo de subida deja el item con backoff y los cuadros pendientes', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      cuadros: [cuadro(1)],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base, { fallarSubida: true })

    const resultado = await procesarColaCuadros(deps, USUARIO)

    expect(deps.registrarCuadros).not.toHaveBeenCalled()
    expect(await base.db.obtenerItemColaCuadros(ID)).toEqual({
      recorridoId: ID,
      intentos: 1,
      proximoIntento: AHORA + BACKOFF_MS[0],
      ultimoError: 'sin red',
    })
    expect((await base.db.listarCuadros(ID, 'pendiente')).length).toBe(1)
    expect(resultado).toEqual({ pendientes: 1, subidos: 0, errorCuadros: {} })
  })

  test('un rechazo del servidor no marca los cuadros como subidos', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      cuadros: [cuadro(1)],
      cola: [{ recorridoId: ID, intentos: 1, proximoIntento: AHORA - 1 }],
    })
    const deps = crearDeps(base, { respuesta: { ok: false, error: 'Recorrido ajeno' } })

    await procesarColaCuadros(deps, USUARIO)

    expect((await base.db.listarCuadros(ID, 'pendiente')).length).toBe(1)
    expect(await base.db.obtenerItemColaCuadros(ID)).toMatchObject({
      intentos: 2,
      proximoIntento: AHORA + BACKOFF_MS[1],
      ultimoError: 'Recorrido ajeno',
    })
  })

  test('no reintenta antes de que venza el backoff ni con los intentos agotados', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      cuadros: [cuadro(1)],
      cola: [{ recorridoId: ID, intentos: 1, proximoIntento: AHORA + 1000 }],
    })
    const deps = crearDeps(base)

    expect(await procesarColaCuadros(deps, USUARIO)).toEqual({
      pendientes: 1,
      subidos: 0,
      errorCuadros: {},
    })
    expect(deps.subir).not.toHaveBeenCalled()
  })

  test('con los intentos agotados da los cuadros por perdidos y saca el item de la cola', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      cuadros: [cuadro(1), cuadro(2)],
      cola: [
        { recorridoId: ID, intentos: MAX_INTENTOS, proximoIntento: 0, ultimoError: 'sin red' },
      ],
    })
    const deps = crearDeps(base)

    const resultado = await procesarColaCuadros(deps, USUARIO)

    expect(deps.subir).not.toHaveBeenCalled()
    expect(resultado).toEqual({ pendientes: 0, subidos: 0, errorCuadros: { [ID]: 2 } })
    expect(await base.db.listarColaCuadros()).toEqual([])
    const guardados = await base.db.listarCuadros(ID)
    expect(guardados.every((c) => c.estadoSubida === 'error')).toBe(true)
    expect(guardados.every((c) => c.blob === undefined)).toBe(true)
  })

  test('un rechazo definitivo no se reintenta: cuadros en error y fuera de la cola', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      cuadros: [cuadro(1), cuadro(2)],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base, {
      respuesta: { ok: false, error: 'Ese recorrido es de otra persona.', definitivo: true },
    })

    const resultado = await procesarColaCuadros(deps, USUARIO)

    expect(deps.registrarCuadros).toHaveBeenCalledTimes(1)
    expect(resultado).toEqual({ pendientes: 0, subidos: 0, errorCuadros: { [ID]: 2 } })
    // No queda item con backoff: reintentar daría siempre lo mismo.
    expect(await base.db.obtenerItemColaCuadros(ID)).toBeUndefined()
    const guardados = await base.db.listarCuadros(ID)
    expect(guardados.every((c) => c.estadoSubida === 'error')).toBe(true)
    expect(guardados.every((c) => c.blob === undefined)).toBe(true)
  })

  test('un rechazo sin `definitivo` sí espera el backoff', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      cuadros: [cuadro(1)],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base, { respuesta: { ok: false, error: 'Se cayó el servidor' } })

    const resultado = await procesarColaCuadros(deps, USUARIO)

    expect(await base.db.obtenerItemColaCuadros(ID)).toMatchObject({
      intentos: 1,
      ultimoError: 'Se cayó el servidor',
    })
    expect((await base.db.listarCuadros(ID, 'pendiente')).length).toBe(1)
    expect(resultado.errorCuadros).toEqual({})
  })

  test('un cuadro sin imagen se marca en error y no frena al resto', async () => {
    const sinBlob: CuadroGuardado = { ...cuadro(1), blob: undefined }
    const base = crearBase({
      recorridos: [recorrido()],
      cuadros: [sinBlob, cuadro(2)],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base)

    const resultado = await procesarColaCuadros(deps, USUARIO)

    expect(resultado.subidos).toBe(1)
    expect((await base.db.listarCuadros(ID, 'error')).map((c) => c.id)).toEqual([1])
    expect((await base.db.listarCuadros(ID, 'subida')).map((c) => c.id)).toEqual([2])
    expect(await base.db.listarColaCuadros()).toEqual([])
  })
})

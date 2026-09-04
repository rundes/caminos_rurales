// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'

vi.mock('server-only', () => ({}))

const { obtenerCoberturaMunicipio, obtenerLogrosPropios, obtenerRanking, obtenerRugosidadTramos, obtenerTramosConEstado } =
  await import('@/lib/cobertura-consultas')

type Cliente = SupabaseClient<Database>
type Resultado = { data: unknown; error: { message: string } | null }

/** Consulta encadenable fake: select().eq().in() resuelven todas al mismo resultado configurado. */
function crearConsulta(resolver: () => Resultado) {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    in: () => consulta,
    then: (onFulfilled: (v: Resultado) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(onFulfilled, onRejected),
  }
  return consulta
}

function crearCliente(config: {
  tramos?: Resultado
  cobertura?: Resultado
  logros?: Resultado
  rpc?: Resultado
}): Cliente {
  const rpc = vi.fn(async () => config.rpc ?? { data: [], error: null })
  const from = (tabla: string) => {
    if (tabla === 'tramos') return crearConsulta(() => config.tramos ?? { data: [], error: null })
    if (tabla === 'cobertura_tramos') return crearConsulta(() => config.cobertura ?? { data: [], error: null })
    if (tabla === 'logros') return crearConsulta(() => config.logros ?? { data: [], error: null })
    throw new Error(`tabla no prevista: ${tabla}`)
  }
  return { rpc, from } as unknown as Cliente
}

describe('obtenerCoberturaMunicipio', () => {
  test('coerciona los valores numéricos que llegan como string', async () => {
    const cliente = crearCliente({
      rpc: {
        data: [{ localidad: 'Maipú', tramos: 10, cubiertos: 4, km: '40.5', km_cubiertos: '16.2' }],
        error: null,
      },
    })
    const resumen = await obtenerCoberturaMunicipio(cliente, 'maipu')
    expect(resumen.porLocalidad).toEqual([
      { localidad: 'Maipú', tramos: 10, cubiertos: 4, km: 40.5, kmCubiertos: 16.2 },
    ])
    expect(resumen.total).toEqual({ tramos: 10, cubiertos: 4, km: 40.5, kmCubiertos: 16.2, fraccion: 0.4 })
  })

  test('si el rpc falla, devuelve resumen vacío y loguea', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cliente = crearCliente({ rpc: { data: null, error: { message: 'boom' } } })
    const resumen = await obtenerCoberturaMunicipio(cliente, 'maipu')
    expect(resumen).toEqual({
      porLocalidad: [],
      total: { tramos: 0, cubiertos: 0, km: 0, kmCubiertos: 0, fraccion: 0 },
    })
    expect(spy).toHaveBeenCalledWith('[cobertura-consultas]', 'boom')
    spy.mockRestore()
  })
})

describe('obtenerRanking', () => {
  test('coerciona puntos y posicion a número', async () => {
    const cliente = crearCliente({
      rpc: {
        data: [{ usuario_id: 'u1', nombre: 'Ana', puntos: '120', posicion: '1' }],
        error: null,
      },
    })
    const ranking = await obtenerRanking(cliente, 'maipu')
    expect(ranking).toEqual([{ usuario_id: 'u1', nombre: 'Ana', puntos: 120, posicion: 1 }])
  })

  test('si el rpc falla, devuelve [] y loguea', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cliente = crearCliente({ rpc: { data: null, error: { message: 'boom' } } })
    expect(await obtenerRanking(cliente, 'maipu')).toEqual([])
    expect(spy).toHaveBeenCalledWith('[cobertura-consultas]', 'boom')
    spy.mockRestore()
  })
})

describe('obtenerLogrosPropios', () => {
  test('devuelve las filas tal cual', async () => {
    const cliente = crearCliente({
      logros: { data: [{ codigo: 'primer_recorrido', otorgado_at: '2026-09-01T00:00:00Z' }], error: null },
    })
    expect(await obtenerLogrosPropios(cliente, 'u1')).toEqual([
      { codigo: 'primer_recorrido', otorgado_at: '2026-09-01T00:00:00Z' },
    ])
  })

  test('si falla, devuelve [] y loguea', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cliente = crearCliente({ logros: { data: null, error: { message: 'boom' } } })
    expect(await obtenerLogrosPropios(cliente, 'u1')).toEqual([])
    expect(spy).toHaveBeenCalledWith('[cobertura-consultas]', 'boom')
    spy.mockRestore()
  })
})

describe('obtenerTramosConEstado', () => {
  const TRAMOS = [
    { id: 't1', nombre_codigo: 'A', localidad: 'Segurola', km: '2', geometria: [] },
    { id: 't2', nombre_codigo: 'B', localidad: 'Segurola', km: 3, geometria: [] },
  ]

  test('cruza tramos y cobertura sumando veces por tramo', async () => {
    const cliente = crearCliente({
      tramos: { data: TRAMOS, error: null },
      cobertura: { data: [{ tramo_id: 't1' }, { tramo_id: 't1' }, { tramo_id: 't2' }], error: null },
    })
    const resultado = await obtenerTramosConEstado(cliente, 'maipu')
    expect(resultado).toEqual([
      { id: 't1', nombre_codigo: 'A', localidad: 'Segurola', km: 2, geometria: [], veces: 2 },
      { id: 't2', nombre_codigo: 'B', localidad: 'Segurola', km: 3, geometria: [], veces: 1 },
    ])
  })

  test('si falla la consulta de tramos, devuelve [] y loguea (no pisa la de cobertura)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cliente = crearCliente({ tramos: { data: null, error: { message: 'boom-tramos' } } })
    expect(await obtenerTramosConEstado(cliente, 'maipu')).toEqual([])
    expect(spy).toHaveBeenCalledWith('[cobertura-consultas]', 'boom-tramos')
    spy.mockRestore()
  })

  test('si falla la consulta de cobertura, devuelve [] en vez de marcar todo como pendiente', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cliente = crearCliente({
      tramos: { data: TRAMOS, error: null },
      cobertura: { data: null, error: { message: 'boom-cobertura' } },
    })
    expect(await obtenerTramosConEstado(cliente, 'maipu')).toEqual([])
    expect(spy).toHaveBeenCalledWith('[cobertura-consultas]', 'boom-cobertura')
    spy.mockRestore()
  })
})

describe('obtenerRugosidadTramos', () => {
  test('indexa por tramo_id y coerciona los numeric que llegan como string', async () => {
    const cliente = crearCliente({
      rpc: {
        data: [
          { tramo_id: 't1', calidad: 'malo', rms_medio: '2.5', velocidad_media: '38.2', impactos: '3', segmentos: '10' },
          { tramo_id: 't2', calidad: 'bueno', rms_medio: 0.4, velocidad_media: 45, impactos: 0, segmentos: 4 },
        ],
        error: null,
      },
    })
    const rugosidad = await obtenerRugosidadTramos(cliente, 'maipu')
    expect(rugosidad).toEqual({
      t1: { calidad: 'malo', rms: 2.5, velocidad: 38.2, impactos: 3, segmentos: 10 },
      t2: { calidad: 'bueno', rms: 0.4, velocidad: 45, impactos: 0, segmentos: 4 },
    })
  })

  test('si el rpc falla, devuelve {} y loguea con el prefijo [rugosidad]', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cliente = crearCliente({ rpc: { data: null, error: { message: 'boom' } } })
    expect(await obtenerRugosidadTramos(cliente, 'maipu')).toEqual({})
    expect(spy).toHaveBeenCalledWith('[rugosidad]', 'boom')
    spy.mockRestore()
  })
})

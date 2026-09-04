// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'

vi.mock('server-only', () => ({}))

const { obtenerCuadros, obtenerCuadrosPorTramo } = await import('@/lib/cuadros-consultas')

type Cliente = SupabaseClient<Database>
type Resultado = { data: unknown; error: { message: string } | null }

type Llamadas = {
  select: unknown[][]
  eq: unknown[][]
  order: unknown[][]
  limit: unknown[][]
}

function crearLlamadas(): Llamadas {
  return { select: [], eq: [], order: [], limit: [] }
}

/** Consulta encadenable fake: select().eq().order().limit() resuelven todas al mismo resultado configurado, registrando los argumentos recibidos. */
function crearConsulta(resolver: () => Resultado, llamadas: Llamadas) {
  const consulta = {
    select: (...args: unknown[]) => {
      llamadas.select.push(args)
      return consulta
    },
    eq: (...args: unknown[]) => {
      llamadas.eq.push(args)
      return consulta
    },
    order: (...args: unknown[]) => {
      llamadas.order.push(args)
      return consulta
    },
    limit: (...args: unknown[]) => {
      llamadas.limit.push(args)
      return consulta
    },
    then: (onFulfilled: (v: Resultado) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(onFulfilled, onRejected),
  }
  return consulta
}

function crearCliente(config: { cuadros?: Resultado; rpc?: Resultado }) {
  const llamadas = crearLlamadas()
  const rpc = vi.fn(async () => config.rpc ?? { data: [], error: null })
  const from = (tabla: string) => {
    if (tabla === 'cuadros') return crearConsulta(() => config.cuadros ?? { data: [], error: null }, llamadas)
    throw new Error(`tabla no prevista: ${tabla}`)
  }
  const cliente = { rpc, from } as unknown as Cliente
  return { cliente, llamadas, rpc }
}

describe('obtenerCuadros', () => {
  test('mapea filas y coerciona los valores numéricos que llegan como string', async () => {
    const { cliente } = crearCliente({
      cuadros: {
        data: [
          {
            id: 'c1',
            recorrido_id: 'r1',
            tramo_id: 't1',
            t: '2026-09-01T10:00:00Z',
            latitud: '-36.6',
            longitud: '-60.1',
            rumbo: '90',
            velocidad_kmh: '20',
            ruta: 'u1/r1/cuadros/1.jpg',
          },
        ],
        error: null,
      },
    })

    const cuadros = await obtenerCuadros(cliente, 'maipu')

    expect(cuadros).toEqual([
      {
        id: 'c1',
        recorrido_id: 'r1',
        tramo_id: 't1',
        t: '2026-09-01T10:00:00Z',
        lat: -36.6,
        lng: -60.1,
        rumbo: 90,
        velocidadKmh: 20,
        ruta: 'u1/r1/cuadros/1.jpg',
      },
    ])
  })

  test('rumbo, velocidad y tramo nulos se mantienen null', async () => {
    const { cliente } = crearCliente({
      cuadros: {
        data: [
          {
            id: 'c1',
            recorrido_id: 'r1',
            tramo_id: null,
            t: '2026-09-01T10:00:00Z',
            latitud: -36.6,
            longitud: -60.1,
            rumbo: null,
            velocidad_kmh: null,
            ruta: 'u1/r1/cuadros/1.jpg',
          },
        ],
        error: null,
      },
    })

    const [cuadro] = await obtenerCuadros(cliente, 'maipu')

    expect(cuadro.rumbo).toBeNull()
    expect(cuadro.velocidadKmh).toBeNull()
    expect(cuadro.tramo_id).toBeNull()
  })

  test('si la consulta falla, devuelve [] y loguea con el prefijo [cuadros]', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { cliente } = crearCliente({ cuadros: { data: null, error: { message: 'boom' } } })

    expect(await obtenerCuadros(cliente, 'maipu')).toEqual([])
    expect(spy).toHaveBeenCalledWith('[cuadros]', 'boom')
    spy.mockRestore()
  })

  test('filtra explícitamente por municipio vía la relación recorridos y ordena/limita', async () => {
    const { cliente, llamadas } = crearCliente({ cuadros: { data: [], error: null } })

    await obtenerCuadros(cliente, 'maipu', 3000)

    expect(llamadas.eq).toContainEqual(['recorridos.municipio', 'maipu'])
    expect(llamadas.order).toContainEqual(['t', { ascending: false }])
    expect(llamadas.limit).toContainEqual([3000])
  })

  test('usa el límite por defecto (3000) cuando no se especifica', async () => {
    const { cliente, llamadas } = crearCliente({ cuadros: { data: [], error: null } })

    await obtenerCuadros(cliente, 'maipu')

    expect(llamadas.limit).toContainEqual([3000])
  })
})

describe('obtenerCuadrosPorTramo', () => {
  test('indexa por tramo_id y coerciona el conteo a número', async () => {
    const { cliente } = crearCliente({
      rpc: {
        data: [
          { tramo_id: 't1', cuadros: '5' },
          { tramo_id: 't2', cuadros: 2 },
        ],
        error: null,
      },
    })

    expect(await obtenerCuadrosPorTramo(cliente, 'maipu')).toEqual({ t1: 5, t2: 2 })
  })

  test('si el rpc falla, devuelve {} y loguea con el prefijo [cuadros]', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { cliente } = crearCliente({ rpc: { data: null, error: { message: 'boom' } } })

    expect(await obtenerCuadrosPorTramo(cliente, 'maipu')).toEqual({})
    expect(spy).toHaveBeenCalledWith('[cuadros]', 'boom')
    spy.mockRestore()
  })

  test('llama al rpc cuadros_por_tramo con p_municipio', async () => {
    const { cliente, rpc } = crearCliente({ rpc: { data: [], error: null } })

    await obtenerCuadrosPorTramo(cliente, 'maipu')

    expect(rpc).toHaveBeenCalledWith('cuadros_por_tramo', { p_municipio: 'maipu' })
  })
})

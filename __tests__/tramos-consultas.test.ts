// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// `unstable_cache` no aporta nada en un test unitario (no hay runtime de
// Next detrás): se lo reemplaza por un passthrough, igual que en
// `cobertura-consultas.test.ts`.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

const adminFrom = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: () => ({ from: adminFrom }) }))

const { obtenerTramosResumenCacheado } = await import('@/lib/tramos-consultas')

type Resultado = { data: unknown; error: { message: string } | null }

/** Consulta encadenable fake: select().eq().in().limit() resuelven al mismo resultado configurado. */
function crearConsulta(resolver: () => Resultado) {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    in: () => consulta,
    limit: () => consulta,
    then: (onFulfilled: (v: Resultado) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(onFulfilled, onRejected),
  }
  return consulta
}

const TRAMOS = [
  { id: 't1', nombre_codigo: 'A', localidad: 'Segurola', km: '2' },
  { id: 't2', nombre_codigo: 'B', localidad: 'Segurola', km: 3 },
]

function configurarAdmin(config: { tramos?: Resultado; cobertura?: Resultado; cuadros?: Resultado }) {
  adminFrom.mockImplementation((tabla: string) => {
    if (tabla === 'tramos') return crearConsulta(() => config.tramos ?? { data: [], error: null })
    if (tabla === 'cobertura_tramos') return crearConsulta(() => config.cobertura ?? { data: [], error: null })
    if (tabla === 'cuadros') return crearConsulta(() => config.cuadros ?? { data: [], error: null })
    throw new Error(`tabla no prevista: ${tabla}`)
  })
}

beforeEach(() => {
  adminFrom.mockClear()
})

describe('obtenerTramosResumenCacheado', () => {
  test('cruza tramos, cobertura (veces + última visita) y cuadros por tramo', async () => {
    configurarAdmin({
      tramos: { data: TRAMOS, error: null },
      cobertura: {
        data: [
          { tramo_id: 't1', created_at: '2026-01-01T00:00:00Z' },
          { tramo_id: 't1', created_at: '2026-01-05T00:00:00Z' },
          { tramo_id: 't2', created_at: '2026-01-03T00:00:00Z' },
        ],
        error: null,
      },
      cuadros: { data: [{ tramo_id: 't1' }, { tramo_id: 't1' }, { tramo_id: null }], error: null },
    })

    const resultado = await obtenerTramosResumenCacheado('maipu')

    expect(resultado).toEqual([
      { id: 't1', nombre_codigo: 'A', localidad: 'Segurola', km: 2, veces: 2, ultimaVisita: '2026-01-05T00:00:00Z', cuadros: 2 },
      { id: 't2', nombre_codigo: 'B', localidad: 'Segurola', km: 3, veces: 1, ultimaVisita: '2026-01-03T00:00:00Z', cuadros: 0 },
    ])
  })

  test('tramo sin cobertura queda con veces 0, última visita null y 0 cuadros', async () => {
    configurarAdmin({ tramos: { data: TRAMOS, error: null } })

    const resultado = await obtenerTramosResumenCacheado('maipu')

    expect(resultado).toEqual([
      { id: 't1', nombre_codigo: 'A', localidad: 'Segurola', km: 2, veces: 0, ultimaVisita: null, cuadros: 0 },
      { id: 't2', nombre_codigo: 'B', localidad: 'Segurola', km: 3, veces: 0, ultimaVisita: null, cuadros: 0 },
    ])
  })

  test('sin tramos para el municipio, devuelve [] sin consultar cobertura ni cuadros', async () => {
    configurarAdmin({ tramos: { data: [], error: null } })

    expect(await obtenerTramosResumenCacheado('maipu')).toEqual([])
    expect(adminFrom).toHaveBeenCalledWith('tramos')
    expect(adminFrom).not.toHaveBeenCalledWith('cobertura_tramos')
    expect(adminFrom).not.toHaveBeenCalledWith('cuadros')
  })

  test('si falla la consulta admin de tramos, devuelve [] y loguea', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    configurarAdmin({ tramos: { data: null, error: { message: 'boom-admin' } } })

    expect(await obtenerTramosResumenCacheado('maipu')).toEqual([])
    expect(spy).toHaveBeenCalledWith('[tramos-consultas]', 'boom-admin')
    spy.mockRestore()
  })

  test('si falla cobertura o cuadros, loguea pero no rompe el resto del resumen', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    configurarAdmin({
      tramos: { data: TRAMOS, error: null },
      cobertura: { data: null, error: { message: 'boom-cobertura' } },
      cuadros: { data: null, error: { message: 'boom-cuadros' } },
    })

    const resultado = await obtenerTramosResumenCacheado('maipu')

    expect(resultado).toEqual([
      { id: 't1', nombre_codigo: 'A', localidad: 'Segurola', km: 2, veces: 0, ultimaVisita: null, cuadros: 0 },
      { id: 't2', nombre_codigo: 'B', localidad: 'Segurola', km: 3, veces: 0, ultimaVisita: null, cuadros: 0 },
    ])
    expect(spy).toHaveBeenCalledWith('[tramos-consultas]', 'boom-cobertura')
    expect(spy).toHaveBeenCalledWith('[tramos-consultas]', 'boom-cuadros')
    spy.mockRestore()
  })
})

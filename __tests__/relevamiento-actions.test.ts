import { beforeEach, describe, expect, test, vi } from 'vitest'

const getUser = vi.fn()
const insertSingle = vi.fn()
const updateEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from: () => ({
      insert: () => ({ select: () => ({ single: insertSingle }) }),
      update: () => ({ eq: updateEq }),
    }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { crearRelevamiento, registrarArchivos } = await import('@/app/dashboard/cargar-viaje/actions')

const CAMINO = '0d5a3c9a-2f3e-4d1b-9c8a-1b2c3d4e5f60'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('crearRelevamiento', () => {
  test('valida y devuelve el id creado', async () => {
    insertSingle.mockResolvedValue({ data: { id: 'r1' }, error: null })
    const r = await crearRelevamiento({ camino_id: CAMINO, origen_datos: 'formulario', km: '3' })
    expect(r).toEqual({ ok: true, data: { id: 'r1' } })
  })

  test('rechaza origen inválido', async () => {
    const r = await crearRelevamiento({ camino_id: CAMINO, origen_datos: 'otro', km: '3' })
    expect(r.ok).toBe(false)
    expect(insertSingle).not.toHaveBeenCalled()
  })
})

describe('registrarArchivos', () => {
  test('guarda las rutas en metadata', async () => {
    updateEq.mockResolvedValue({ error: null })
    const r = await registrarArchivos('r1', 4.5, ['u1/r1/a.jpg'])
    expect(r).toEqual({ ok: true, data: undefined })
  })
})

import { beforeEach, describe, expect, test, vi } from 'vitest'

const insert = vi.fn()
const single = vi.fn()
const getUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from: (tabla: string) => {
      if (tabla === 'perfiles') {
        return { select: () => ({ eq: () => ({ single }) }) }
      }
      return { insert }
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { crearCamino } = await import('@/app/dashboard/caminos/actions')

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('crearCamino', () => {
  test('rechaza nombre corto', async () => {
    const fd = new FormData()
    fd.set('nombre_codigo', 'A')
    const r = await crearCamino(undefined, fd)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/2 caracteres/) })
    expect(insert).not.toHaveBeenCalled()
  })

  test('inserta con el municipio del perfil', async () => {
    single.mockResolvedValue({ data: { municipio_id: 'carlos-tejedor', rol: 'municipio' }, error: null })
    insert.mockResolvedValue({ error: null })
    const fd = new FormData()
    fd.set('nombre_codigo', 'CR-01')
    const r = await crearCamino(undefined, fd)
    expect(insert).toHaveBeenCalledWith({ nombre_codigo: 'CR-01', municipio: 'carlos-tejedor' })
    expect(r).toEqual({ ok: true, data: undefined })
  })

  test('devuelve mensaje claro si RLS rechaza', async () => {
    single.mockResolvedValue({ data: { municipio_id: 'carlos-tejedor', rol: 'productor' }, error: null })
    insert.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })
    const fd = new FormData()
    fd.set('nombre_codigo', 'CR-01')
    const r = await crearCamino(undefined, fd)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/permiso/i) })
  })
})

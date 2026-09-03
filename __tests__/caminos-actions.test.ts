import { beforeEach, describe, expect, test, vi } from 'vitest'

const insert = vi.fn()
const maybeSingle = vi.fn()
const getUser = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { revalidatePath } = await import('next/cache')
const { crearCamino } = await import('@/app/dashboard/caminos/actions')

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  from.mockImplementation((tabla: string) => {
    if (tabla === 'perfiles') {
      return { select: () => ({ eq: () => ({ maybeSingle }) }) }
    }
    return { insert }
  })
})

describe('crearCamino', () => {
  test('rechaza nombre corto', async () => {
    const fd = new FormData()
    fd.set('nombre_codigo', 'A')
    const r = await crearCamino(undefined, fd)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/2 caracteres/) })
    expect(insert).not.toHaveBeenCalled()
  })

  test('sin sesión no inserta y devuelve error de sesión', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const fd = new FormData()
    fd.set('nombre_codigo', 'CR-01')
    const r = await crearCamino(undefined, fd)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sesión/i) })
    expect(insert).not.toHaveBeenCalled()
  })

  test('inserta con el municipio del perfil', async () => {
    maybeSingle.mockResolvedValue({ data: { municipio_id: 'carlos-tejedor' }, error: null })
    insert.mockResolvedValue({ error: null })
    const fd = new FormData()
    fd.set('nombre_codigo', 'CR-01')
    const r = await crearCamino(undefined, fd)
    expect(from).toHaveBeenCalledWith('caminos')
    expect(insert).toHaveBeenCalledWith({ nombre_codigo: 'CR-01', municipio: 'carlos-tejedor' })
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/caminos')
    expect(r).toEqual({ ok: true, data: undefined })
  })

  test('devuelve mensaje claro si RLS rechaza por código', async () => {
    maybeSingle.mockResolvedValue({ data: { municipio_id: 'carlos-tejedor' }, error: null })
    insert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } })
    const fd = new FormData()
    fd.set('nombre_codigo', 'CR-01')
    const r = await crearCamino(undefined, fd)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/permiso/i) })
  })

  test('devuelve mensaje genérico ante error de base de datos', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    maybeSingle.mockResolvedValue({ data: { municipio_id: 'carlos-tejedor' }, error: null })
    insert.mockResolvedValue({ error: { message: 'boom' } })
    const fd = new FormData()
    fd.set('nombre_codigo', 'CR-01')
    const r = await crearCamino(undefined, fd)
    expect(r).toEqual({ ok: false, error: 'No se pudo crear el camino. Intentá de nuevo.' })
    if (r && !r.ok) expect(r.error).not.toContain('boom')
    spy.mockRestore()
  })
})

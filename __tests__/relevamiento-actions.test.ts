import { beforeEach, describe, expect, test, vi } from 'vitest'

const getUser = vi.fn()
const insert = vi.fn()
const insertSingle = vi.fn()
const update = vi.fn()
const eq = vi.fn()
const updateResultado = vi.fn()

/** `.update().eq('id').eq('usuario_id')` — cada `eq` devuelve el mismo encadenable thenable. */
const encadenable = {
  eq: (...args: unknown[]) => {
    eq(...args)
    return encadenable
  },
  then: (resolver: (valor: unknown) => unknown) => Promise.resolve(updateResultado()).then(resolver),
}

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from: () => ({
      insert: (payload: unknown) => {
        insert(payload)
        return { select: () => ({ single: insertSingle }) }
      },
      update: (payload: unknown) => {
        update(payload)
        return encadenable
      },
    }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { crearRelevamiento, registrarArchivos } = await import('@/app/dashboard/cargar-viaje/actions')
const { revalidatePath } = await import('next/cache')

const CAMINO = '0d5a3c9a-2f3e-4d1b-9c8a-1b2c3d4e5f60'
const RELEVAMIENTO = '7c1f2e40-9b3a-4c5d-8e6f-0a1b2c3d4e5f'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  updateResultado.mockReturnValue({ error: null })
})

describe('crearRelevamiento', () => {
  test('inserta con el usuario de la sesión y devuelve id y km', async () => {
    insertSingle.mockResolvedValue({ data: { id: 'r1' }, error: null })

    const r = await crearRelevamiento({ camino_id: CAMINO, origen_datos: 'formulario', km: '3' })

    expect(insert).toHaveBeenCalledWith({
      usuario_id: 'u1',
      camino_id: CAMINO,
      origen_datos: 'formulario',
      metadata: { km: 3, archivos: [] },
    })
    expect(r).toEqual({ ok: true, data: { id: 'r1', km: 3 } })
  })

  test('rechaza origen inválido', async () => {
    const r = await crearRelevamiento({ camino_id: CAMINO, origen_datos: 'otro', km: '3' })

    expect(r.ok).toBe(false)
    expect(insertSingle).not.toHaveBeenCalled()
  })

  test('devuelve sesión vencida cuando no hay usuario', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const r = await crearRelevamiento({ camino_id: CAMINO, origen_datos: 'formulario', km: '3' })

    expect(r).toEqual({ ok: false, error: 'Sesión vencida. Volvé a ingresar.' })
    expect(insertSingle).not.toHaveBeenCalled()
  })

  test('loguea el error crudo y devuelve un mensaje genérico', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    insertSingle.mockResolvedValue({ data: null, error: { message: 'duplicate key value' } })

    const r = await crearRelevamiento({ camino_id: CAMINO, origen_datos: 'formulario', km: '3' })

    expect(r).toEqual({ ok: false, error: 'No se pudo crear el relevamiento. Intentá de nuevo.' })
    expect(spy).toHaveBeenCalledWith('[cargar-viaje]', 'duplicate key value')
    spy.mockRestore()
  })
})

describe('registrarArchivos', () => {
  test('guarda las rutas y limita el update al relevamiento del usuario', async () => {
    const r = await registrarArchivos(RELEVAMIENTO, 4.5, ['u1/r1/a.jpg'])

    expect(update).toHaveBeenCalledWith({ metadata: { km: 4.5, archivos: ['u1/r1/a.jpg'] } })
    expect(eq).toHaveBeenCalledWith('id', RELEVAMIENTO)
    expect(eq).toHaveBeenCalledWith('usuario_id', 'u1')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
    expect(r).toEqual({ ok: true, data: undefined })
  })

  test('rechaza un id que no es uuid sin tocar la base', async () => {
    const r = await registrarArchivos('r1', 4.5, [])

    expect(r).toEqual({ ok: false, error: 'Relevamiento inválido' })
    expect(update).not.toHaveBeenCalled()
  })

  test('devuelve sesión vencida cuando no hay usuario', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const r = await registrarArchivos(RELEVAMIENTO, 4.5, [])

    expect(r).toEqual({ ok: false, error: 'Sesión vencida. Volvé a ingresar.' })
    expect(update).not.toHaveBeenCalled()
  })

  test('loguea el error crudo y devuelve un mensaje genérico', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateResultado.mockReturnValue({ error: { message: 'permission denied' } })

    const r = await registrarArchivos(RELEVAMIENTO, 4.5, ['u1/r1/a.jpg'])

    expect(r).toEqual({ ok: false, error: 'No se pudieron registrar los archivos. Intentá de nuevo.' })
    expect(spy).toHaveBeenCalledWith('[cargar-viaje]', 'permission denied')
    expect(revalidatePath).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

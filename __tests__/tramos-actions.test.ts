import { beforeEach, describe, expect, test, vi } from 'vitest'

const insert = vi.fn()
const update = vi.fn()
const eq = vi.fn()
const select = vi.fn()
const single = vi.fn()
const maybeSingle = vi.fn()
const getUser = vi.fn()
const from = vi.fn()
const revalidatePath = vi.fn()
const revalidarMunicipio = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/cache', () => ({ revalidarMunicipio }))

const { crearTramo, actualizarTramo } = await import('@/app/dashboard/tramos/actions')

const GEOMETRIA: [number, number][] = [
  [-57.9, -36.99],
  [-57.89, -36.98],
]

function payload(extra: Record<string, unknown> = {}) {
  return {
    nombreCodigo: 'CR-099 Camino nuevo',
    localidad: 'Maipú',
    geometria: GEOMETRIA,
    activo: true,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  maybeSingle.mockResolvedValue({ data: { rol: 'municipio', municipio_id: 'maipu' }, error: null })

  eq.mockReturnValue({ select })
  select.mockReturnValue({ single })
  insert.mockReturnValue({ select })
  update.mockReturnValue({ eq })

  from.mockImplementation((tabla: string) => {
    if (tabla === 'perfiles') {
      return { select: () => ({ eq: () => ({ maybeSingle }) }) }
    }
    return { insert, update }
  })
})

describe('crearTramo', () => {
  test('rechaza un payload inválido sin tocar la base', async () => {
    const r = await crearTramo(payload({ nombreCodigo: 'A' }))
    expect(r.ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  test('rechaza una geometría de un solo punto', async () => {
    const r = await crearTramo(payload({ geometria: [[-57.9, -36.99]] }))
    expect(r.ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  test('sin sesión no inserta y devuelve error de sesión', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const r = await crearTramo(payload())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sesión/i) })
    expect(insert).not.toHaveBeenCalled()
  })

  test('rechaza a un productor sin llegar a insertar (chequeo de rol en el servidor)', async () => {
    maybeSingle.mockResolvedValue({ data: { rol: 'productor', municipio_id: 'maipu' }, error: null })
    const r = await crearTramo(payload())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no tenés permiso/i) })
    expect(insert).not.toHaveBeenCalled()
  })

  test('camino feliz: inserta con km calculado del lado del servidor, ignorando cualquier km del cliente', async () => {
    single.mockResolvedValue({ data: { id: 'manual-x' }, error: null })
    const r = await crearTramo(payload({ km: 999999 }))

    expect(from).toHaveBeenCalledWith('tramos')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        municipio: 'maipu',
        nombre_codigo: 'CR-099 Camino nuevo',
        localidad: 'Maipú',
        geometria: GEOMETRIA,
        activo: true,
      }),
    )
    const insertado = insert.mock.calls[0][0]
    expect(insertado.km).toBeGreaterThan(0)
    expect(insertado.km).not.toBe(999999)
    expect(insertado.id).toMatch(/^manual-/)
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/tramos')
    expect(revalidarMunicipio).toHaveBeenCalledWith('maipu')
    expect(r).toEqual({ ok: true, data: { id: 'manual-x' } })
  })

  test('un auditor también puede crear', async () => {
    maybeSingle.mockResolvedValue({ data: { rol: 'auditor', municipio_id: 'maipu' }, error: null })
    single.mockResolvedValue({ data: { id: 'manual-x' }, error: null })
    const r = await crearTramo(payload())
    expect(r.ok).toBe(true)
  })

  test('error de RLS se traduce a mensaje de permiso', async () => {
    single.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    const r = await crearTramo(payload())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no tenés permiso/i) })
  })

  test('error genérico no filtra detalles internos', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    single.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = await crearTramo(payload())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toContain('boom')
    spy.mockRestore()
  })
})

describe('actualizarTramo', () => {
  test('rechaza un id vacío', async () => {
    const r = await actualizarTramo('', payload())
    expect(r.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  test('rechaza un payload inválido', async () => {
    const r = await actualizarTramo('t1', payload({ localidad: '' }))
    expect(r.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  test('rechaza a un productor', async () => {
    maybeSingle.mockResolvedValue({ data: { rol: 'productor', municipio_id: 'maipu' }, error: null })
    const r = await actualizarTramo('t1', payload())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no tenés permiso/i) })
    expect(update).not.toHaveBeenCalled()
  })

  test('0 filas afectadas (tramo de otro municipio, RLS) se traduce a mensaje de permiso', async () => {
    eq.mockReturnValue({ select: () => Promise.resolve({ data: [], error: null }) })
    const r = await actualizarTramo('t-ajeno', payload())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no tenés permiso/i) })
  })

  test('camino feliz: actualiza con km recalculado del lado del servidor y revalida', async () => {
    eq.mockReturnValue({ select: () => Promise.resolve({ data: [{ id: 't1' }], error: null }) })
    const r = await actualizarTramo('t1', payload({ activo: false }))

    expect(from).toHaveBeenCalledWith('tramos')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre_codigo: 'CR-099 Camino nuevo',
        localidad: 'Maipú',
        geometria: GEOMETRIA,
        activo: false,
      }),
    )
    expect(update.mock.calls[0][0]).not.toHaveProperty('municipio')
    expect(eq).toHaveBeenCalledWith('id', 't1')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/tramos')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/tramos/t1')
    expect(revalidarMunicipio).toHaveBeenCalledWith('maipu')
    expect(r).toEqual({ ok: true, data: undefined })
  })
})

import { beforeEach, describe, expect, test, vi } from 'vitest'

const update = vi.fn()
const eq = vi.fn()
const select = vi.fn()
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

const { cambiarEstado } = await import('@/app/dashboard/observaciones/actions')

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  eq.mockReturnValue({ select })
  update.mockReturnValue({ eq })
  from.mockImplementation((tabla: string) => {
    if (tabla === 'perfiles') {
      return { select: () => ({ eq: () => ({ maybeSingle }) }) }
    }
    return { update }
  })
  maybeSingle.mockResolvedValue({ data: { municipio_id: 'maipu' }, error: null })
})

describe('cambiarEstado', () => {
  test('rechaza un estado inválido', async () => {
    const r = await cambiarEstado('11111111-1111-4111-8111-111111111111', 'archivada')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/estado válido/i) })
    expect(update).not.toHaveBeenCalled()
  })

  test('rechaza un identificador de observación inválido', async () => {
    const r = await cambiarEstado('no-es-uuid', 'en_obra')
    expect(r.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  test('rechaza una nota de más de 500 caracteres', async () => {
    const r = await cambiarEstado('11111111-1111-4111-8111-111111111111', 'en_obra', 'a'.repeat(501))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/500 caracteres/) })
    expect(update).not.toHaveBeenCalled()
  })

  test('sin sesión no actualiza y devuelve error de sesión', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const r = await cambiarEstado('11111111-1111-4111-8111-111111111111', 'en_obra')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sesión/i) })
    expect(update).not.toHaveBeenCalled()
  })

  test('camino feliz: actualiza estado, estado_at y estado_por, y revalida', async () => {
    select.mockResolvedValue({ data: [{ id: 'o1' }], error: null })
    const r = await cambiarEstado('11111111-1111-4111-8111-111111111111', 'en_obra', 'arreglo en curso')

    expect(from).toHaveBeenCalledWith('fallas_deteccion')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: 'en_obra',
        estado_nota: 'arreglo en curso',
        estado_por: 'u1',
        estado_at: expect.any(String),
      }),
    )
    expect(eq).toHaveBeenCalledWith('id', '11111111-1111-4111-8111-111111111111')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/observaciones')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/mapa')
    expect(revalidarMunicipio).toHaveBeenCalledWith('maipu')
    expect(r).toEqual({ ok: true, data: undefined })
  })

  test('nota opcional se guarda como null cuando no se manda', async () => {
    select.mockResolvedValue({ data: [{ id: 'o1' }], error: null })
    await cambiarEstado('11111111-1111-4111-8111-111111111111', 'resuelta')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ estado_nota: null }))
  })

  test('RLS/trigger rechazan el cambio (rol sin permiso): 0 filas devueltas', async () => {
    select.mockResolvedValue({ data: [], error: null })
    const r = await cambiarEstado('11111111-1111-4111-8111-111111111111', 'descartada')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no tenés permiso/i) })
  })

  test('error de permiso explícito (código 42501) se traduce a mensaje claro', async () => {
    select.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    const r = await cambiarEstado('11111111-1111-4111-8111-111111111111', 'descartada')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no tenés permiso/i) })
  })

  test('error genérico de base de datos no filtra detalles internos', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    select.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = await cambiarEstado('11111111-1111-4111-8111-111111111111', 'descartada')
    expect(r).toEqual({ ok: false, error: 'No se pudo actualizar el estado. Intentá de nuevo.' })
    if (!r.ok) expect(r.error).not.toContain('boom')
    spy.mockRestore()
  })
})

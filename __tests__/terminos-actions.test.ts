import { beforeEach, describe, expect, test, vi } from 'vitest'

const getUser = vi.fn()
const update = vi.fn()
const eq = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({ auth: { getUser }, from }),
}))

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})
vi.mock('next/navigation', () => ({ redirect }))

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath }))

const { aceptarTerminos } = await import('@/app/terminos/actions')

function formulario(acepto: boolean): FormData {
  const fd = new FormData()
  if (acepto) fd.set('acepto', 'on')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  eq.mockResolvedValue({ error: null })
  update.mockReturnValue({ eq })
  from.mockReturnValue({ update })
})

describe('aceptarTerminos', () => {
  test('sin marcar la casilla no toca la base', async () => {
    const r = await aceptarTerminos(undefined, formulario(false))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/casilla/i) })
    expect(update).not.toHaveBeenCalled()
  })

  test('sin sesión devuelve error y no actualiza', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const r = await aceptarTerminos(undefined, formulario(true))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sesión/i) })
    expect(update).not.toHaveBeenCalled()
  })

  test('guarda la fecha en el propio perfil y redirige al dashboard', async () => {
    await expect(aceptarTerminos(undefined, formulario(true))).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard',
    )
    expect(from).toHaveBeenCalledWith('perfiles')
    expect(update).toHaveBeenCalledWith({ acepto_terminos_at: expect.any(String) })
    expect(eq).toHaveBeenCalledWith('id', 'u1')
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  test('ante error de base devuelve mensaje genérico y loguea el original', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    eq.mockResolvedValue({ error: { message: 'boom' } })
    const r = await aceptarTerminos(undefined, formulario(true))
    expect(r).toEqual({ ok: false, error: 'No se pudieron guardar los términos. Intentá de nuevo.' })
    expect(spy).toHaveBeenCalledWith('[terminos]', 'boom')
    expect(redirect).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

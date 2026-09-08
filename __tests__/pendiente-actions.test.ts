import { beforeEach, describe, expect, test, vi } from 'vitest'

const getUser = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  crearClienteAdmin: () => ({ from }),
}))

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})
vi.mock('next/navigation', () => ({ redirect }))

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath }))

const { aplicarCodigo } = await import('@/app/pendiente/actions')

/** Encadenable mínimo que reproduce `.from(...).select().eq().eq().maybeSingle()`. */
function encadenable(resultado: { data: unknown; error: unknown }) {
  const objeto = {
    select: vi.fn(() => objeto),
    update: vi.fn(() => objeto),
    eq: vi.fn(() => objeto),
    maybeSingle: vi.fn(async () => resultado),
    then: undefined,
  }
  return objeto
}

/** Encadenable para `.from('perfiles').update(...).eq().eq().select()`, que resuelve al `await`. */
function encadenableUpdate(filas: unknown[]) {
  const objeto = {
    update: vi.fn(() => objeto),
    eq: vi.fn(() => objeto),
    select: vi.fn(async () => ({ data: filas, error: null })),
  }
  return objeto
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('aplicarCodigo', () => {
  test('sin sesión devuelve error', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const r = await aplicarCodigo('MAIPU-2027')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sesión/i) })
    expect(from).not.toHaveBeenCalled()
  })

  test('código inválido devuelve error de validación sin consultar la base', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const r = await aplicarCodigo('ab')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/código/i) })
    expect(from).not.toHaveBeenCalled()
  })

  test('código inexistente o inactivo devuelve error', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    from.mockReturnValueOnce(encadenable({ data: null, error: null }))
    const r = await aplicarCodigo('NOEXISTE-1')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/código/i) })
  })

  test('perfil ya asignado (0 filas actualizadas) devuelve error', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    from
      .mockReturnValueOnce(encadenable({ data: { municipio: 'maipu' }, error: null }))
      .mockReturnValueOnce(encadenableUpdate([]))
    const r = await aplicarCodigo('MAIPU-2027')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/ya tiene un municipio/i) })
  })

  test('camino feliz: asigna el municipio y redirige al dashboard', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    from
      .mockReturnValueOnce(encadenable({ data: { municipio: 'maipu' }, error: null }))
      .mockReturnValueOnce(encadenableUpdate([{ id: 'u1' }]))
    await expect(aplicarCodigo('maipu-2027')).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })
})

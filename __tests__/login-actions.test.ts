import { beforeEach, describe, expect, test, vi } from 'vitest'

const signInWithPassword = vi.fn()
const signUp = vi.fn()
const signOut = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { signInWithPassword, signUp, signOut },
  }),
}))

const redirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect }))

const { signIn, signUpAction } = await import('@/app/login/actions')

function formulario(datos: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(datos)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('signIn', () => {
  test('devuelve error de validación sin llamar a Supabase', async () => {
    const r = await signIn(undefined, formulario({ email: 'no', password: 'x' }))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/email/i) })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  test('devuelve el error de Supabase en español', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const r = await signIn(undefined, formulario({ email: 'a@b.com', password: '12345678' }))
    expect(r).toEqual({ ok: false, error: 'Email o contraseña incorrectos' })
  })

  test('redirige al dashboard si entra', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    await signIn(undefined, formulario({ email: 'a@b.com', password: '12345678' }))
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })
})

describe('signUpAction', () => {
  test('envía nombre y municipio en metadata', async () => {
    signUp.mockResolvedValue({ error: null, data: { session: {} } })
    await signUpAction(
      undefined,
      formulario({ email: 'a@b.com', password: '12345678', nombre: 'Ana', municipio_id: 'carlos-tejedor' }),
    )
    expect(signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: '12345678',
      options: { data: { nombre: 'Ana', municipio_id: 'carlos-tejedor' } },
    })
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  test('rechaza partido inválido', async () => {
    const r = await signUpAction(
      undefined,
      formulario({ email: 'a@b.com', password: '12345678', nombre: 'Ana', municipio_id: 'narnia' }),
    )
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/partido/i) })
    expect(signUp).not.toHaveBeenCalled()
  })
})

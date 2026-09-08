import { beforeEach, describe, expect, test, vi } from 'vitest'

const signInWithPassword = vi.fn()
const signUp = vi.fn()
const signOut = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { signInWithPassword, signUp, signOut },
  }),
}))

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})
vi.mock('next/navigation', () => ({ redirect }))

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath }))

const { signIn, signUpAction, signOut: signOutAction } = await import('@/app/login/actions')

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

  test('devuelve un mensaje genérico en español para errores desconocidos y loguea el original', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    signInWithPassword.mockResolvedValue({ error: { message: 'Something weird happened upstream' } })
    const r = await signIn(undefined, formulario({ email: 'a@b.com', password: '12345678' }))
    expect(r).toEqual({ ok: false, error: 'No se pudo completar la operación. Intentá de nuevo.' })
    expect(spy).toHaveBeenCalledWith('[auth]', 'Something weird happened upstream')
    spy.mockRestore()
  })

  test('redirige al dashboard si entra', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    await expect(
      signIn(undefined, formulario({ email: 'a@b.com', password: '12345678' })),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })
})

describe('signUpAction', () => {
  test('envía nombre y código de invitación en metadata, sin municipio_id', async () => {
    signUp.mockResolvedValue({ error: null, data: { session: {} } })
    await expect(
      signUpAction(
        undefined,
        formulario({ email: 'a@b.com', password: '12345678', nombre: 'Ana', codigo_invitacion: 'MAIPU-2027' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: '12345678',
      options: { data: { nombre: 'Ana', codigo_invitacion: 'MAIPU-2027' } },
    })
    const metadata = signUp.mock.calls[0][0].options.data
    expect(metadata).not.toHaveProperty('municipio_id')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  test('rechaza código de invitación demasiado corto', async () => {
    const r = await signUpAction(
      undefined,
      formulario({ email: 'a@b.com', password: '12345678', nombre: 'Ana', codigo_invitacion: 'ab' }),
    )
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/código de invitación/i) })
    expect(signUp).not.toHaveBeenCalled()
  })

  test('rechaza código de invitación demasiado largo', async () => {
    const r = await signUpAction(
      undefined,
      formulario({
        email: 'a@b.com',
        password: '12345678',
        nombre: 'Ana',
        codigo_invitacion: 'x'.repeat(41),
      }),
    )
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/código de invitación/i) })
    expect(signUp).not.toHaveBeenCalled()
  })

  test('rechaza registro sin código de invitación', async () => {
    const r = await signUpAction(
      undefined,
      formulario({ email: 'a@b.com', password: '12345678', nombre: 'Ana' }),
    )
    expect(r?.ok).toBe(false)
    expect(signUp).not.toHaveBeenCalled()
  })

  test('sin sesión (email sin confirmar) devuelve ok sin redirigir', async () => {
    signUp.mockResolvedValue({ error: null, data: { session: null } })
    const r = await signUpAction(
      undefined,
      formulario({ email: 'a@b.com', password: '12345678', nombre: 'Ana', codigo_invitacion: 'MAIPU-2027' }),
    )
    expect(r).toEqual({ ok: true, data: undefined })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('signOut', () => {
  test('cierra sesión, revalida el layout y redirige a login', async () => {
    signOut.mockResolvedValue({ error: null })
    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(signOut).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(redirect).toHaveBeenCalledWith('/login')
  })
})

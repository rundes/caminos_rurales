import { beforeEach, describe, expect, test, vi } from 'vitest'

const getUser = vi.fn()
const updateUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({ auth: { getUser, updateUser } }),
}))

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})
vi.mock('next/navigation', () => ({ redirect }))

const { actualizarClave } = await import('@/app/nueva-clave/actions')

function formulario(password: string): FormData {
  const fd = new FormData()
  fd.set('password', password)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  updateUser.mockResolvedValue({ error: null })
})

describe('actualizarClave', () => {
  test('contraseña corta: error de validación sin tocar Supabase', async () => {
    const r = await actualizarClave(undefined, formulario('corta'))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/al menos 8 caracteres/i) })
    expect(getUser).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  test('sin sesión de recuperación: error explícito y no llama a updateUser', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const r = await actualizarClave(undefined, formulario('12345678'))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/enlace/i) })
    expect(updateUser).not.toHaveBeenCalled()
  })

  test('con sesión: actualiza la contraseña y redirige al dashboard', async () => {
    await expect(actualizarClave(undefined, formulario('12345678'))).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard',
    )
    expect(updateUser).toHaveBeenCalledWith({ password: '12345678' })
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  test('error de Supabase al actualizar: se traduce al español', async () => {
    updateUser.mockResolvedValue({
      error: { message: 'New password should be different from the old password.' },
    })
    const r = await actualizarClave(undefined, formulario('12345678'))
    expect(r).toEqual({ ok: false, error: 'La contraseña nueva debe ser distinta de la anterior' })
    expect(redirect).not.toHaveBeenCalled()
  })
})

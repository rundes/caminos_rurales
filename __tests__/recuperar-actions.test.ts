import { beforeEach, describe, expect, test, vi } from 'vitest'

const resetPasswordForEmail = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({ auth: { resetPasswordForEmail } }),
}))

const origenActual = vi.fn()
vi.mock('@/lib/url-origen', () => ({ origenActual: () => origenActual() }))

const { solicitarRecuperacion } = await import('@/app/recuperar/actions')

function formulario(email: string): FormData {
  const fd = new FormData()
  fd.set('email', email)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  origenActual.mockResolvedValue('https://visiovial.example')
  resetPasswordForEmail.mockResolvedValue({ error: null })
})

describe('solicitarRecuperacion', () => {
  test('email inválido: error de validación sin llamar a Supabase', async () => {
    const r = await solicitarRecuperacion(undefined, formulario('no-es-un-email'))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/email/i) })
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  test('email válido: llama a resetPasswordForEmail con redirectTo armado desde el origen', async () => {
    const r = await solicitarRecuperacion(undefined, formulario('a@b.com'))
    expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {
      redirectTo: 'https://visiovial.example/auth/confirm?next=%2Fnueva-clave',
    })
    expect(r).toEqual({ ok: true, data: undefined })
  })

  test('email inexistente: misma respuesta neutra que uno existente', async () => {
    // Supabase no distingue este caso: no hay branch de "no encontrado".
    const r = await solicitarRecuperacion(undefined, formulario('inexistente@b.com'))
    expect(r).toEqual({ ok: true, data: undefined })
  })

  test('error real de Supabase: sigue devolviendo éxito neutro, y loguea el error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } })
    const r = await solicitarRecuperacion(undefined, formulario('a@b.com'))
    expect(r).toEqual({ ok: true, data: undefined })
    expect(spy).toHaveBeenCalledWith('[recuperar]', 'Email rate limit exceeded')
  })

  test('si no se puede determinar el origen, igual devuelve éxito neutro y loguea', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    origenActual.mockRejectedValue(new Error('sin host'))
    const r = await solicitarRecuperacion(undefined, formulario('a@b.com'))
    expect(r).toEqual({ ok: true, data: undefined })
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
  })
})

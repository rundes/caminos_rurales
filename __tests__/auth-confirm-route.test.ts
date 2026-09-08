// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const exchangeCodeForSession = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({ auth: { exchangeCodeForSession } }),
}))

const { GET } = await import('@/app/auth/confirm/route')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /auth/confirm', () => {
  test('sin code: redirige a /recuperar', async () => {
    const request = new NextRequest('http://localhost/auth/confirm')
    const respuesta = await GET(request)
    expect(respuesta.status).toBe(307)
    expect(new URL(respuesta.headers.get('location')!).pathname).toBe('/recuperar')
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  test('code válido: exchangea la sesión y redirige a next', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    const request = new NextRequest('http://localhost/auth/confirm?code=abc123&next=/nueva-clave')
    const respuesta = await GET(request)
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123')
    expect(respuesta.status).toBe(307)
    expect(new URL(respuesta.headers.get('location')!).pathname).toBe('/nueva-clave')
  })

  test('sin next: usa /nueva-clave por defecto', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    const request = new NextRequest('http://localhost/auth/confirm?code=abc123')
    const respuesta = await GET(request)
    expect(new URL(respuesta.headers.get('location')!).pathname).toBe('/nueva-clave')
  })

  test('next con URL absoluta ajena: se ignora, usa el default', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    const request = new NextRequest(
      'http://localhost/auth/confirm?code=abc123&next=' + encodeURIComponent('https://evil.example'),
    )
    const respuesta = await GET(request)
    const destino = new URL(respuesta.headers.get('location')!)
    expect(destino.pathname).toBe('/nueva-clave')
    expect(destino.host).toBe('localhost')
  })

  test('next con "//" (protocol-relative): se ignora, usa el default', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    const request = new NextRequest(
      'http://localhost/auth/confirm?code=abc123&next=' + encodeURIComponent('//evil.example'),
    )
    const respuesta = await GET(request)
    const destino = new URL(respuesta.headers.get('location')!)
    expect(destino.host).toBe('localhost')
  })

  test('code inválido: exchangeCodeForSession falla, redirige a /recuperar y loguea', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid code' } })
    const request = new NextRequest('http://localhost/auth/confirm?code=malo')
    const respuesta = await GET(request)
    expect(new URL(respuesta.headers.get('location')!).pathname).toBe('/recuperar')
    expect(spy).toHaveBeenCalledWith('[auth-confirm]', 'invalid code')
  })
})

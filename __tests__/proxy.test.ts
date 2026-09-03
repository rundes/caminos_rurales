// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const getClaims = vi.fn()
const createServerClient = vi.fn(() => ({ auth: { getClaims } }))

vi.mock('@supabase/ssr', () => ({
  createServerClient,
}))

const { actualizarSesion } = await import('@/lib/supabase/proxy')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('actualizarSesion', () => {
  test('ruta protegida sin claims: redirige a /login', async () => {
    getClaims.mockResolvedValue({ data: null })
    const request = new NextRequest('http://localhost/dashboard')

    const respuesta = await actualizarSesion(request)

    expect(respuesta.status).toBe(307)
    expect(new URL(respuesta.headers.get('location')!).pathname).toBe('/login')
  })

  test('/login con claims: redirige a /dashboard', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u1' } } })
    const request = new NextRequest('http://localhost/login')

    const respuesta = await actualizarSesion(request)

    expect(respuesta.status).toBe(307)
    expect(new URL(respuesta.headers.get('location')!).pathname).toBe('/dashboard')
  })

  test('/ sin claims: deja pasar la petición', async () => {
    getClaims.mockResolvedValue({ data: null })
    const request = new NextRequest('http://localhost/')

    const respuesta = await actualizarSesion(request)

    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('x-middleware-next')).toBe('1')
  })
})

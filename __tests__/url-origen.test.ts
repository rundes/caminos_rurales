// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

const envServidor = vi.fn()
vi.mock('@/lib/env', () => ({ envServidor: () => envServidor() }))

const headersGet = vi.fn()
vi.mock('next/headers', () => ({
  headers: async () => ({ get: headersGet }),
}))

const { origenActual } = await import('@/lib/url-origen')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('origenActual', () => {
  test('prioriza SITE_URL cuando está configurada, sin importar los headers', async () => {
    envServidor.mockReturnValue({ SITE_URL: 'https://visiovial.example/' })
    const origen = await origenActual()
    expect(origen).toBe('https://visiovial.example')
    expect(headersGet).not.toHaveBeenCalled()
  })

  test('sin SITE_URL, arma el origen desde host + x-forwarded-proto', async () => {
    envServidor.mockReturnValue({ SITE_URL: undefined })
    headersGet.mockImplementation((nombre: string) =>
      nombre === 'host' ? 'app.example.com' : nombre === 'x-forwarded-proto' ? 'https' : null,
    )
    const origen = await origenActual()
    expect(origen).toBe('https://app.example.com')
  })

  test('sin x-forwarded-proto, usa http para localhost', async () => {
    envServidor.mockReturnValue({ SITE_URL: undefined })
    headersGet.mockImplementation((nombre: string) => (nombre === 'host' ? 'localhost:3000' : null))
    const origen = await origenActual()
    expect(origen).toBe('http://localhost:3000')
  })

  test('sin host, tira un error explícito', async () => {
    envServidor.mockReturnValue({ SITE_URL: undefined })
    headersGet.mockReturnValue(null)
    await expect(origenActual()).rejects.toThrow(/host/i)
  })
})

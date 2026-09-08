import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/app/dashboard/tramos/TramoForm', () => ({
  TramoForm: ({ modo, centro }: { modo: string; centro: [number, number] }) => (
    <div data-testid="tramo-form" data-modo={modo} data-centro={centro.join(',')} />
  ),
}))

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
vi.mock('next/navigation', () => ({ notFound }))

let userMock: { id: string } | null = { id: 'u1' }
let perfilMock: { rol: string; municipio_id: string } | null = { rol: 'municipio', municipio_id: 'maipu' }

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser: async () => ({ data: { user: userMock } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: perfilMock, error: null }) }) }),
    }),
  }),
}))

const { default: NuevoTramoPage } = await import('@/app/dashboard/tramos/nuevo/page')

function reiniciar() {
  userMock = { id: 'u1' }
  perfilMock = { rol: 'municipio', municipio_id: 'maipu' }
  notFound.mockClear()
}

describe('NuevoTramoPage', () => {
  test('municipio ve el formulario de alta centrado en su partido', async () => {
    reiniciar()
    render(await NuevoTramoPage())
    const form = screen.getByTestId('tramo-form')
    expect(form).toHaveAttribute('data-modo', 'crear')
  })

  test('auditor también ve el formulario', async () => {
    reiniciar()
    perfilMock = { rol: 'auditor', municipio_id: 'maipu' }
    render(await NuevoTramoPage())
    expect(screen.getByTestId('tramo-form')).toBeInTheDocument()
  })

  test('productor recibe 404', async () => {
    reiniciar()
    perfilMock = { rol: 'productor', municipio_id: 'maipu' }
    await expect(NuevoTramoPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  test('sin sesión recibe 404', async () => {
    reiniciar()
    userMock = null
    await expect(NuevoTramoPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

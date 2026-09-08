import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/app/dashboard/tramos/TramoForm', () => ({
  TramoForm: ({ modo, tramoId }: { modo: string; tramoId: string }) => (
    <div data-testid="tramo-form" data-modo={modo} data-tramo-id={tramoId} />
  ),
}))

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
vi.mock('next/navigation', () => ({ notFound }))

const TRAMO = {
  id: 't1',
  nombre_codigo: 'CR-014 Camino a La Elisa',
  localidad: 'Maipú',
  geometria: [
    [-57.9, -36.99],
    [-57.89, -36.98],
  ],
  activo: true,
}

let userMock: { id: string } | null = { id: 'u1' }
let perfilMock: { rol: string } | null = { rol: 'municipio' }
let tramoMock: typeof TRAMO | null = TRAMO

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser: async () => ({ data: { user: userMock } }) },
    from: (tabla: string) => {
      if (tabla === 'perfiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: perfilMock, error: null }) }) }) }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tramoMock, error: null }) }) }) }
    },
  }),
}))

const { default: EditarTramoPage } = await import('@/app/dashboard/tramos/[id]/editar/page')

const PARAMS = Promise.resolve({ id: 't1' })

function reiniciar() {
  userMock = { id: 'u1' }
  perfilMock = { rol: 'municipio' }
  tramoMock = TRAMO
  notFound.mockClear()
}

describe('EditarTramoPage', () => {
  test('municipio ve el formulario precargado con el tramo', async () => {
    reiniciar()
    render(await EditarTramoPage({ params: PARAMS }))
    const form = screen.getByTestId('tramo-form')
    expect(form).toHaveAttribute('data-modo', 'editar')
    expect(form).toHaveAttribute('data-tramo-id', 't1')
  })

  test('productor recibe 404', async () => {
    reiniciar()
    perfilMock = { rol: 'productor' }
    await expect(EditarTramoPage({ params: PARAMS })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  test('tramo inexistente (o de otro municipio, RLS) recibe 404', async () => {
    reiniciar()
    tramoMock = null
    await expect(EditarTramoPage({ params: PARAMS })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  test('sin sesión recibe 404', async () => {
    reiniciar()
    userMock = null
    await expect(EditarTramoPage({ params: PARAMS })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

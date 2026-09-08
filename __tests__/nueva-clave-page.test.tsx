import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({ auth: { getUser } }),
}))

vi.mock('@/app/nueva-clave/actions', () => ({
  actualizarClave: vi.fn(),
}))

const { default: NuevaClavePage } = await import('@/app/nueva-clave/page')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NuevaClavePage', () => {
  test('con sesión de recuperación (getUser la trae vía cookies del proxy): muestra el formulario', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    render(await NuevaClavePage())
    expect(screen.getByLabelText(/contraseña nueva/i)).toBeInTheDocument()
    expect(screen.queryByText(/enlace no es válido/i)).not.toBeInTheDocument()
  })

  test('sin sesión: muestra el aviso de enlace vencido en vez del formulario', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    render(await NuevaClavePage())
    expect(screen.queryByLabelText(/contraseña nueva/i)).not.toBeInTheDocument()
    expect(screen.getByText(/enlace no es válido/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /recuperar contraseña/i })).toHaveAttribute(
      'href',
      '/recuperar',
    )
  })
})

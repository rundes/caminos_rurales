import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { EstadoNuevaClave } from '@/app/nueva-clave/actions'

vi.mock('@/app/nueva-clave/actions', () => ({
  actualizarClave: vi.fn(),
}))

const { NuevaClaveForm } = await import('@/app/nueva-clave/NuevaClaveForm')
const { actualizarClave } = await import('@/app/nueva-clave/actions')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NuevaClaveForm', () => {
  test('pide la contraseña nueva con la misma regla de 8 caracteres que el servidor', () => {
    render(<NuevaClaveForm />)
    const input = screen.getByLabelText(/contraseña nueva/i)
    expect(input).toHaveAttribute('minLength', '8')
    expect(screen.getByText(/al menos 8 caracteres/i)).toBeInTheDocument()
  })

  test('muestra el error del servidor en un role="alert"', async () => {
    vi.mocked(actualizarClave).mockResolvedValue({
      ok: false,
      error: 'El enlace no es válido o venció. Pedí uno nuevo desde "Recuperar contraseña".',
    })
    render(<NuevaClaveForm />)

    await userEvent.type(screen.getByLabelText(/contraseña nueva/i), '12345678')
    await userEvent.click(screen.getByRole('button', { name: /guardar contraseña/i }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/enlace no es válido/i)
  })

  test('muestra estado de carga mientras se procesa', async () => {
    let resolver: (valor: EstadoNuevaClave) => void = () => {}
    vi.mocked(actualizarClave).mockReturnValue(new Promise((resolve) => (resolver = resolve)))
    render(<NuevaClaveForm />)

    await userEvent.type(screen.getByLabelText(/contraseña nueva/i), '12345678')
    await userEvent.click(screen.getByRole('button', { name: /guardar contraseña/i }))

    expect(await screen.findByRole('button', { name: /procesando/i })).toBeInTheDocument()
    resolver({ ok: true, data: undefined })
  })
})

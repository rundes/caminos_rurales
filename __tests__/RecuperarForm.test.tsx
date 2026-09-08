import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { EstadoRecuperar } from '@/app/recuperar/actions'

vi.mock('@/app/recuperar/actions', () => ({
  solicitarRecuperacion: vi.fn(),
}))

const { RecuperarForm } = await import('@/app/recuperar/RecuperarForm')
const { solicitarRecuperacion } = await import('@/app/recuperar/actions')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RecuperarForm', () => {
  test('pide el email y tiene un enlace para volver a ingresar', () => {
    render(<RecuperarForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enviar enlace/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /volver a ingresar/i })).toHaveAttribute('href', '/login')
  })

  test('muestra el mensaje neutro de éxito, sin importar si el email existe', async () => {
    vi.mocked(solicitarRecuperacion).mockResolvedValue({ ok: true, data: undefined })
    render(<RecuperarForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /enviar enlace/i }))

    const estado = await screen.findByRole('status')
    expect(estado).toHaveTextContent(/si el email está registrado/i)
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  })

  test('muestra el error del servidor en un role="alert"', async () => {
    // Un email con formato válido: `type="email"` bloquearía el submit a
    // nivel del navegador (constraint validation) antes de llegar a la
    // action, así que este test cubre el error que devuelve el servidor
    // (validación de zod ya se cubre aparte en __tests__/validaciones.test.ts).
    vi.mocked(solicitarRecuperacion).mockResolvedValue({ ok: false, error: 'Email inválido' })
    render(<RecuperarForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /enviar enlace/i }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Email inválido')
  })

  test('muestra estado de carga mientras se procesa', async () => {
    let resolver: (valor: EstadoRecuperar) => void = () => {}
    vi.mocked(solicitarRecuperacion).mockReturnValue(new Promise((resolve) => (resolver = resolve)))
    render(<RecuperarForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /enviar enlace/i }))

    expect(await screen.findByRole('button', { name: /procesando/i })).toBeInTheDocument()
    resolver({ ok: true, data: undefined })
  })
})

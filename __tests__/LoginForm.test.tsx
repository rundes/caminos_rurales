import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/app/login/actions', () => ({
  signIn: vi.fn(),
  signUpAction: vi.fn(),
}))

const { LoginForm } = await import('@/app/login/LoginForm')
const { signIn, signUpAction } = await import('@/app/login/actions')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginForm', () => {
  test('muestra login por defecto', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/partido/i)).not.toBeInTheDocument()
  })

  test('cambia a registro y muestra nombre y partido', async () => {
    render(<LoginForm />)
    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/partido/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /registrarme/i })).toBeInTheDocument()
  })

  test('muestra error cuando signIn falla', async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: false, error: 'Email o contraseña incorrectos' })
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/contraseña/i), '12345678')
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Email o contraseña incorrectos')
  })

  test('muestra éxito al registrarse', async () => {
    vi.mocked(signUpAction).mockResolvedValue({ ok: true, data: undefined })
    render(<LoginForm />)

    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/contraseña/i), '12345678')
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana')
    await userEvent.selectOptions(screen.getByLabelText(/partido/i), 'carlos-tejedor')
    await userEvent.click(screen.getByRole('button', { name: /registrarme/i }))

    const estado = await screen.findByRole('status')
    expect(estado).toHaveTextContent('Cuenta creada')
  })

  test('el error de login no persiste al cambiar a modo registro', async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: false, error: 'Email o contraseña incorrectos' })
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/contraseña/i), '12345678')
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }))
    await screen.findByRole('alert')

    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('muestra estado de carga mientras se procesa el login', async () => {
    vi.mocked(signIn).mockReturnValue(new Promise(() => {}))
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/contraseña/i), '12345678')
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    expect(await screen.findByRole('button', { name: /procesando/i })).toBeInTheDocument()
  })
})

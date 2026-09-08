import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { EstadoAuth } from '@/app/login/actions'

vi.mock('@/app/login/actions', () => ({
  signIn: vi.fn(),
  signUpAction: vi.fn(),
  reenviarConfirmacion: vi.fn(),
}))

const { LoginForm } = await import('@/app/login/LoginForm')
const { signIn, signUpAction, reenviarConfirmacion } = await import('@/app/login/actions')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginForm', () => {
  test('muestra login por defecto', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/partido/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/código de invitación/i)).not.toBeInTheDocument()
  })

  test('cambia a registro y muestra nombre y código de invitación, sin partido', async () => {
    render(<LoginForm />)
    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/código de invitación/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/partido/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
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
    await userEvent.type(screen.getByLabelText(/código de invitación/i), 'MAIPU-2027')
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
    // React 19 entrelaza (`entangle`) todas las transiciones de `useActionState`
    // pendientes en la página, incluso entre montajes distintos: una promesa
    // que nunca se resuelve deja "colgado" cualquier action posterior en otro
    // test de este archivo. Se resuelve al final para no filtrar ese estado.
    let resolver: (valor: EstadoAuth) => void = () => {}
    vi.mocked(signIn).mockReturnValue(new Promise((resolve) => (resolver = resolve)))
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/contraseña/i), '12345678')
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    expect(await screen.findByRole('button', { name: /procesando/i })).toBeInTheDocument()
    resolver({ ok: false, error: 'no importa para este test' })
  })

  test('tiene un enlace a /recuperar en modo login, no en modo registro', async () => {
    render(<LoginForm />)
    expect(screen.getByRole('link', { name: /olvidaste tu contraseña/i })).toHaveAttribute(
      'href',
      '/recuperar',
    )

    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(screen.queryByRole('link', { name: /olvidaste tu contraseña/i })).not.toBeInTheDocument()
  })

  test('email sin confirmar: ofrece reenviar el correo de confirmación', async () => {
    vi.mocked(signIn).mockResolvedValue({
      ok: false,
      error: 'Confirmá tu email antes de ingresar',
      codigo: 'email_no_confirmado',
    })
    render(<LoginForm />)

    expect(screen.queryByRole('button', { name: /reenviar correo/i })).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/contraseña/i), '12345678')
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    expect(await screen.findByRole('button', { name: /reenviar correo/i })).toBeInTheDocument()
  })

  test('reenviar confirmación entra en cooldown de 60s y no se puede espamear', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ delay: null })
    vi.mocked(signIn).mockResolvedValue({
      ok: false,
      error: 'Confirmá tu email antes de ingresar',
      codigo: 'email_no_confirmado',
    })
    vi.mocked(reenviarConfirmacion).mockResolvedValue({ ok: true, data: undefined })

    render(<LoginForm />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/contraseña/i), '12345678')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))

    const botonReenviar = await screen.findByRole('button', { name: /reenviar correo/i })
    await user.click(botonReenviar)

    expect(reenviarConfirmacion).toHaveBeenCalledTimes(1)
    const botonEnCooldown = await screen.findByRole('button', { name: /reenviar en \d+s/i })
    expect(botonEnCooldown).toBeDisabled()

    await user.click(botonEnCooldown)
    expect(reenviarConfirmacion).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(await screen.findByRole('button', { name: /reenviar correo de confirmación/i })).not.toBeDisabled()

    vi.useRealTimers()
  })
})

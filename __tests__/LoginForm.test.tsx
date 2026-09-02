import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/app/login/actions', () => ({
  signIn: vi.fn(),
  signUpAction: vi.fn(),
}))

const { LoginForm } = await import('@/app/login/LoginForm')

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
})

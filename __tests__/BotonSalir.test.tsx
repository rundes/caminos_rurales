import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { RecorridoLocal } from '@/lib/local/tipos'

vi.mock('@/app/login/actions', () => ({ signOut: vi.fn(async () => {}) }))
vi.mock('@/components/RegistroSw', () => ({ limpiarSw: vi.fn(async () => {}) }))
vi.mock('@/lib/local/db', () => ({
  cerrarDb: vi.fn(async () => {}),
  limpiarLocal: vi.fn(async () => {}),
  listarCola: vi.fn(async () => []),
  listarRecorridos: vi.fn(async () => []),
}))

const { BotonSalir } = await import('@/components/BotonSalir')
const { signOut } = await import('@/app/login/actions')
const { limpiarLocal, listarCola, listarRecorridos } = await import('@/lib/local/db')

const USUARIO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'

function recorrido(estado: RecorridoLocal['estado'], id = 'r1'): RecorridoLocal {
  return {
    id,
    usuarioId: USUARIO,
    inicio: '2026-09-03T10:00:00.000Z',
    estado,
    municipio: 'maipu',
    puntosGps: 3,
    km: 1.2,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarRecorridos).mockResolvedValue([])
  vi.mocked(listarCola).mockResolvedValue([])
})

describe('BotonSalir', () => {
  test('sin recorridos sin subir, sale directo', async () => {
    render(<BotonSalir usuarioId={USUARIO} />)

    await userEvent.click(screen.getByRole('button', { name: /^salir$/i }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(limpiarLocal).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('con un recorrido en curso pide confirmación antes de salir', async () => {
    vi.mocked(listarRecorridos).mockResolvedValue([recorrido('en_curso')])

    render(<BotonSalir usuarioId={USUARIO} />)
    await userEvent.click(screen.getByRole('button', { name: /^salir$/i }))

    expect(await screen.findByRole('dialog')).toHaveTextContent(/1 recorrido sin subir/i)
    expect(limpiarLocal).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  test('con recorridos encolados también pide confirmación, contando cada uno', async () => {
    vi.mocked(listarRecorridos).mockResolvedValue([
      recorrido('finalizado', 'r1'),
      recorrido('finalizado', 'r2'),
    ])
    vi.mocked(listarCola).mockResolvedValue([
      { recorridoId: 'r1', intentos: 0, proximoIntento: 0 },
      { recorridoId: 'r2', intentos: 1, proximoIntento: 5000 },
    ])

    render(<BotonSalir usuarioId={USUARIO} />)
    await userEvent.click(screen.getByRole('button', { name: /^salir$/i }))

    expect(await screen.findByRole('dialog')).toHaveTextContent(/2 recorridos sin subir/i)
  })

  test('Cancelar cierra el modal sin salir', async () => {
    vi.mocked(listarRecorridos).mockResolvedValue([recorrido('en_curso')])

    render(<BotonSalir usuarioId={USUARIO} />)
    await userEvent.click(screen.getByRole('button', { name: /^salir$/i }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })

  test('Salir igual continúa con la salida', async () => {
    vi.mocked(listarRecorridos).mockResolvedValue([recorrido('en_curso')])

    render(<BotonSalir usuarioId={USUARIO} />)
    await userEvent.click(screen.getByRole('button', { name: /^salir$/i }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: /salir igual/i }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(limpiarLocal).toHaveBeenCalledTimes(1)
  })
})

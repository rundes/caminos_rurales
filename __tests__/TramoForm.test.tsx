import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

const crearTramo = vi.fn()
const actualizarTramo = vi.fn()
vi.mock('@/app/dashboard/tramos/actions', () => ({
  crearTramo: (...args: unknown[]) => crearTramo(...args),
  actualizarTramo: (...args: unknown[]) => actualizarTramo(...args),
}))

// Mapa de dibujo simulado: un botón por punto fijo para no depender de Leaflet/JSDOM.
vi.mock('@/components/MapaDibujarTramoCliente', () => ({
  MapaDibujarTramoCliente: ({
    onAgregarPunto,
  }: {
    onAgregarPunto: (p: { lat: number; lng: number }) => void
  }) => (
    <div>
      <button type="button" onClick={() => onAgregarPunto({ lat: -36.99, lng: -57.9 })}>
        Agregar punto A
      </button>
      <button type="button" onClick={() => onAgregarPunto({ lat: -36.98, lng: -57.89 })}>
        Agregar punto B
      </button>
    </div>
  ),
}))

const { TramoForm } = await import('@/app/dashboard/tramos/TramoForm')

const CENTRO: [number, number] = [-36.88, -57.58]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TramoForm (crear)', () => {
  test('no envía con menos de 2 puntos dibujados: muestra error y no llama a la acción', async () => {
    const user = userEvent.setup()
    render(<TramoForm modo="crear" centro={CENTRO} />)

    await user.type(screen.getByLabelText(/nombre o código/i), 'CR-099 Camino nuevo')
    await user.type(screen.getByLabelText(/localidad/i), 'Maipú')
    await user.click(screen.getByRole('button', { name: /crear tramo/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/dibujá el tramo/i)
    expect(crearTramo).not.toHaveBeenCalled()
  })

  test('muestra el km en vivo a medida que se agregan puntos', async () => {
    const user = userEvent.setup()
    render(<TramoForm modo="crear" centro={CENTRO} />)

    expect(screen.getByText(/Km calculado:/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agregar punto A' }))
    await user.click(screen.getByRole('button', { name: 'Agregar punto B' }))

    expect(screen.getByText('2 punto(s) dibujado(s)')).toBeInTheDocument()
    expect(screen.getByText(/Km calculado:/)).toBeInTheDocument()
  })

  test('deshacer quita el último punto dibujado', async () => {
    const user = userEvent.setup()
    render(<TramoForm modo="crear" centro={CENTRO} />)

    await user.click(screen.getByRole('button', { name: 'Agregar punto A' }))
    await user.click(screen.getByRole('button', { name: 'Agregar punto B' }))
    expect(screen.getByText('2 punto(s) dibujado(s)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /deshacer último punto/i }))
    expect(screen.getByText('1 punto(s) dibujado(s)')).toBeInTheDocument()
  })

  test('camino feliz: llama a crearTramo con la geometría [lng,lat] y navega al detalle', async () => {
    crearTramo.mockResolvedValue({ ok: true, data: { id: 'manual-nuevo' } })
    const user = userEvent.setup()
    render(<TramoForm modo="crear" centro={CENTRO} />)

    await user.type(screen.getByLabelText(/nombre o código/i), 'CR-099 Camino nuevo')
    await user.type(screen.getByLabelText(/localidad/i), 'Maipú')
    await user.click(screen.getByRole('button', { name: 'Agregar punto A' }))
    await user.click(screen.getByRole('button', { name: 'Agregar punto B' }))
    await user.click(screen.getByRole('button', { name: /crear tramo/i }))

    await waitFor(() =>
      expect(crearTramo).toHaveBeenCalledWith({
        nombreCodigo: 'CR-099 Camino nuevo',
        localidad: 'Maipú',
        geometria: [
          [-57.9, -36.99],
          [-57.89, -36.98],
        ],
        activo: true,
      }),
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/tramos/manual-nuevo'))
  })

  test('muestra el error del servidor sin navegar', async () => {
    crearTramo.mockResolvedValue({ ok: false, error: 'No tenés permiso para crear o editar tramos.' })
    const user = userEvent.setup()
    render(<TramoForm modo="crear" centro={CENTRO} />)

    await user.type(screen.getByLabelText(/nombre o código/i), 'CR-099 Camino nuevo')
    await user.type(screen.getByLabelText(/localidad/i), 'Maipú')
    await user.click(screen.getByRole('button', { name: 'Agregar punto A' }))
    await user.click(screen.getByRole('button', { name: 'Agregar punto B' }))
    await user.click(screen.getByRole('button', { name: /crear tramo/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no tenés permiso/i)
    expect(push).not.toHaveBeenCalled()
  })
})

describe('TramoForm (editar)', () => {
  test('precarga los valores iniciales y llama a actualizarTramo con el id del tramo', async () => {
    actualizarTramo.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    render(
      <TramoForm
        modo="editar"
        tramoId="t1"
        centro={CENTRO}
        valoresIniciales={{
          nombreCodigo: 'CR-014 Camino a La Elisa',
          localidad: 'Maipú',
          geometria: [
            [-57.9, -36.99],
            [-57.89, -36.98],
          ],
          activo: true,
        }}
      />,
    )

    expect(screen.getByLabelText(/nombre o código/i)).toHaveValue('CR-014 Camino a La Elisa')
    expect(screen.getByText('2 punto(s) dibujado(s)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() =>
      expect(actualizarTramo).toHaveBeenCalledWith('t1', {
        nombreCodigo: 'CR-014 Camino a La Elisa',
        localidad: 'Maipú',
        geometria: [
          [-57.9, -36.99],
          [-57.89, -36.98],
        ],
        activo: true,
      }),
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/tramos/t1'))
  })

  test('desmarcar "activo" lo manda como false', async () => {
    actualizarTramo.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    render(
      <TramoForm
        modo="editar"
        tramoId="t1"
        centro={CENTRO}
        valoresIniciales={{
          nombreCodigo: 'CR-014',
          localidad: 'Maipú',
          geometria: [
            [-57.9, -36.99],
            [-57.89, -36.98],
          ],
          activo: true,
        }}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /activo/i }))
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() =>
      expect(actualizarTramo).toHaveBeenCalledWith('t1', expect.objectContaining({ activo: false })),
    )
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ControlGrabador } from '@/hooks/useGrabadorGps'
import { GRABADOR_INICIAL, type Grabador } from '@/lib/local/grabador'
import type { PuntoGps } from '@/lib/track'

vi.mock('next/dynamic', () => ({
  default: () => function MapaFalso() {
    return <div data-testid="mapa" />
  },
}))

vi.mock('@/hooks/useGrabadorGps', () => ({ useGrabadorGps: vi.fn() }))
vi.mock('@/hooks/useSincronizacion', () => ({ useSincronizacion: vi.fn() }))
vi.mock('@/lib/local/db', () => ({
  recorridoEnCurso: vi.fn(async () => undefined),
  guardarObservacion: vi.fn(async () => {}),
}))
vi.mock('@/lib/local/cierre', () => ({ cerrarRecorrido: vi.fn(async () => true) }))

const { RecorridoView } = await import('@/components/recorrido/RecorridoView')
const { useGrabadorGps } = await import('@/hooks/useGrabadorGps')
const { useSincronizacion } = await import('@/hooks/useSincronizacion')
const { recorridoEnCurso } = await import('@/lib/local/db')

const CENTRO: [number, number] = [-36.85, -57.88]
const T0 = 1_700_000_000_000

function punto(indice: number): PuntoGps {
  return { lat: -36.85 + indice * 0.01, lng: -57.88, t: T0 + indice * 1000, precision: 6 }
}

const GRABANDO: Grabador = {
  estado: 'grabando',
  recorridoId: '11111111-1111-4111-8111-111111111111',
  inicio: T0,
  fin: null,
  ultimo: punto(1),
  km: 1.23,
  puntosGps: [punto(0), punto(1)],
}

function control(estado: Grabador, extra: Partial<ControlGrabador> = {}): ControlGrabador {
  return {
    estado,
    error: null,
    precision: 7,
    iniciar: vi.fn(async () => {}),
    retomar: vi.fn(async () => {}),
    pausar: vi.fn(),
    reanudar: vi.fn(),
    finalizar: vi.fn(async () => estado.recorridoId),
    ...extra,
  }
}

function sincronizacion(pendientes = 0) {
  return { pendientes, ultimoResumen: null, sincronizar: vi.fn(async () => {}) }
}

function renderVista() {
  return render(<RecorridoView municipio="maipu" capas={null} limites={null} centro={CENTRO} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(recorridoEnCurso).mockResolvedValue(undefined)
  vi.mocked(useSincronizacion).mockReturnValue(sincronizacion())
})

describe('RecorridoView', () => {
  test('sin recorrido activo muestra el botón de iniciar', async () => {
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABADOR_INICIAL))

    renderVista()

    expect(await screen.findByRole('button', { name: /iniciar recorrido/i })).toBeInTheDocument()
    expect(screen.queryByTestId('mapa')).not.toBeInTheDocument()
  })

  test('ofrece continuar o finalizar un recorrido sin terminar', async () => {
    const retomar = vi.fn(async () => {})
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABADOR_INICIAL, { retomar }))
    vi.mocked(recorridoEnCurso).mockResolvedValue({
      id: 'abc',
      inicio: '2026-09-03T10:00:00.000Z',
      estado: 'en_curso',
      municipio: 'maipu',
      puntosGps: 4,
      km: 0.5,
    })

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /continuar/i }))

    expect(retomar).toHaveBeenCalledWith('abc')
    expect(screen.queryByRole('button', { name: /iniciar recorrido/i })).toBeInTheDocument()
  })

  test('grabando muestra el mapa, los km y el tiempo transcurrido', async () => {
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO))

    renderVista()

    expect(await screen.findByTestId('mapa')).toBeInTheDocument()
    expect(screen.getByText('km')).toBeInTheDocument()
    expect(screen.getByText(/1[.,]23/)).toBeInTheDocument()
    expect(screen.getByText('tiempo')).toBeInTheDocument()
    expect(screen.getByText(/^\d+:\d{2}(:\d{2})?$/)).toBeInTheDocument()
    expect(screen.getByText('7 m')).toBeInTheDocument()
  })

  test('el botón Observación abre el formulario', async () => {
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO))

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /^observación$/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/tipo/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar observación/i })).toBeInTheDocument()
  })

  test('finalizar cierra el recorrido y muestra el estado pendiente de subida', async () => {
    const finalizar = vi.fn(async () => GRABANDO.recorridoId)
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO, { finalizar }))
    vi.mocked(useSincronizacion).mockReturnValue(sincronizacion(1))

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    await waitFor(() => expect(finalizar).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/recorrido finalizado/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Pendiente de subir (sin conexión)')
  })
})

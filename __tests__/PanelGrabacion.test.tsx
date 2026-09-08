import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { PanelGrabacion, type EstadoPanelCamara, type EstadoPanelSensores } from '@/components/recorrido/PanelGrabacion'
import type { Grabador } from '@/lib/local/grabador'

vi.mock('next/dynamic', () => ({
  default: () => function MapaFalso() {
    return <div data-testid="mapa" />
  },
}))

const T0 = 1_700_000_000_000

const ESTADO: Grabador = {
  estado: 'grabando',
  recorridoId: '11111111-1111-4111-8111-111111111111',
  inicio: T0,
  fin: null,
  ultimo: { lat: -36.85, lng: -57.88, t: T0, precision: 7 },
  km: 1.23,
  cantidad: 5,
  cortes: [],
}

const SENSORES: EstadoPanelSensores = { estado: 'activo', impactos: 0, posiciones: [] }

function camara(extra: Partial<EstadoPanelCamara> = {}): EstadoPanelCamara {
  return {
    estado: 'inactiva',
    cuadros: 0,
    videoRef: createRef<HTMLVideoElement>(),
    onAlternar: vi.fn(),
    ...extra,
  }
}

function render_(extra: Partial<Parameters<typeof PanelGrabacion>[0]> = {}) {
  return render(
    <PanelGrabacion
      estado={ESTADO}
      precision={7}
      velocidadKmh={null}
      obtenerPuntos={() => []}
      centro={[-36.85, -57.88]}
      capas={null}
      error={null}
      sensores={SENSORES}
      camara={camara()}
      finalizando={false}
      onObservacion={vi.fn()}
      onPausar={vi.fn()}
      onReanudar={vi.fn()}
      onFinalizar={vi.fn()}
      {...extra}
    />,
  )
}

describe('PanelGrabacion', () => {
  test('muestra el mapa y las métricas', () => {
    render_()

    expect(screen.getByTestId('mapa')).toBeInTheDocument()
    expect(screen.getByText('km')).toBeInTheDocument()
    expect(screen.getByText(/1[.,]23/)).toBeInTheDocument()
  })

  test('grabando muestra los tres botones habilitados', async () => {
    const onPausar = vi.fn()
    const onObservacion = vi.fn()
    render_({ onPausar, onObservacion })

    await userEvent.click(screen.getByRole('button', { name: /^observación$/i }))
    expect(onObservacion).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: /^pausar$/i }))
    expect(onPausar).toHaveBeenCalledTimes(1)
  })

  test('pausado muestra Reanudar en vez de Pausar y el aviso de pausa', async () => {
    const onReanudar = vi.fn()
    render_({ estado: { ...ESTADO, estado: 'pausado' }, onReanudar })

    expect(screen.getByText(/en pausa/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^reanudar$/i }))
    expect(onReanudar).toHaveBeenCalledTimes(1)
  })

  test('finalizando deshabilita el botón Finalizar y muestra el estado de carga', () => {
    render_({ finalizando: true })

    const boton = screen.getByRole('button', { name: /procesando/i })
    expect(boton).toBeDisabled()
    expect(boton).toHaveAttribute('aria-busy', 'true')
  })

  test('tocar Finalizar pide confirmación antes de disparar onFinalizar', async () => {
    const onFinalizar = vi.fn()
    render_({ onFinalizar })

    const boton = screen.getByRole('button', { name: /^finalizar$/i })
    expect(boton).not.toBeDisabled()
    await userEvent.click(boton)

    expect(onFinalizar).not.toHaveBeenCalled()
    expect(screen.getByText(/¿finalizar el recorrido\?/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /sí, finalizar/i }))
    expect(onFinalizar).toHaveBeenCalledTimes(1)
  })

  test('se puede cancelar la confirmación de Finalizar y seguir grabando', async () => {
    const onFinalizar = vi.fn()
    render_({ onFinalizar })

    await userEvent.click(screen.getByRole('button', { name: /^finalizar$/i }))
    await userEvent.click(screen.getByRole('button', { name: /seguir grabando/i }))

    expect(onFinalizar).not.toHaveBeenCalled()
    expect(screen.queryByText(/¿finalizar el recorrido\?/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^finalizar$/i })).toBeInTheDocument()
  })

  test('un error se muestra en un rol alert', () => {
    render_({ error: 'No se pudo guardar el punto.' })

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar el punto.')
  })
})

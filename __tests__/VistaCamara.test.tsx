import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { VistaCamara } from '@/components/recorrido/VistaCamara'
import type { EstadoCamara } from '@/hooks/useCamara'

function renderVista(estado: EstadoCamara, cuadros = 0, onAlternar = vi.fn()) {
  const videoRef = createRef<HTMLVideoElement>()
  render(
    <VistaCamara estado={estado} cuadros={cuadros} videoRef={videoRef} onAlternar={onAlternar} />,
  )
  return { onAlternar }
}

describe('VistaCamara', () => {
  test('muestra la vista previa, el estado y el contador', () => {
    renderVista('activa', 12)

    expect(screen.getByTestId('video-camara')).toBeInTheDocument()
    expect(screen.getByText('Cámara activa')).toBeInTheDocument()
    expect(screen.getByLabelText('cuadros capturados')).toHaveTextContent('12 cuadro(s)')
  })

  test('el botón refleja si la cámara está prendida', async () => {
    const { onAlternar } = renderVista('activa')
    const boton = screen.getByRole('button', { name: /cámara/i })

    expect(boton).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(boton)
    expect(onAlternar).toHaveBeenCalledTimes(1)
  })

  test('apagada queda sin presionar y lo avisa', () => {
    renderVista('inactiva')

    expect(screen.getByRole('button', { name: /cámara/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Cámara apagada')).toBeInTheDocument()
  })

  test('explica por qué no hay cámara y no deja prenderla si no existe', () => {
    renderVista('sin_permiso')
    expect(screen.getByText('Sin permiso de cámara')).toBeInTheDocument()

    renderVista('no_disponible')
    expect(screen.getByText('Este dispositivo no tiene cámara')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /cámara/i })[1]).toBeDisabled()
  })

  test('avisa cuando el dispositivo se quedó sin espacio', () => {
    renderVista('sin_espacio', 300)

    expect(screen.getByText(/sin espacio/i)).toBeInTheDocument()
    expect(screen.getByLabelText('cuadros capturados')).toHaveTextContent('300 cuadro(s)')
  })
})

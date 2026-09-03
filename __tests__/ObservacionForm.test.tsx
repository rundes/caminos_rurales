import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ObservacionForm } from '@/components/recorrido/ObservacionForm'

const POSICION = { lat: -36.85, lng: -57.88 }

function archivo(nombre: string, tipo: string, bytes = 10): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ObservacionForm', () => {
  test('rechaza un video de más de 15 segundos con un mensaje', async () => {
    const medirDuracion = vi.fn().mockResolvedValue(20)
    const onGuardar = vi.fn()
    render(
      <ObservacionForm
        posicion={POSICION}
        onGuardar={onGuardar}
        onCancelar={vi.fn()}
        medirDuracion={medirDuracion}
      />,
    )

    await userEvent.upload(screen.getByLabelText(/foto o video/i), archivo('clip.mp4', 'video/mp4'))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('El video no puede durar más de 15 segundos.')
    expect(medirDuracion).toHaveBeenCalledTimes(1)
  })

  test('acepta un video corto', async () => {
    const medirDuracion = vi.fn().mockResolvedValue(8)
    render(
      <ObservacionForm
        posicion={POSICION}
        onGuardar={vi.fn()}
        onCancelar={vi.fn()}
        medirDuracion={medirDuracion}
      />,
    )

    await userEvent.upload(screen.getByLabelText(/foto o video/i), archivo('clip.mp4', 'video/mp4'))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('acepta una imagen sin medir duración y la manda al guardar', async () => {
    const medirDuracion = vi.fn()
    const onGuardar = vi.fn()
    render(
      <ObservacionForm
        posicion={POSICION}
        onGuardar={onGuardar}
        onCancelar={vi.fn()}
        medirDuracion={medirDuracion}
      />,
    )

    const foto = archivo('foto.jpg', 'image/jpeg')
    await userEvent.upload(screen.getByLabelText(/foto o video/i), foto)
    await userEvent.selectOptions(screen.getByLabelText(/tipo/i), 'carcava')
    await userEvent.click(screen.getByRole('button', { name: /alta/i }))
    await userEvent.type(screen.getByLabelText(/nota/i), 'Zanja profunda')
    await userEvent.click(screen.getByRole('button', { name: /guardar observación/i }))

    expect(medirDuracion).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onGuardar).toHaveBeenCalledWith({
      tipo_falla: 'carcava',
      severidad: 'alta',
      descripcion: 'Zanja profunda',
      archivo: foto,
    })
  })

  test('sin posición no guarda y avisa', async () => {
    const onGuardar = vi.fn()
    render(<ObservacionForm posicion={null} onGuardar={onGuardar} onCancelar={vi.fn()} medirDuracion={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /guardar observación/i }))

    expect(onGuardar).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('Todavía no tenemos tu ubicación')
  })
})

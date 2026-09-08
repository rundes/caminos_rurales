import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { OcultarSiGrabando } from '@/components/OcultarSiGrabando'
import { fijarEstadoGrabacion } from '@/lib/local/estado-grabacion'

afterEach(() => {
  fijarEstadoGrabacion('inactivo')
})

describe('OcultarSiGrabando', () => {
  test('sin grabación muestra el contenido', () => {
    render(
      <OcultarSiGrabando>
        <p>Cromo del dashboard</p>
      </OcultarSiGrabando>,
    )

    expect(screen.getByText('Cromo del dashboard')).toBeInTheDocument()
  })

  test('grabando oculta el contenido', () => {
    act(() => fijarEstadoGrabacion('grabando'))
    render(
      <OcultarSiGrabando>
        <p>Cromo del dashboard</p>
      </OcultarSiGrabando>,
    )

    expect(screen.queryByText('Cromo del dashboard')).not.toBeInTheDocument()
  })

  test('pausado también lo oculta', () => {
    act(() => fijarEstadoGrabacion('pausado'))
    render(
      <OcultarSiGrabando>
        <p>Cromo del dashboard</p>
      </OcultarSiGrabando>,
    )

    expect(screen.queryByText('Cromo del dashboard')).not.toBeInTheDocument()
  })

  test('vuelve a mostrarse cuando la grabación termina', () => {
    act(() => fijarEstadoGrabacion('grabando'))
    render(
      <OcultarSiGrabando>
        <p>Cromo del dashboard</p>
      </OcultarSiGrabando>,
    )
    expect(screen.queryByText('Cromo del dashboard')).not.toBeInTheDocument()

    act(() => fijarEstadoGrabacion('inactivo'))

    expect(screen.getByText('Cromo del dashboard')).toBeInTheDocument()
  })
})

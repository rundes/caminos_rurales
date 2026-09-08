import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { NavDashboard } from '@/components/NavDashboard'
import { fijarEstadoGrabacion } from '@/lib/local/estado-grabacion'

afterEach(() => {
  fijarEstadoGrabacion('inactivo')
})

describe('NavDashboard', () => {
  test('sin grabación muestra los enlaces habituales', () => {
    render(<NavDashboard />)

    expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Caminos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mapa' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Obs.' })).toHaveAttribute('href', '/dashboard/observaciones')
    expect(screen.getByRole('link', { name: 'Ranking' })).toBeInTheDocument()
    expect(screen.queryByText(/grabando/i)).not.toBeInTheDocument()
  })

  test('grabando reemplaza los enlaces por el aviso de volver al recorrido', () => {
    act(() => fijarEstadoGrabacion('grabando'))
    render(<NavDashboard />)

    expect(screen.getByText(/grabando.*volvé al recorrido/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Mapa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Caminos' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /volvé al recorrido/i })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  })

  test('pausado también bloquea la nav', () => {
    act(() => fijarEstadoGrabacion('pausado'))
    render(<NavDashboard />)

    expect(screen.getByText(/grabando.*volvé al recorrido/i)).toBeInTheDocument()
  })

  test('vuelve a mostrar los enlaces cuando la grabación termina', () => {
    act(() => fijarEstadoGrabacion('grabando'))
    render(<NavDashboard />)
    expect(screen.queryByRole('link', { name: 'Mapa' })).not.toBeInTheDocument()

    act(() => fijarEstadoGrabacion('inactivo'))

    expect(screen.getByRole('link', { name: 'Mapa' })).toBeInTheDocument()
  })
})

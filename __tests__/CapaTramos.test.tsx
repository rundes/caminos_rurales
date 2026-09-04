import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

vi.mock('react-leaflet', () => ({
  Polyline: ({ children, pathOptions }: { children?: React.ReactNode; pathOptions?: { color?: string } }) => (
    <div data-testid="polyline" data-color={pathOptions?.color}>
      {children}
    </div>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <div data-testid="tooltip">{children}</div>,
}))

const { CapaTramos } = await import('@/components/CapaTramos')

const TRAMOS = [
  {
    id: 't1',
    nombre_codigo: 'Camino 1',
    geometria: [
      [-60.1, -36.6],
      [-60.2, -36.7],
    ] as [number, number][],
    veces: 2,
  },
]

test('modo cobertura: el tooltip incluye "· 3 cuadros" cuando cuadrosPorTramo trae ese conteo', () => {
  render(<CapaTramos tramos={TRAMOS} modo="cobertura" cuadrosPorTramo={{ t1: 3 }} />)

  expect(screen.getByText('Camino 1 · cubierto 2 veces · 3 cuadros')).toBeInTheDocument()
})

test('modo cobertura: sin cuadrosPorTramo no agrega el sufijo de cuadros', () => {
  render(<CapaTramos tramos={TRAMOS} modo="cobertura" />)

  expect(screen.getByText('Camino 1 · cubierto 2 veces')).toBeInTheDocument()
  expect(screen.queryByText(/cuadros/)).not.toBeInTheDocument()
})

test('modo estado: el tooltip incluye "· 3 cuadros" cuando cuadrosPorTramo trae ese conteo', () => {
  render(<CapaTramos tramos={TRAMOS} modo="estado" cuadrosPorTramo={{ t1: 3 }} />)

  expect(screen.getByText(/Camino 1 · Estado: .* · 3 cuadros$/)).toBeInTheDocument()
})

test('modo estado: sin cuadrosPorTramo no agrega el sufijo de cuadros', () => {
  render(<CapaTramos tramos={TRAMOS} modo="estado" />)

  const tooltip = screen.getByTestId('tooltip')
  expect(tooltip.textContent).not.toContain('cuadros')
})

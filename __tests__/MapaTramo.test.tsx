import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

const fitBounds = vi.fn()
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({
    children,
    radius,
    pathOptions,
  }: {
    children?: React.ReactNode
    radius?: number
    pathOptions?: { color?: string }
  }) => (
    <div data-testid="circle-marker" data-radius={radius} data-color={pathOptions?.color}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Polyline: ({ pathOptions }: { pathOptions?: { color?: string; weight?: number } }) => (
    <div data-testid="polyline" data-color={pathOptions?.color} data-weight={pathOptions?.weight} />
  ),
  useMap: () => ({ fitBounds }),
}))

const { MapaTramo } = await import('@/components/MapaTramo')

const GEOMETRIA: [number, number][] = [
  [-60.1, -36.6],
  [-60.11, -36.61],
]

test('dibuja la polyline del tramo con el color de su calidad estimada', () => {
  render(<MapaTramo geometria={GEOMETRIA} calidad="malo" observaciones={[]} />)
  expect(screen.getByTestId('polyline')).toHaveAttribute('data-color', '#f97316')
})

test('sin geometría no dibuja polyline ni encuadra', () => {
  render(<MapaTramo geometria={[]} calidad="sin_dato" observaciones={[]} />)
  expect(screen.queryByTestId('polyline')).not.toBeInTheDocument()
})

test('dibuja un marcador por observación con el color de su severidad', () => {
  render(
    <MapaTramo
      geometria={GEOMETRIA}
      calidad="bueno"
      observaciones={[{ id: 'o1', latitud: -36.6, longitud: -60.1, tipo_falla: 'bache', severidad: 'alta' }]}
    />,
  )
  expect(screen.getByTestId('circle-marker')).toHaveAttribute('data-color', '#dc2626')
  expect(screen.getByText(/Bache · Alta/)).toBeInTheDocument()
})

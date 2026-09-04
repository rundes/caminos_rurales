import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  LayersControl: Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
    BaseLayer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  }),
  CircleMarker: ({ children }: { children?: React.ReactNode }) => <div data-testid="circle-marker">{children}</div>,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Polyline: ({ children, pathOptions }: { children?: React.ReactNode; pathOptions?: { color?: string } }) => (
    <div data-testid="polyline" data-color={pathOptions?.color}>
      {children}
    </div>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <div data-testid="tooltip">{children}</div>,
  useMap: () => ({ fitBounds: vi.fn() }),
}))

vi.mock('@/components/CapasMunicipio', () => ({ CapasMunicipio: () => null }))

const { MapaRelevamiento } = await import('@/components/MapaRelevamiento')

test('renderiza los tramos cubiertos en verde y los pendientes en gris con su tooltip', () => {
  render(
    <MapaRelevamiento
      puntos={[]}
      centro={[-36.6, -60.0]}
      urlsEvidencia={{}}
      tramos={[
        { id: 't1', nombre_codigo: 'Camino 1', geometria: [[-60.1, -36.6], [-60.2, -36.7]], veces: 2 },
        { id: 't2', nombre_codigo: 'Camino 2', geometria: [[-60.3, -36.8], [-60.4, -36.9]], veces: 0 },
      ]}
    />,
  )

  const polylines = screen.getAllByTestId('polyline')
  expect(polylines).toHaveLength(2)
  expect(polylines[0]).toHaveAttribute('data-color', '#16a34a')
  expect(polylines[1]).toHaveAttribute('data-color', '#9ca3af')
  expect(screen.getByText('Camino 1 · cubierto 2 veces')).toBeInTheDocument()
  expect(screen.getByText('Camino 2 · pendiente')).toBeInTheDocument()
})

test('sin tramos no renderiza polilíneas', () => {
  render(<MapaRelevamiento puntos={[]} centro={[-36.6, -60.0]} urlsEvidencia={{}} />)
  expect(screen.queryByTestId('polyline')).not.toBeInTheDocument()
})

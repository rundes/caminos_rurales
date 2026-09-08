import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

let manejadorClick: ((evento: { latlng: { lat: number; lng: number } }) => void) | undefined
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ center }: { center: [number, number] }) => (
    <div data-testid="circle-marker" data-lat={center[0]} data-lng={center[1]} />
  ),
  Polyline: ({ positions }: { positions: [number, number][] }) => (
    <div data-testid="polyline" data-cantidad={positions.length} />
  ),
  useMapEvents: (handlers: { click: (evento: { latlng: { lat: number; lng: number } }) => void }) => {
    manejadorClick = handlers.click
    return null
  },
}))

const { MapaDibujarTramo } = await import('@/components/MapaDibujarTramo')

const CENTRO: [number, number] = [-36.88, -57.58]

test('sin puntos no dibuja polyline, pero sí escucha clicks', () => {
  const onAgregarPunto = vi.fn()
  render(<MapaDibujarTramo puntos={[]} onAgregarPunto={onAgregarPunto} centro={CENTRO} />)

  expect(screen.queryByTestId('polyline')).not.toBeInTheDocument()
  expect(manejadorClick).toBeInstanceOf(Function)
})

test('un click en el mapa llama a onAgregarPunto con la coordenada clickeada', () => {
  const onAgregarPunto = vi.fn()
  render(<MapaDibujarTramo puntos={[]} onAgregarPunto={onAgregarPunto} centro={CENTRO} />)

  manejadorClick?.({ latlng: { lat: -36.99, lng: -57.9 } })

  expect(onAgregarPunto).toHaveBeenCalledWith({ lat: -36.99, lng: -57.9 })
})

test('dibuja un marcador por punto y la polyline cuando hay 2 o más', () => {
  const puntos = [
    { lat: -36.99, lng: -57.9 },
    { lat: -36.98, lng: -57.89 },
  ]
  render(<MapaDibujarTramo puntos={puntos} onAgregarPunto={vi.fn()} centro={CENTRO} />)

  expect(screen.getAllByTestId('circle-marker')).toHaveLength(2)
  expect(screen.getByTestId('polyline')).toHaveAttribute('data-cantidad', '2')
})

test('con un solo punto dibuja el marcador pero no la polyline', () => {
  render(<MapaDibujarTramo puntos={[{ lat: -36.99, lng: -57.9 }]} onAgregarPunto={vi.fn()} centro={CENTRO} />)

  expect(screen.getAllByTestId('circle-marker')).toHaveLength(1)
  expect(screen.queryByTestId('polyline')).not.toBeInTheDocument()
})

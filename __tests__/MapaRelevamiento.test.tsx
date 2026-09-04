import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  LayersControl: Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
    BaseLayer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  }),
  CircleMarker: ({
    children,
    radius,
    pathOptions,
  }: {
    children?: React.ReactNode
    radius?: number
    pathOptions?: { dashArray?: string }
  }) => (
    <div data-testid="circle-marker" data-radius={radius} data-dash={pathOptions?.dashArray ?? ''}>
      {children}
    </div>
  ),
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

const TRAMOS = [
  { id: 't1', nombre_codigo: 'Camino 1', geometria: [[-60.1, -36.6], [-60.2, -36.7]] as [number, number][], veces: 2 },
  { id: 't2', nombre_codigo: 'Camino 2', geometria: [[-60.3, -36.8], [-60.4, -36.9]] as [number, number][], veces: 0 },
]

const RUGOSIDAD = {
  t1: { calidad: 'malo' as const, rms: 2.7, velocidad: 32.4, impactos: 3, segmentos: 8 },
  // t2 sin entrada -> sin_dato
}

test('el toggle arranca en "Cobertura" y cambia a colores de estado estimado al tocar "Estado estimado"', () => {
  render(
    <MapaRelevamiento puntos={[]} centro={[-36.6, -60.0]} urlsEvidencia={{}} tramos={TRAMOS} rugosidad={RUGOSIDAD} />,
  )

  const botonCobertura = screen.getByRole('button', { name: 'Cobertura' })
  const botonEstado = screen.getByRole('button', { name: 'Estado estimado' })
  expect(botonCobertura).toHaveAttribute('aria-pressed', 'true')
  expect(botonEstado).toHaveAttribute('aria-pressed', 'false')

  let polylines = screen.getAllByTestId('polyline')
  expect(polylines[0]).toHaveAttribute('data-color', '#16a34a') // cubierto
  expect(polylines[1]).toHaveAttribute('data-color', '#9ca3af') // pendiente

  fireEvent.click(botonEstado)

  expect(botonEstado).toHaveAttribute('aria-pressed', 'true')
  expect(botonCobertura).toHaveAttribute('aria-pressed', 'false')

  polylines = screen.getAllByTestId('polyline')
  expect(polylines[0]).toHaveAttribute('data-color', '#f97316') // malo
  expect(polylines[1]).toHaveAttribute('data-color', '#9ca3af') // sin_dato

  fireEvent.click(botonCobertura)
  polylines = screen.getAllByTestId('polyline')
  expect(polylines[0]).toHaveAttribute('data-color', '#16a34a')
})

test('en modo estado, el tooltip incluye calidad, rugosidad, velocidad e impactos', () => {
  render(
    <MapaRelevamiento puntos={[]} centro={[-36.6, -60.0]} urlsEvidencia={{}} tramos={TRAMOS} rugosidad={RUGOSIDAD} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Estado estimado' }))
  expect(
    screen.getByText('Camino 1 · Estado: Malo · rugosidad 2.7 m/s² · 32.4 km/h · 3 impactos (8 seg.)'),
  ).toBeInTheDocument()
})

const PUNTO_SENSOR = {
  id: 'f1',
  tipo_falla: 'bache' as const,
  severidad: 'media' as const,
  latitud: -36.6,
  longitud: -60.1,
  fecha: '2026-09-01T00:00:00Z',
  url_evidencia_imagen: null,
  url_evidencia_video: null,
  municipio: 'maipu',
  origen: 'sensor' as const,
  magnitud: 8.2,
}

const PUNTO_MANUAL = { ...PUNTO_SENSOR, id: 'f2', origen: 'manual' as const, magnitud: null }

const CUADRO_EJEMPLO = {
  id: 'c1',
  recorrido_id: 'r1',
  tramo_id: 't1',
  t: '2026-09-01T10:00:00Z',
  lat: -36.6,
  lng: -60.1,
  rumbo: 90,
  velocidadKmh: 20,
  ruta: 'u1/r1/cuadros/1.jpg',
}

test('el botón "Cuadros" arranca apagado y, al activarse, muestra la capa de cuadros', () => {
  render(
    <MapaRelevamiento
      puntos={[]}
      centro={[-36.6, -60.0]}
      urlsEvidencia={{}}
      cuadros={[CUADRO_EJEMPLO]}
      urlsCuadros={{}}
    />,
  )

  const boton = screen.getByRole('button', { name: 'Cuadros' })
  expect(boton).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByTestId('circle-marker')).not.toBeInTheDocument()

  fireEvent.click(boton)

  expect(boton).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByTestId('circle-marker').length).toBeGreaterThan(0)
})

test('el toggle "Cuadros" es independiente del modo Cobertura/Estado', () => {
  render(
    <MapaRelevamiento
      puntos={[]}
      centro={[-36.6, -60.0]}
      urlsEvidencia={{}}
      tramos={TRAMOS}
      cuadros={[CUADRO_EJEMPLO]}
      urlsCuadros={{}}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Cuadros' }))
  fireEvent.click(screen.getByRole('button', { name: 'Estado estimado' }))

  expect(screen.getByRole('button', { name: 'Cuadros' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Estado estimado' })).toHaveAttribute('aria-pressed', 'true')
})

test('las observaciones origen sensor tienen contorno punteado, radio distinto y aviso en el popup', () => {
  render(<MapaRelevamiento puntos={[PUNTO_SENSOR, PUNTO_MANUAL]} centro={[-36.6, -60.0]} urlsEvidencia={{}} />)

  const marcadores = screen.getAllByTestId('circle-marker')
  expect(marcadores[0]).toHaveAttribute('data-dash', '3 3')
  expect(marcadores[0]).toHaveAttribute('data-radius', '7')
  expect(marcadores[1]).toHaveAttribute('data-dash', '')
  expect(marcadores[1]).toHaveAttribute('data-radius', '9')
  expect(marcadores[0].textContent).toContain('Detectada por sensores (pico 8.2 m/s²)')
  expect(marcadores[1].textContent).not.toContain('Detectada por sensores')
})

import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { Cuadro } from '@/lib/cuadros'
import { ZONA_HORARIA } from '@/lib/fechas'

const llamadasAbrirPopup: number[] = []

vi.mock('react-leaflet', () => ({
  CircleMarker: ({
    children,
    radius,
    pathOptions,
    center,
    ref,
  }: {
    children?: React.ReactNode
    radius?: number
    pathOptions?: { color?: string; fillColor?: string }
    center?: [number, number]
    ref?: (instancia: { openPopup: () => void } | null) => void
  }) => {
    if (typeof ref === 'function') {
      ref({ openPopup: () => llamadasAbrirPopup.push(center?.[0] ?? -1) })
    }
    return (
      <div data-testid="circle-marker" data-radius={radius} data-color={pathOptions?.color} data-lat={center?.[0]}>
        {children}
      </div>
    )
  },
  Popup: ({ children }: { children?: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <div data-testid="tooltip">{children}</div>,
}))

const { CapaCuadros } = await import('@/components/CapaCuadros')

const CUADROS: Cuadro[] = [
  {
    id: 'c1',
    recorrido_id: 'r1',
    tramo_id: 't1',
    t: '2026-09-01T10:00:00Z',
    lat: -36.6,
    lng: -60.1,
    rumbo: 90,
    velocidadKmh: 20,
    ruta: 'u1/r1/cuadros/1.jpg',
  },
  {
    id: 'c2',
    recorrido_id: 'r1',
    tramo_id: 't1',
    t: '2026-09-01T10:00:10Z',
    lat: -36.61,
    lng: -60.11,
    rumbo: 91,
    velocidadKmh: 22,
    ruta: 'https://cdn.example.com/img2.jpg',
  },
]

test('renderiza un marcador circular por cuadro, radio 5 y color azul', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{}} />)

  const marcadores = screen.getAllByTestId('circle-marker')
  expect(marcadores).toHaveLength(2)
  expect(marcadores[0]).toHaveAttribute('data-radius', '5')
  expect(marcadores[0]).toHaveAttribute('data-color', '#2563eb')
})

test('el tooltip muestra el ícono de cámara y la hora', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{}} />)

  const tooltips = screen.getAllByTestId('tooltip')
  expect(tooltips[0].textContent).toContain('📷')
})

test('el popup usa la URL firmada para rutas de storage y la ruta directa cuando ya es https', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{ 'u1/r1/cuadros/1.jpg': 'https://firmada.example.com/1.jpg' }} />)

  const imagenes = screen.getAllByRole('img') as HTMLImageElement[]
  expect(imagenes[0]).toHaveAttribute('src', 'https://firmada.example.com/1.jpg')
  expect(imagenes[0]).toHaveAttribute('loading', 'lazy')
  expect(imagenes[0]).toHaveAttribute('width', '240')
  expect(imagenes[1]).toHaveAttribute('src', 'https://cdn.example.com/img2.jpg')
})

test('sin URL firmada disponible, no renderiza imagen para esa ruta', () => {
  render(<CapaCuadros cuadros={[CUADROS[0]]} urls={{}} />)

  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('deshabilita "Anterior" en el primer cuadro del tramo y "Siguiente" en el último', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{}} />)

  const anteriores = screen.getAllByRole('button', { name: 'Anterior' })
  const siguientes = screen.getAllByRole('button', { name: 'Siguiente' })
  expect(anteriores[0]).toBeDisabled()
  expect(siguientes[0]).not.toBeDisabled()
  expect(anteriores[1]).not.toBeDisabled()
  expect(siguientes[1]).toBeDisabled()
})

test('"Siguiente" abre el popup del cuadro siguiente dentro del mismo tramo', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{}} />)

  const [siguienteDeC1] = screen.getAllByRole('button', { name: 'Siguiente' })
  fireEvent.click(siguienteDeC1)

  expect(llamadasAbrirPopup).toContain(CUADROS[1].lat)
})

test('"Anterior" abre el popup del cuadro anterior dentro del mismo tramo', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{}} />)

  const [, anteriorDeC2] = screen.getAllByRole('button', { name: 'Anterior' })
  fireEvent.click(anteriorDeC2)

  expect(llamadasAbrirPopup).toContain(CUADROS[0].lat)
})

test('el popup muestra fecha/hora, velocidad y tramo', () => {
  render(<CapaCuadros cuadros={[CUADROS[0]]} urls={{}} />)

  const popup = screen.getByTestId('popup')
  const fechaEsperada = new Date(CUADROS[0].t).toLocaleString('es-AR', { timeZone: ZONA_HORARIA })
  expect(popup.textContent).toContain(fechaEsperada)
  expect(popup.textContent).toContain('Velocidad: 20 km/h')
  expect(popup.textContent).toContain('Tramo: t1')
})

test('sin velocidad (null), el popup omite la línea de velocidad', () => {
  const cuadroSinVelocidad = { ...CUADROS[0], velocidadKmh: null }
  render(<CapaCuadros cuadros={[cuadroSinVelocidad]} urls={{}} />)

  const popup = screen.getByTestId('popup')
  expect(popup.textContent).not.toContain('Velocidad')
})

test('sin tramo (null), el popup muestra "sin tramo"', () => {
  const cuadroSinTramo = { ...CUADROS[0], tramo_id: null }
  render(<CapaCuadros cuadros={[cuadroSinTramo]} urls={{}} />)

  const popup = screen.getByTestId('popup')
  expect(popup.textContent).toContain('Tramo: sin tramo')
})

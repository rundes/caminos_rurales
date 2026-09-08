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
    eventHandlers,
  }: {
    children?: React.ReactNode
    radius?: number
    pathOptions?: { color?: string; fillColor?: string }
    center?: [number, number]
    ref?: (instancia: { openPopup: () => void } | null) => void
    eventHandlers?: { popupopen?: () => void }
  }) => {
    if (typeof ref === 'function') {
      // El `ref` imita el layer real de Leaflet: `openPopup()` dispara el
      // mismo evento `popupopen` que un click, tanto en el mock como en la
      // implementación real.
      ref({
        openPopup: () => {
          llamadasAbrirPopup.push(center?.[0] ?? -1)
          eventHandlers?.popupopen?.()
        },
      })
    }
    return (
      <div
        data-testid="circle-marker"
        data-radius={radius}
        data-color={pathOptions?.color}
        data-lat={center?.[0]}
        // Solo dispara si el click fue directo sobre este div (el
        // "marcador"), no uno que burbujeó desde un botón del popup
        // (Anterior/Siguiente, hijo suyo en el DOM simplificado del mock):
        // en el Leaflet real el popup no cuelga del DOM del marcador, así
        // que un click ahí nunca reabre el marcador que lo contiene.
        onClick={(e) => {
          if (e.target === e.currentTarget) eventHandlers?.popupopen?.()
        }}
      >
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

test('sin seleccionar ningún marcador, el popup no monta la imagen ni el resto del contenido', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{ 'u1/r1/cuadros/1.jpg': 'https://firmada.example.com/1.jpg' }} />)

  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument()
  expect(screen.getAllByText('Cargando…')).toHaveLength(2)
})

test('al seleccionar un marcador (click), su popup monta la imagen usando la URL firmada', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{ 'u1/r1/cuadros/1.jpg': 'https://firmada.example.com/1.jpg' }} />)

  fireEvent.click(screen.getAllByTestId('circle-marker')[0])

  const imagenes = screen.getAllByRole('img') as HTMLImageElement[]
  expect(imagenes).toHaveLength(1)
  expect(imagenes[0]).toHaveAttribute('src', 'https://firmada.example.com/1.jpg')
  expect(imagenes[0]).toHaveAttribute('loading', 'lazy')
  expect(imagenes[0]).toHaveAttribute('width', '240')
})

test('al seleccionar el marcador con ruta directa (https), usa esa ruta tal cual', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{}} />)

  fireEvent.click(screen.getAllByTestId('circle-marker')[1])

  const [imagen] = screen.getAllByRole('img') as HTMLImageElement[]
  expect(imagen).toHaveAttribute('src', 'https://cdn.example.com/img2.jpg')
})

test('sin URL firmada disponible, el marcador seleccionado no renderiza imagen', () => {
  render(<CapaCuadros cuadros={[CUADROS[0]]} urls={{}} />)

  fireEvent.click(screen.getByTestId('circle-marker'))

  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('deshabilita "Anterior" en el primer cuadro del tramo y "Siguiente" en el último', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{}} />)

  const marcadores = screen.getAllByTestId('circle-marker')

  fireEvent.click(marcadores[0])
  expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Siguiente' })).not.toBeDisabled()

  fireEvent.click(marcadores[1])
  expect(screen.getByRole('button', { name: 'Anterior' })).not.toBeDisabled()
  expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
})

test('"Siguiente" abre el popup del cuadro siguiente dentro del mismo tramo', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{}} />)

  fireEvent.click(screen.getAllByTestId('circle-marker')[0])
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

  expect(llamadasAbrirPopup).toContain(CUADROS[1].lat)
  // El popup pasa a mostrar el contenido del cuadro siguiente (c2, sin tramo_id distinto acá, pero con su propio "Anterior" habilitado).
  expect(screen.getByRole('button', { name: 'Anterior' })).not.toBeDisabled()
})

test('"Anterior" abre el popup del cuadro anterior dentro del mismo tramo', () => {
  render(<CapaCuadros cuadros={CUADROS} urls={{}} />)

  fireEvent.click(screen.getAllByTestId('circle-marker')[1])
  fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))

  expect(llamadasAbrirPopup).toContain(CUADROS[0].lat)
})

test('el popup del marcador seleccionado muestra fecha/hora, velocidad y tramo', () => {
  render(<CapaCuadros cuadros={[CUADROS[0]]} urls={{}} />)

  fireEvent.click(screen.getByTestId('circle-marker'))

  const popup = screen.getByTestId('popup')
  const fechaEsperada = new Date(CUADROS[0].t).toLocaleString('es-AR', { timeZone: ZONA_HORARIA })
  expect(popup.textContent).toContain(fechaEsperada)
  expect(popup.textContent).toContain('Velocidad: 20 km/h')
  expect(popup.textContent).toContain('Tramo: t1')
})

test('sin velocidad (null), el popup del marcador seleccionado omite la línea de velocidad', () => {
  const cuadroSinVelocidad = { ...CUADROS[0], velocidadKmh: null }
  render(<CapaCuadros cuadros={[cuadroSinVelocidad]} urls={{}} />)

  fireEvent.click(screen.getByTestId('circle-marker'))

  const popup = screen.getByTestId('popup')
  expect(popup.textContent).not.toContain('Velocidad')
})

test('sin tramo (null), el popup del marcador seleccionado muestra "sin tramo"', () => {
  const cuadroSinTramo = { ...CUADROS[0], tramo_id: null }
  render(<CapaCuadros cuadros={[cuadroSinTramo]} urls={{}} />)

  fireEvent.click(screen.getByTestId('circle-marker'))

  const popup = screen.getByTestId('popup')
  expect(popup.textContent).toContain('Tramo: sin tramo')
})

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('react-leaflet', () => ({
  GeoJSON: (p: { data?: { features?: unknown[] } }) => (
    <div data-testid="geojson" data-key={String(p.data?.features?.length)} />
  ),
  CircleMarker: () => null,
  Tooltip: () => null,
}))

vi.mock('leaflet', () => ({ default: { circleMarker: vi.fn() } }))

const { CapasMunicipio } = await import('@/components/CapasMunicipio')

const CAMINOS_URL_1 = '/capas/test/caminos.geojson'
const CAMINOS_URL_2 = '/capas/test/caminos-2.geojson'
const LOCALIDADES_URL = '/capas/test/localidades.geojson'

const COLECCION_CAMINOS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Camino A' }, geometry: { type: 'LineString', coordinates: [] } },
    { type: 'Feature', properties: { name: 'Camino B' }, geometry: { type: 'LineString', coordinates: [] } },
  ],
}

function respuestaOk(cuerpo: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) } as Response)
}

describe('CapasMunicipio', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  test('renderiza los caminos tras la carga y loguea el fallo de localidades sin romper', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === CAMINOS_URL_1) return respuestaOk(COLECCION_CAMINOS)
      if (url === LOCALIDADES_URL) return Promise.reject(new Error('fallo de red'))
      return Promise.reject(new Error(`url inesperada: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CapasMunicipio capas={{ caminos: CAMINOS_URL_1, localidades: LOCALIDADES_URL }} />)

    const geojson = await screen.findByTestId('geojson')
    expect(geojson).toHaveAttribute('data-key', String(COLECCION_CAMINOS.features.length))
    expect(errorSpy).toHaveBeenCalledWith('[capas]', expect.anything())
  })

  test('al cambiar la url de caminos no se muestra la capa vieja mientras la nueva carga está pendiente', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === CAMINOS_URL_1) return respuestaOk(COLECCION_CAMINOS)
      if (url === CAMINOS_URL_2) return new Promise<Response>(() => {}) // nunca resuelve
      if (url === LOCALIDADES_URL) return Promise.reject(new Error('fallo de red'))
      return Promise.reject(new Error(`url inesperada: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(<CapasMunicipio capas={{ caminos: CAMINOS_URL_1, localidades: LOCALIDADES_URL }} />)
    await screen.findByTestId('geojson')

    rerender(<CapasMunicipio capas={{ caminos: CAMINOS_URL_2, localidades: LOCALIDADES_URL }} />)

    expect(screen.queryByTestId('geojson')).not.toBeInTheDocument()
  })
})

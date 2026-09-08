import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

const RESUMEN = [
  { id: 't1', nombre_codigo: 'CR-014 Camino a La Elisa', localidad: 'Maipú', km: 5, veces: 2, ultimaVisita: '2026-01-05T00:00:00Z', cuadros: 3 },
  { id: 't2', nombre_codigo: 'CR-002 Camino del Medio', localidad: 'Franklin', km: 12, veces: 0, ultimaVisita: null, cuadros: 0 },
]

let municipioMock: string | null = 'maipu'
let resumenMock: typeof RESUMEN = RESUMEN

const obtenerTramosResumenCacheado = vi.fn()
vi.mock('@/lib/tramos-consultas', () => ({
  obtenerTramosResumenCacheado: (...args: unknown[]) => obtenerTramosResumenCacheado(...args),
}))

const obtenerRugosidadTramos = vi.fn()
vi.mock('@/lib/cobertura-consultas', () => ({
  obtenerRugosidadTramos: (...args: unknown[]) => obtenerRugosidadTramos(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser: async () => ({ data: { user: municipioMock ? { id: 'u1' } : null } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { municipio_id: municipioMock }, error: null }) }) }),
    }),
  }),
}))

const { default: TramosPage } = await import('@/app/dashboard/tramos/page')

const SIN_FILTROS = Promise.resolve({})

afterEach(() => {
  municipioMock = 'maipu'
  resumenMock = RESUMEN
  vi.clearAllMocks()
})

describe('TramosPage', () => {
  test('lista los tramos con localidad, km, veces cubierto y última visita', async () => {
    obtenerTramosResumenCacheado.mockResolvedValue(resumenMock)
    obtenerRugosidadTramos.mockResolvedValue({})

    render(await TramosPage({ searchParams: SIN_FILTROS }))

    expect(screen.getByText('CR-014 Camino a La Elisa')).toBeInTheDocument()
    expect(screen.getByText(/Maipú · 5,0 km · cubierto 2 veces · 3 cuadros/)).toBeInTheDocument()
    expect(screen.getByText(/Última visita: sin visitas/)).toBeInTheDocument()
  })

  test('muestra el estado estimado por tramo', async () => {
    obtenerTramosResumenCacheado.mockResolvedValue(resumenMock)
    obtenerRugosidadTramos.mockResolvedValue({ t1: { calidad: 'malo', rms: 2, velocidad: 30, impactos: 1, segmentos: 3 } })

    render(await TramosPage({ searchParams: SIN_FILTROS }))

    expect(screen.getByText('Malo')).toBeInTheDocument()
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
  })

  test('cada fila enlaza al detalle del tramo', async () => {
    obtenerTramosResumenCacheado.mockResolvedValue(resumenMock)
    obtenerRugosidadTramos.mockResolvedValue({})

    render(await TramosPage({ searchParams: SIN_FILTROS }))

    expect(screen.getByRole('link', { name: /CR-014 Camino a La Elisa/ })).toHaveAttribute(
      'href',
      '/dashboard/tramos/t1',
    )
  })

  test('busca por nombre/código vía "q"', async () => {
    obtenerTramosResumenCacheado.mockResolvedValue(resumenMock)
    obtenerRugosidadTramos.mockResolvedValue({})

    render(await TramosPage({ searchParams: Promise.resolve({ q: 'elisa' }) }))

    expect(screen.getByText('CR-014 Camino a La Elisa')).toBeInTheDocument()
    expect(screen.queryByText('CR-002 Camino del Medio')).not.toBeInTheDocument()
  })

  test('ordena por km cuando orden=km', async () => {
    obtenerTramosResumenCacheado.mockResolvedValue(resumenMock)
    obtenerRugosidadTramos.mockResolvedValue({})

    render(await TramosPage({ searchParams: Promise.resolve({ orden: 'km' }) }))

    const nombres = screen.getAllByRole('link').map((el) => el.textContent ?? '')
    const filtrados = nombres.filter((t) => t.includes('CR-'))
    expect(filtrados[0]).toContain('CR-002 Camino del Medio') // 12 km > 5 km
  })

  test('sin municipio asignado muestra un aviso', async () => {
    municipioMock = null
    render(await TramosPage({ searchParams: SIN_FILTROS }))
    expect(screen.getByText(/no tiene un partido asignado/i)).toBeInTheDocument()
  })

  test('sin tramos muestra un mensaje vacío', async () => {
    obtenerTramosResumenCacheado.mockResolvedValue([])
    obtenerRugosidadTramos.mockResolvedValue({})

    render(await TramosPage({ searchParams: SIN_FILTROS }))

    expect(screen.getByText('No hay tramos para mostrar.')).toBeInTheDocument()
  })
})

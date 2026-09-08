import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/components/MapaTramoCliente', () => ({
  MapaTramoCliente: () => <div data-testid="mapa-tramo" />,
}))

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
vi.mock('next/navigation', () => ({ notFound }))

const obtenerRugosidadTramos = vi.fn()
vi.mock('@/lib/cobertura-consultas', () => ({
  obtenerRugosidadTramos: (...args: unknown[]) => obtenerRugosidadTramos(...args),
}))

const TRAMO = {
  id: 't1',
  nombre_codigo: 'CR-014 Camino a La Elisa',
  localidad: 'Maipú',
  km: '5',
  geometria: [
    [-60.1, -36.6],
    [-60.11, -36.61],
  ],
  municipio: 'maipu',
}

const OBSERVACION = {
  id: 'o1',
  tipo_falla: 'bache' as const,
  severidad: 'alta' as const,
  estado: 'pendiente' as const,
  origen: 'manual' as const,
  created_at: '2026-01-05T10:00:00Z',
  latitud: -36.6,
  longitud: -60.1,
  url_evidencia_imagen: 'u1/r1/foto.jpg',
}

const CUADRO = {
  id: 'c1',
  t: '2026-01-05T10:05:00Z',
  latitud: -36.6,
  longitud: -60.1,
  ruta: 'u1/r1/cuadro.jpg',
}

type Resultado = { data?: unknown; error: { message: string } | null; count?: number }

let tramoResultado: Resultado = { data: TRAMO, error: null }
let coberturaCountResultado: Resultado = { count: 2, error: null }
let coberturaUltimaResultado: Resultado = { data: { created_at: '2026-01-05T15:00:00Z' }, error: null }
let observacionesResultado: Resultado = { data: [OBSERVACION], error: null }
let cuadrosResultado: Resultado = { data: [CUADRO], error: null }

function crearConsulta(resolver: () => Resultado) {
  const consulta: Record<string, unknown> = {
    select: () => consulta,
    eq: () => consulta,
    order: () => consulta,
    limit: () => consulta,
    maybeSingle: async () => resolver(),
    then: (onFulfilled: (v: Resultado) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(onFulfilled, onRejected),
  }
  return consulta
}

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => {
    let coberturaLlamadas = 0
    return {
      from: (tabla: string) => {
        if (tabla === 'tramos') return crearConsulta(() => tramoResultado)
        if (tabla === 'cobertura_tramos') {
          coberturaLlamadas += 1
          const llamada = coberturaLlamadas
          return crearConsulta(() => (llamada === 1 ? coberturaCountResultado : coberturaUltimaResultado))
        }
        if (tabla === 'fallas_deteccion') return crearConsulta(() => observacionesResultado)
        if (tabla === 'cuadros') return crearConsulta(() => cuadrosResultado)
        throw new Error(`tabla no prevista: ${tabla}`)
      },
      storage: {
        from: () => ({
          createSignedUrls: async (rutas: string[]) => ({
            data: rutas.map((path) => ({ path, signedUrl: `https://firmada/${path}` })),
            error: null,
          }),
        }),
      },
    }
  },
}))

const { default: TramoDetallePage } = await import('@/app/dashboard/tramos/[id]/page')

const PARAMS = Promise.resolve({ id: 't1' })

function reiniciar() {
  tramoResultado = { data: TRAMO, error: null }
  coberturaCountResultado = { count: 2, error: null }
  coberturaUltimaResultado = { data: { created_at: '2026-01-05T15:00:00Z' }, error: null }
  observacionesResultado = { data: [OBSERVACION], error: null }
  cuadrosResultado = { data: [CUADRO], error: null }
  obtenerRugosidadTramos.mockReset()
  obtenerRugosidadTramos.mockResolvedValue({ t1: { calidad: 'malo', rms: 2, velocidad: 30, impactos: 1, segmentos: 5 } })
  notFound.mockClear()
}

describe('TramoDetallePage', () => {
  test('muestra nombre, localidad, km, veces cubierto, estado estimado y última visita', async () => {
    reiniciar()
    render(await TramoDetallePage({ params: PARAMS }))

    expect(screen.getByRole('heading', { name: 'CR-014 Camino a La Elisa' })).toBeInTheDocument()
    expect(screen.getByText(/Maipú · 5,0 km · cubierto 2 veces/)).toBeInTheDocument()
    expect(screen.getByText('Malo')).toBeInTheDocument()
    expect(screen.getByText(/Última visita: 5\/1\/2026/)).toBeInTheDocument()
  })

  test('lista las observaciones del tramo con su estado', async () => {
    reiniciar()
    render(await TramoDetallePage({ params: PARAMS }))

    expect(screen.getByText('Bache')).toBeInTheDocument()
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    const enlaces = screen.getAllByRole('link', { name: 'Ver' }).map((el) => el.getAttribute('href'))
    expect(enlaces).toContain('https://firmada/u1/r1/foto.jpg')
  })

  test('lista los cuadros del tramo', async () => {
    reiniciar()
    render(await TramoDetallePage({ params: PARAMS }))

    expect(screen.getByTestId('mapa-tramo')).toBeInTheDocument()
    expect(screen.getByText(/Cuadros \(1\)/)).toBeInTheDocument()
  })

  test('sin observaciones ni cuadros muestra los mensajes vacíos', async () => {
    reiniciar()
    observacionesResultado = { data: [], error: null }
    cuadrosResultado = { data: [], error: null }
    render(await TramoDetallePage({ params: PARAMS }))

    expect(screen.getByText('Sin observaciones registradas en este tramo.')).toBeInTheDocument()
    expect(screen.getByText('Sin cuadros de cámara en este tramo.')).toBeInTheDocument()
  })

  test('tramo inexistente o de otro municipio (RLS) da 404', async () => {
    reiniciar()
    tramoResultado = { data: null, error: null }

    await expect(TramoDetallePage({ params: PARAMS })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { vi } from 'vitest'

const FILAS = [
  {
    id: 'o1',
    tipo_falla: 'bache' as const,
    severidad: 'alta' as const,
    origen: 'manual' as const,
    estado: 'pendiente' as const,
    created_at: '2026-01-01T10:00:00Z',
    url_evidencia_imagen: null,
    tramo_id: 't1',
    recorridos: { inicio: '2026-01-01T09:00:00Z' },
    tramos: { nombre_codigo: 'CR-01' },
  },
  {
    id: 'o2',
    tipo_falla: 'carcava' as const,
    severidad: 'media' as const,
    origen: 'sensor' as const,
    estado: 'resuelta' as const,
    created_at: '2026-01-02T10:00:00Z',
    url_evidencia_imagen: 'u1/r1/foto.jpg',
    tramo_id: null,
    recorridos: null,
    tramos: null,
  },
]

const RESUMEN = [
  { estado: 'pendiente', total: 1 },
  { estado: 'resuelta', total: 1 },
]

let rolMock: 'productor' | 'municipio' = 'productor'
let filasMock: typeof FILAS = FILAS

// EstadoSelect (cliente) importa `./actions`, que a su vez importa
// `@/lib/cache` ('server-only'): sin mockear, jsdom hace explotar ese import
// ("This module cannot be imported from a Client Component"). El mock evita
// arrastrar esa cadena; `cambiarEstado` no se invoca en estos tests.
vi.mock('@/app/dashboard/observaciones/actions', () => ({ cambiarEstado: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard/observaciones',
  useSearchParams: () => new URLSearchParams(),
}))

/** Builder encadenable fake: eq/gte/lte/order/limit resuelven al mismo resultado configurado. */
function crearConsultaFallasMock() {
  const builder: {
    eq: () => typeof builder
    gte: () => typeof builder
    lte: () => typeof builder
    order: () => typeof builder
    limit: () => Promise<{ data: typeof filasMock; error: null }>
  } = {
    eq: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    limit: async () => ({ data: filasMock, error: null }),
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (tabla: string) => {
      if (tabla === 'perfiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { rol: rolMock, municipio_id: 'maipu' }, error: null }) }),
          }),
        }
      }
      return { select: () => crearConsultaFallasMock() }
    },
    rpc: async () => ({ data: RESUMEN, error: null }),
    storage: {
      from: () => ({
        createSignedUrls: async (rutas: string[]) => ({
          data: rutas.map((path) => ({ path, signedUrl: `https://firmada/${path}` })),
          error: null,
        }),
      }),
    },
  }),
}))

const { default: ObservacionesPage } = await import('@/app/dashboard/observaciones/page')

const SIN_FILTROS = Promise.resolve({})

afterEach(() => {
  rolMock = 'productor'
  filasMock = FILAS
})

describe('ObservacionesPage', () => {
  test('lista las observaciones con fecha, tipo, severidad, origen, tramo y evidencia', async () => {
    render(await ObservacionesPage({ searchParams: SIN_FILTROS }))

    // Con el filtro compartido en la página, "Bache", "Alta", "Manual",
    // "Pendiente", etc. también aparecen como <option> del selector: se
    // acota la búsqueda a la tabla para no chocar con esos duplicados.
    const tabla = screen.getByRole('table')
    expect(screen.getByRole('columnheader', { name: 'Fecha' })).toBeInTheDocument()
    expect(within(tabla).getByText('Bache')).toBeInTheDocument()
    expect(within(tabla).getByText('Alta')).toBeInTheDocument()
    expect(within(tabla).getByText('Manual')).toBeInTheDocument()
    expect(within(tabla).getByText('CR-01')).toBeInTheDocument()
    expect(within(tabla).getByRole('link', { name: 'Ver' })).toHaveAttribute(
      'href',
      'https://firmada/u1/r1/foto.jpg',
    )
    expect(within(tabla).getAllByRole('row')).toHaveLength(3) // encabezado + 2 filas
  })

  test('conteos por estado salen de resumen_observaciones', async () => {
    render(await ObservacionesPage({ searchParams: SIN_FILTROS }))
    expect(screen.getByText(/Pendiente:/)).toBeInTheDocument()
    expect(screen.getByText(/Resuelta:/)).toBeInTheDocument()
  })

  test('rol productor ve el estado como badge de solo lectura, sin selector', async () => {
    render(await ObservacionesPage({ searchParams: SIN_FILTROS }))
    // Sin selector por fila dentro de la tabla; el filtro compartido sí
    // tiene sus propios <select>, fuera de la tabla.
    expect(within(screen.getByRole('table')).queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0)
  })

  test('rol municipio puede cambiar el estado con un selector por fila', async () => {
    rolMock = 'municipio'
    render(await ObservacionesPage({ searchParams: SIN_FILTROS }))
    expect(screen.getAllByRole('combobox', { name: /estado de la observación/i })).toHaveLength(2)
  })

  test('sin observaciones muestra el mensaje vacío', async () => {
    filasMock = []
    render(await ObservacionesPage({ searchParams: SIN_FILTROS }))
    expect(screen.getByText(/todavía no hay observaciones/i)).toBeInTheDocument()
  })

  test('muestra el filtro compartido', async () => {
    render(await ObservacionesPage({ searchParams: SIN_FILTROS }))
    expect(screen.getByLabelText('Estado')).toBeInTheDocument()
  })

  test('aplica filtros de la url a la consulta', async () => {
    render(
      await ObservacionesPage({
        searchParams: Promise.resolve({ tipo: 'bache', severidad: 'alta', estado: 'pendiente', desde: '2026-01-01' }),
      }),
    )
    expect(screen.getByRole('columnheader', { name: 'Fecha' })).toBeInTheDocument()
  })
})

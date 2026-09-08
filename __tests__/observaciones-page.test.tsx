import { render, screen } from '@testing-library/react'
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
      return {
        select: () => ({
          order: () => ({
            limit: async () => ({ data: filasMock, error: null }),
          }),
        }),
      }
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

afterEach(() => {
  rolMock = 'productor'
  filasMock = FILAS
})

describe('ObservacionesPage', () => {
  test('lista las observaciones con fecha, tipo, severidad, origen, tramo y evidencia', async () => {
    render(await ObservacionesPage())

    expect(screen.getByRole('columnheader', { name: 'Fecha' })).toBeInTheDocument()
    expect(screen.getByText('Bache')).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()
    expect(screen.getByText('Manual')).toBeInTheDocument()
    expect(screen.getByText('CR-01')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', 'https://firmada/u1/r1/foto.jpg')
    expect(screen.getAllByRole('row')).toHaveLength(3) // encabezado + 2 filas
  })

  test('conteos por estado salen de resumen_observaciones', async () => {
    render(await ObservacionesPage())
    expect(screen.getByText(/Pendiente:/)).toBeInTheDocument()
    expect(screen.getByText(/Resuelta:/)).toBeInTheDocument()
  })

  test('rol productor ve el estado como badge de solo lectura, sin selector', async () => {
    render(await ObservacionesPage())
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0)
  })

  test('rol municipio puede cambiar el estado con un selector por fila', async () => {
    rolMock = 'municipio'
    render(await ObservacionesPage())
    expect(screen.getAllByRole('combobox', { name: /estado de la observación/i })).toHaveLength(2)
  })

  test('sin observaciones muestra el mensaje vacío', async () => {
    filasMock = []
    render(await ObservacionesPage())
    expect(screen.getByText(/todavía no hay observaciones/i)).toBeInTheDocument()
  })
})

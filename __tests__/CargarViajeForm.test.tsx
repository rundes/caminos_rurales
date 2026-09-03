import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const upload = vi.fn()
const push = vi.fn()
const refresh = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  crearClienteNavegador: () => ({ storage: { from: () => ({ upload }) } }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/app/dashboard/cargar-viaje/actions', () => ({
  crearRelevamiento: vi.fn(),
  registrarArchivos: vi.fn(),
}))

const { CargarViajeForm } = await import('@/app/dashboard/cargar-viaje/CargarViajeForm')
const { crearRelevamiento, registrarArchivos } = await import('@/app/dashboard/cargar-viaje/actions')

const CAMINO = '0d5a3c9a-2f3e-4d1b-9c8a-1b2c3d4e5f60'
const RELEVAMIENTO = '7c1f2e40-9b3a-4c5d-8e6f-0a1b2c3d4e5f'
const CAMINOS = [{ id: CAMINO, nombre_codigo: 'Camino Los Talas' }]

const fetchMock = vi.fn()

function foto(nombre: string): File {
  return new File(['contenido'], nombre, { type: 'image/jpeg' })
}

function respuestaIa(fallas: number) {
  return { ok: true, json: async () => ({ ok: true, fallas }) }
}

async function completarFormulario(archivos: File[], applyAccept = true) {
  await userEvent.selectOptions(screen.getByLabelText(/camino/i), CAMINO)
  await userEvent.type(screen.getByLabelText(/kilómetros/i), '3')
  if (archivos.length > 0) {
    await userEvent.upload(screen.getByLabelText(/elegir archivos/i), archivos, { applyAccept })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(crearRelevamiento).mockResolvedValue({ ok: true, data: { id: RELEVAMIENTO, km: 3 } })
  vi.mocked(registrarArchivos).mockResolvedValue({ ok: true, data: undefined })
  upload.mockResolvedValue({ error: null })
  fetchMock.mockResolvedValue(respuestaIa(3))
})

describe('CargarViajeForm', () => {
  test('muestra los caminos disponibles y deshabilita el envío cuando no hay ninguno', () => {
    const { unmount } = render(<CargarViajeForm caminos={CAMINOS} uid="u1" />)
    expect(screen.getByRole('option', { name: 'Camino Los Talas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar relevamiento/i })).toBeEnabled()
    unmount()

    render(<CargarViajeForm caminos={[]} uid="u1" />)
    expect(screen.getByRole('button', { name: /guardar relevamiento/i })).toBeDisabled()
  })

  test('sube los archivos, registra las rutas y muestra el resumen', async () => {
    render(<CargarViajeForm caminos={CAMINOS} uid="u1" />)
    await completarFormulario([foto('a.jpg'), foto('b.jpg')])
    await userEvent.click(screen.getByRole('button', { name: /guardar relevamiento/i }))

    const estado = await screen.findByText(/relevamiento guardado/i)
    expect(estado).toHaveTextContent('2 archivo(s)')
    expect(estado).toHaveTextContent('3 fallas')
    expect(upload).toHaveBeenCalledTimes(2)
    expect(vi.mocked(registrarArchivos).mock.calls[0][2]).toHaveLength(2)
    expect(refresh).toHaveBeenCalled()
  })

  test('marca el archivo que falló y reintenta sin recrear el relevamiento', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    upload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'boom' } })
      .mockResolvedValue({ error: null })

    render(<CargarViajeForm caminos={CAMINOS} uid="u1" />)
    await completarFormulario([foto('a.jpg'), foto('b.jpg')])
    await userEvent.click(screen.getByRole('button', { name: /guardar relevamiento/i }))

    const reintentar = await screen.findByRole('button', { name: /reintentar/i })
    expect(screen.getByText('No se pudo subir. Reintentá.')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith('[subida]', 'boom')
    expect(vi.mocked(registrarArchivos).mock.calls[0][2]).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
    spy.mockRestore()

    upload.mockClear()
    await userEvent.click(reintentar)

    await screen.findByText(/relevamiento guardado/i)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0][1]).toHaveProperty('name', 'b.jpg')
    expect(crearRelevamiento).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(vi.mocked(registrarArchivos).mock.calls[1][2]).toHaveLength(2))
  })

  test('un 409 al reintentar se trata como éxito y no deja botón de reintentar', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'Error interno al procesar' }),
    })

    render(<CargarViajeForm caminos={CAMINOS} uid="u1" />)
    await completarFormulario([foto('a.jpg')])
    await userEvent.click(screen.getByRole('button', { name: /guardar relevamiento/i }))

    const reintentar = await screen.findByRole('button', { name: /reintentar/i })
    expect(screen.getByText('Error interno al procesar')).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ ok: false, error: 'Ya fue procesado' }),
    })
    await userEvent.click(reintentar)

    const estado = await screen.findByText(/relevamiento guardado/i)
    expect(estado).toHaveTextContent('Ya había sido procesado')
    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument()
  })

  test('ignora un segundo submit disparado mientras el primero está en curso', async () => {
    vi.mocked(crearRelevamiento).mockImplementation(() => new Promise(() => {}))

    render(<CargarViajeForm caminos={CAMINOS} uid="u1" />)
    await completarFormulario([foto('a.jpg')])
    const boton = screen.getByRole('button', { name: /guardar relevamiento/i })
    const form = boton.closest('form') as HTMLFormElement

    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => expect(crearRelevamiento).toHaveBeenCalledTimes(1))
  })

  test('muestra el motivo de un archivo no permitido y no lo sube', async () => {
    render(<CargarViajeForm caminos={CAMINOS} uid="u1" />)
    const invalido = new File(['x'], 'notas.txt', { type: 'text/plain' })
    await completarFormulario([invalido], false)

    expect(screen.getByText(/tipo no permitido/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /guardar relevamiento/i }))
    await screen.findByText(/relevamiento guardado/i)
    expect(upload).not.toHaveBeenCalled()
  })
})

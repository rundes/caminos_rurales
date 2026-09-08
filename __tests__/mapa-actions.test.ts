// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

const getUser = vi.fn()
const maybeSingle = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from,
  }),
}))

const obtenerCuadros = vi.fn()
vi.mock('@/lib/cuadros-consultas', () => ({ obtenerCuadros: (...args: unknown[]) => obtenerCuadros(...args) }))

const urlsLectura = vi.fn()
vi.mock('@/lib/almacenamiento', () => ({
  obtenerProveedor: () => ({ urlsLectura: (...args: unknown[]) => urlsLectura(...args) }),
}))

const { obtenerCuadrosMunicipio } = await import('@/app/dashboard/mapa/actions')

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }))
  maybeSingle.mockResolvedValue({ data: { municipio_id: 'maipu' }, error: null })
  urlsLectura.mockResolvedValue({})
})

describe('obtenerCuadrosMunicipio', () => {
  test('sin sesión devuelve error de sesión y no consulta cuadros', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const resultado = await obtenerCuadrosMunicipio()

    expect(resultado).toEqual({ ok: false, error: expect.stringMatching(/sesión/i) })
    expect(obtenerCuadros).not.toHaveBeenCalled()
  })

  test('si falla la consulta del perfil, devuelve error y loguea', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const resultado = await obtenerCuadrosMunicipio()

    expect(resultado.ok).toBe(false)
    expect(spy).toHaveBeenCalledWith('[mapa]', 'boom')
    spy.mockRestore()
  })

  test('sin municipio asignado en el perfil, devuelve error', async () => {
    maybeSingle.mockResolvedValue({ data: { municipio_id: null }, error: null })

    const resultado = await obtenerCuadrosMunicipio()

    expect(resultado).toEqual({ ok: false, error: expect.stringMatching(/partido/i) })
  })

  test('devuelve los cuadros del municipio del usuario con las URLs que firma el proveedor', async () => {
    obtenerCuadros.mockResolvedValue([
      { id: 'c1', ruta: 'u1/r1/cuadros/1.jpg' },
      { id: 'c2', ruta: 'https://cdn.example.com/2.jpg' },
    ])
    urlsLectura.mockResolvedValue({
      'u1/r1/cuadros/1.jpg': 'https://firmada.example.com/1.jpg',
      'https://cdn.example.com/2.jpg': 'https://cdn.example.com/2.jpg',
    })

    const resultado = await obtenerCuadrosMunicipio()

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('esperaba ok: true')
    expect(resultado.data.cuadros).toHaveLength(2)
    expect(resultado.data.urls).toEqual({
      'u1/r1/cuadros/1.jpg': 'https://firmada.example.com/1.jpg',
      'https://cdn.example.com/2.jpg': 'https://cdn.example.com/2.jpg',
    })
    expect(obtenerCuadros).toHaveBeenCalledWith(expect.anything(), 'maipu')
    // La firma en lote (chunking, concurrencia acotada) vive en el proveedor:
    // esta acción solo le pasa las rutas únicas, sin conocer su implementación.
    expect(urlsLectura).toHaveBeenCalledWith(['u1/r1/cuadros/1.jpg', 'https://cdn.example.com/2.jpg'])
  })

  test('no firma nada cuando no hay cuadros', async () => {
    obtenerCuadros.mockResolvedValue([])

    const resultado = await obtenerCuadrosMunicipio()

    expect(resultado).toEqual({ ok: true, data: { cuadros: [], urls: {} } })
    expect(urlsLectura).not.toHaveBeenCalled()
  })

  test('si algo falla al firmar, devuelve error genérico y loguea', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    obtenerCuadros.mockResolvedValue([{ id: 'c1', ruta: 'u1/r1/cuadros/1.jpg' }])
    urlsLectura.mockRejectedValue(new Error('boom'))

    const resultado = await obtenerCuadrosMunicipio()

    expect(resultado).toEqual({ ok: false, error: expect.stringMatching(/no se pudieron cargar/i) })
    expect(spy).toHaveBeenCalledWith('[mapa]', expect.any(Error))
    spy.mockRestore()
  })
})

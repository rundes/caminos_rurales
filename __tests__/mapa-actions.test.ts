// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

const getUser = vi.fn()
const maybeSingle = vi.fn()
const from = vi.fn()
const createSignedUrls = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from,
    storage: { from: () => ({ createSignedUrls }) },
  }),
}))

const obtenerCuadros = vi.fn()
vi.mock('@/lib/cuadros-consultas', () => ({ obtenerCuadros: (...args: unknown[]) => obtenerCuadros(...args) }))

const { obtenerCuadrosMunicipio } = await import('@/app/dashboard/mapa/actions')

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }))
  maybeSingle.mockResolvedValue({ data: { municipio_id: 'maipu' }, error: null })
  createSignedUrls.mockResolvedValue({ data: [], error: null })
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

  test('devuelve los cuadros del municipio del usuario con URLs firmadas y directas', async () => {
    obtenerCuadros.mockResolvedValue([
      { id: 'c1', ruta: 'u1/r1/cuadros/1.jpg' },
      { id: 'c2', ruta: 'https://cdn.example.com/2.jpg' },
    ])
    createSignedUrls.mockResolvedValue({
      data: [{ path: 'u1/r1/cuadros/1.jpg', signedUrl: 'https://firmada.example.com/1.jpg' }],
      error: null,
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
  })

  test('firma en lotes de 100 rutas cuando hay más de un lote', async () => {
    const rutas = Array.from({ length: 150 }, (_, i) => `u1/r1/cuadros/${i}.jpg`)
    obtenerCuadros.mockResolvedValue(rutas.map((ruta, i) => ({ id: `c${i}`, ruta })))
    createSignedUrls.mockResolvedValue({ data: [], error: null })

    await obtenerCuadrosMunicipio()

    expect(createSignedUrls).toHaveBeenCalledTimes(2)
    expect(createSignedUrls.mock.calls[0][0]).toHaveLength(100)
    expect(createSignedUrls.mock.calls[1][0]).toHaveLength(50)
  })

  test('no firma nada cuando no hay cuadros', async () => {
    obtenerCuadros.mockResolvedValue([])

    const resultado = await obtenerCuadrosMunicipio()

    expect(resultado).toEqual({ ok: true, data: { cuadros: [], urls: {} } })
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  test('si algo falla al firmar, devuelve error genérico y loguea', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    obtenerCuadros.mockResolvedValue([{ id: 'c1', ruta: 'u1/r1/cuadros/1.jpg' }])
    createSignedUrls.mockRejectedValue(new Error('boom'))

    const resultado = await obtenerCuadrosMunicipio()

    expect(resultado).toEqual({ ok: false, error: expect.stringMatching(/no se pudieron cargar/i) })
    expect(spy).toHaveBeenCalledWith('[mapa]', expect.any(Error))
    spy.mockRestore()
  })
})

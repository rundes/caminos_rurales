import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  aplicarParche,
  crearItem,
  pendienteDeSubida,
  procesarRelevamiento,
  rutasSubidas,
  subirPendientes,
  type ArchivoEnLista,
  type ClienteStorage,
} from '@/lib/subida'

const upload = vi.fn()
const cliente: ClienteStorage = { storage: { from: () => ({ upload }) } }

function foto(nombre: string): File {
  return new File(['x'], nombre, { type: 'image/jpeg' })
}

beforeEach(() => {
  vi.clearAllMocks()
  upload.mockResolvedValue({ error: null })
})

describe('crearItem', () => {
  test('marca pendiente un archivo válido con id propio', () => {
    const a = crearItem(foto('a.jpg'))
    const b = crearItem(foto('a.jpg'))
    expect(a.estado).toBe('pendiente')
    expect(a.id).not.toBe(b.id)
  })

  test('marca inválido un tipo no permitido y guarda el motivo', () => {
    const item = crearItem(new File(['x'], 'notas.txt', { type: 'text/plain' }))
    expect(item.estado).toBe('invalido')
    expect(item.mensaje).toMatch(/tipo no permitido/i)
  })
})

describe('pendienteDeSubida', () => {
  test.each([
    ['pendiente', true],
    ['error', true],
    ['ok', false],
    ['invalido', false],
    ['subiendo', false],
  ] as const)('%s -> %s', (estado, esperado) => {
    expect(pendienteDeSubida({ id: '1', archivo: foto('a.jpg'), estado })).toBe(esperado)
  })
})

describe('subirPendientes', () => {
  test('sube sólo los pendientes y no toca los válidos ya subidos ni los inválidos', async () => {
    const items: ArchivoEnLista[] = [
      { id: '1', archivo: foto('a.jpg'), estado: 'ok', ruta: 'u1/r1/a.jpg' },
      { id: '2', archivo: foto('b.jpg'), estado: 'error', mensaje: 'boom' },
      { id: '3', archivo: new File(['x'], 'c.txt', { type: 'text/plain' }), estado: 'invalido' },
    ]

    const finales = await subirPendientes(cliente, 'u1', 'r1', items, () => {})

    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0][1]).toHaveProperty('name', 'b.jpg')
    expect(finales.map((i) => i.estado)).toEqual(['ok', 'ok', 'invalido'])
    expect(rutasSubidas(finales)).toHaveLength(2)
    expect(items[1].estado).toBe('error')
  })

  test('marca error con el mensaje del storage y notifica cada cambio por id', async () => {
    upload.mockResolvedValue({ error: { message: 'sin permiso' } })
    const items: ArchivoEnLista[] = [{ id: '1', archivo: foto('a.jpg'), estado: 'pendiente' }]
    const cambios: Array<[string, Partial<ArchivoEnLista>]> = []

    const finales = await subirPendientes(cliente, 'u1', 'r1', items, (id, parche) => cambios.push([id, parche]))

    expect(cambios[0]).toEqual(['1', { estado: 'subiendo', mensaje: undefined }])
    expect(cambios[1]).toEqual(['1', { estado: 'error', mensaje: 'sin permiso' }])
    expect(finales[0].mensaje).toBe('sin permiso')
    expect(rutasSubidas(finales)).toEqual([])
  })
})

describe('aplicarParche', () => {
  test('actualiza el item por id sin mutar la lista original', () => {
    const items: ArchivoEnLista[] = [
      { id: '1', archivo: foto('a.jpg'), estado: 'pendiente' },
      { id: '2', archivo: foto('b.jpg'), estado: 'pendiente' },
    ]
    const siguiente = aplicarParche(items, '2', { estado: 'ok', ruta: 'u1/r1/b.jpg' })

    expect(siguiente[1].estado).toBe('ok')
    expect(items[1].estado).toBe('pendiente')
    expect(siguiente[0]).toBe(items[0])
  })
})

describe('procesarRelevamiento', () => {
  test('devuelve la cantidad de fallas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, fallas: 4 }) }))
    await expect(procesarRelevamiento('r1')).resolves.toEqual({ ok: true, data: { fallas: 4 } })
  })

  test('devuelve el error del endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ ok: false, error: 'Ya procesado' }) }),
    )
    await expect(procesarRelevamiento('r1')).resolves.toEqual({ ok: false, error: 'Ya procesado' })
  })

  test('devuelve un mensaje genérico si la red falla', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(procesarRelevamiento('r1')).resolves.toEqual({
      ok: false,
      error: 'No se pudo procesar la evidencia. Intentá de nuevo.',
    })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

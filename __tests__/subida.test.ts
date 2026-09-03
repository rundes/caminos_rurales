import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { DestinoSubida } from '@/lib/almacenamiento/tipos'
import { subirArchivo } from '@/lib/subida'

const DESTINO: DestinoSubida = {
  urlSubida: 'https://subida.test/put',
  metodo: 'PUT',
  headers: { 'content-type': 'image/jpeg' },
  urlLectura: 'uid/rec/foto.jpg',
  ruta: 'uid/rec/foto.jpg',
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('subirArchivo', () => {
  test('hace un PUT con los headers firmados', async () => {
    const archivo = new Blob(['bytes'], { type: 'image/jpeg' })
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }))

    await subirArchivo(DESTINO, archivo, fetcher)

    expect(fetcher).toHaveBeenCalledWith(DESTINO.urlSubida, {
      method: 'PUT',
      headers: DESTINO.headers,
      body: archivo,
    })
  })

  test('lanza un error en español cuando la respuesta no es 2xx', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 403 }))

    await expect(subirArchivo(DESTINO, new Blob(['x']), fetcher)).rejects.toThrow(
      'No se pudo subir la evidencia. Lo reintentamos más tarde.',
    )
  })
})

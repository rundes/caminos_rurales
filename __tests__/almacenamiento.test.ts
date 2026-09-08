// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const createSignedUploadUrl = vi.fn()
const createSignedUrl = vi.fn()
const createSignedUrls = vi.fn()
const fromBucket = vi.fn(() => ({ createSignedUploadUrl, createSignedUrl, createSignedUrls }))

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({ storage: { from: fromBucket } }),
}))

const getSignedUrl = vi.fn()
const file = vi.fn(() => ({ getSignedUrl }))
const bucket = vi.fn(() => ({ file }))
const Storage = vi.fn(function StorageFalso() {
  return { bucket }
})

vi.mock('@google-cloud/storage', () => ({ Storage }))

const { obtenerProveedor, valorParaGuardar } = await import('@/lib/almacenamiento')
const { crearProveedorSupabase, BUCKET_EVIDENCIA } = await import('@/lib/almacenamiento/supabase')
const { crearProveedorGcs } = await import('@/lib/almacenamiento/gcs')
const { limpiarCacheEnvServidor } = await import('@/lib/env')

const CLAVE_GCS = JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: 'x' })
const entornoOriginal = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  limpiarCacheEnvServidor()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://sb.example.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_1234'
  createSignedUploadUrl.mockResolvedValue({
    data: { signedUrl: 'https://sb.co/storage/v1/object/upload/sign/evidencia-vial/u1/r1/a.jpg?token=t', token: 't' },
    error: null,
  })
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://sb.co/firmada' }, error: null })
  createSignedUrls.mockResolvedValue({
    data: [{ path: 'u1/r1/a.jpg', signedUrl: 'https://sb.co/firmada-lote' }],
    error: null,
  })
  getSignedUrl.mockResolvedValue(['https://storage.googleapis.com/maipu-pba/u1/r1/a.jpg?X-Goog-Signature=z'])
})

afterEach(() => {
  process.env = { ...entornoOriginal }
  limpiarCacheEnvServidor()
})

describe('obtenerProveedor', () => {
  test('sin ALMACENAMIENTO usa Supabase', async () => {
    delete process.env.ALMACENAMIENTO
    const destino = await obtenerProveedor().prepararSubida('u1/r1/a.jpg', 'image/jpeg')
    expect(fromBucket).toHaveBeenCalledWith(BUCKET_EVIDENCIA)
    expect(destino.urlSubida).toContain('/object/upload/sign/')
  })

  test('ALMACENAMIENTO=gcs usa Google Cloud Storage', async () => {
    process.env.ALMACENAMIENTO = 'gcs'
    process.env.GCS_BUCKET = 'maipu-pba'
    process.env.GCS_SERVICE_ACCOUNT_KEY = CLAVE_GCS
    const destino = await obtenerProveedor().prepararSubida('u1/r1/a.jpg', 'image/jpeg')
    expect(Storage).toHaveBeenCalledWith({ credentials: { client_email: 'a@b.iam.gserviceaccount.com', private_key: 'x' } })
    // La escritura pide una URL firmada, pero lo que se guarda para releer es
    // la ruta: ni GCS ni Supabase pueden firmar una URL de lectura útil por
    // adelantado (ver `lib/almacenamiento/tipos.ts`).
    expect(destino.urlLectura).toBe('u1/r1/a.jpg')
  })

  test('ALMACENAMIENTO=gcs sin credenciales falla con un mensaje claro', () => {
    process.env.ALMACENAMIENTO = 'gcs'
    delete process.env.GCS_BUCKET
    delete process.env.GCS_SERVICE_ACCOUNT_KEY
    expect(() => obtenerProveedor()).toThrow(/GCS_BUCKET/)
  })

  test('ALMACENAMIENTO=gcs con una clave sin campos requeridos falla al arrancar', () => {
    process.env.ALMACENAMIENTO = 'gcs'
    process.env.GCS_BUCKET = 'maipu-pba'
    process.env.GCS_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com' })
    expect(() => obtenerProveedor()).toThrow(/private_key/)
  })
})

describe('proveedor supabase', () => {
  test('devuelve un destino PUT con la URL firmada y la ruta como valor a guardar', async () => {
    const destino = await crearProveedorSupabase().prepararSubida('u1/r1/a.jpg', 'image/jpeg')
    expect(createSignedUploadUrl).toHaveBeenCalledWith('u1/r1/a.jpg')
    expect(destino).toEqual({
      urlSubida: expect.stringContaining('token=t'),
      metodo: 'PUT',
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'max-age=3600',
        'x-upsert': 'false',
        apikey: 'sb_publishable_test_1234',
        authorization: 'Bearer sb_publishable_test_1234',
      },
      urlLectura: 'u1/r1/a.jpg',
      ruta: 'u1/r1/a.jpg',
    })
    expect(valorParaGuardar(destino)).toBe('u1/r1/a.jpg')
  })

  test('firma la lectura al momento de leer', async () => {
    const url = await crearProveedorSupabase().urlLectura('u1/r1/a.jpg')
    expect(createSignedUrl).toHaveBeenCalledWith('u1/r1/a.jpg', 3600)
    expect(url).toBe('https://sb.co/firmada')
  })

  test('una URL ya https se devuelve tal cual, sin firmar', async () => {
    const url = await crearProveedorSupabase().urlLectura('https://cdn.example.com/x.jpg')
    expect(createSignedUrl).not.toHaveBeenCalled()
    expect(url).toBe('https://cdn.example.com/x.jpg')
  })

  test('error de Supabase se registra y devuelve mensaje genérico', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(crearProveedorSupabase().prepararSubida('u1/r1/a.jpg', 'image/jpeg')).rejects.toThrow(
      /No se pudo preparar la subida/,
    )
    expect(spy).toHaveBeenCalledWith('[almacenamiento]', 'boom')
    spy.mockRestore()
  })

  test('urlsLectura firma en lotes de 100 rutas y pasa las https tal cual', async () => {
    const rutas = Array.from({ length: 150 }, (_, i) => `u1/r1/${i}.jpg`)
    createSignedUrls.mockResolvedValue({ data: [], error: null })

    const urls = await crearProveedorSupabase().urlsLectura([...rutas, 'https://cdn.example.com/x.jpg'])

    expect(createSignedUrls).toHaveBeenCalledTimes(2)
    expect(createSignedUrls.mock.calls[0][0]).toHaveLength(100)
    expect(createSignedUrls.mock.calls[1][0]).toHaveLength(50)
    expect(urls['https://cdn.example.com/x.jpg']).toBe('https://cdn.example.com/x.jpg')
  })

  test('urlsLectura omite del mapa una ruta que no se pudo firmar', async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: 'u1/r1/a.jpg', signedUrl: 'https://sb.co/firmada-lote' }, { path: null, signedUrl: null }],
      error: null,
    })

    const urls = await crearProveedorSupabase().urlsLectura(['u1/r1/a.jpg', 'u1/r1/inexistente.jpg'])

    expect(urls).toEqual({ 'u1/r1/a.jpg': 'https://sb.co/firmada-lote' })
    expect(urls['u1/r1/inexistente.jpg']).toBeUndefined()
  })

  test('urlsLectura con lista vacía no llama a Storage', async () => {
    const urls = await crearProveedorSupabase().urlsLectura([])
    expect(createSignedUrls).not.toHaveBeenCalled()
    expect(urls).toEqual({})
  })
})

describe('proveedor gcs', () => {
  beforeEach(() => {
    process.env.GCS_BUCKET = 'maipu-pba'
    process.env.GCS_SERVICE_ACCOUNT_KEY = CLAVE_GCS
  })

  test('pide una URL firmada V4 de escritura por 15 minutos', async () => {
    const destino = await crearProveedorGcs().prepararSubida('u1/r1/a.jpg', 'video/mp4')
    expect(bucket).toHaveBeenCalledWith('maipu-pba')
    expect(file).toHaveBeenCalledWith('u1/r1/a.jpg')
    expect(getSignedUrl).toHaveBeenCalledWith({
      version: 'v4',
      action: 'write',
      expires: expect.any(Number),
      contentType: 'video/mp4',
    })
    expect(destino.metodo).toBe('PUT')
    expect(destino.headers).toEqual({ 'content-type': 'video/mp4' })
    // El valor a guardar es la ruta, no una URL pública: el bucket puede ser privado.
    expect(valorParaGuardar(destino)).toBe('u1/r1/a.jpg')
  })

  test('la lectura de una ruta pide una URL firmada V4 de lectura por 1 hora, no la URL pública', async () => {
    getSignedUrl.mockResolvedValue(['https://storage.googleapis.com/maipu-pba/u1/r1/a.jpg?X-Goog-Signature=z'])
    const url = await crearProveedorGcs().urlLectura('u1/r1/a.jpg')
    expect(getSignedUrl).toHaveBeenCalledWith({
      version: 'v4',
      action: 'read',
      expires: expect.any(Number),
    })
    expect(url).toBe('https://storage.googleapis.com/maipu-pba/u1/r1/a.jpg?X-Goog-Signature=z')
    expect(url).not.toBe('https://storage.googleapis.com/maipu-pba/u1/r1/a.jpg')
  })

  test('el vencimiento de la lectura firmada es de 1 hora, igual que Supabase', async () => {
    const antes = Date.now()
    await crearProveedorGcs().urlLectura('u1/r1/a.jpg')
    const [{ expires }] = getSignedUrl.mock.calls[0]
    expect(expires).toBeGreaterThanOrEqual(antes + 60 * 60 * 1000 - 1000)
    expect(expires).toBeLessThanOrEqual(antes + 60 * 60 * 1000 + 5000)
  })

  test('una URL ya https se devuelve tal cual, sin firmar', async () => {
    const url = await crearProveedorGcs().urlLectura('https://cdn.example.com/x.jpg')
    expect(getSignedUrl).not.toHaveBeenCalled()
    expect(url).toBe('https://cdn.example.com/x.jpg')
  })

  test('un error al firmar la lectura da un mensaje genérico y lo registra', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getSignedUrl.mockRejectedValue(new Error('boom'))
    await expect(crearProveedorGcs().urlLectura('u1/r1/a.jpg')).rejects.toThrow(/No se pudo generar el enlace/)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  test('una credencial mal formada da un error claro', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.GCS_SERVICE_ACCOUNT_KEY = 'no-es-json'
    await expect(crearProveedorGcs().prepararSubida('u1/r1/a.jpg', 'image/jpeg')).rejects.toThrow(/JSON válido/)
    spy.mockRestore()
  })

  describe('urlsLectura', () => {
    beforeEach(() => {
      getSignedUrl.mockImplementation(async () => [
        `https://storage.googleapis.com/maipu-pba/firmada?sig=${file.mock.calls.length}`,
      ])
    })

    test('firma cada ruta y pasa las que ya son https tal cual', async () => {
      const urls = await crearProveedorGcs().urlsLectura(['u1/a.jpg', 'https://cdn.example.com/x.jpg'])
      expect(urls['https://cdn.example.com/x.jpg']).toBe('https://cdn.example.com/x.jpg')
      expect(urls['u1/a.jpg']).toMatch(/^https:\/\/storage\.googleapis\.com\/maipu-pba\/firmada/)
      expect(file).toHaveBeenCalledWith('u1/a.jpg')
    })

    test('con lista vacía no crea el cliente de Storage', async () => {
      const urls = await crearProveedorGcs().urlsLectura([])
      expect(urls).toEqual({})
      expect(Storage).not.toHaveBeenCalled()
    })

    test('no manda más de la concurrencia acotada de firmas en simultáneo', async () => {
      let enVuelo = 0
      let maximoEnVuelo = 0
      getSignedUrl.mockImplementation(async () => {
        enVuelo += 1
        maximoEnVuelo = Math.max(maximoEnVuelo, enVuelo)
        await new Promise((resolve) => setTimeout(resolve, 5))
        enVuelo -= 1
        return ['https://storage.googleapis.com/maipu-pba/firmada']
      })

      const rutas = Array.from({ length: 60 }, (_, i) => `u1/r${i}.jpg`)
      await crearProveedorGcs().urlsLectura(rutas)

      expect(maximoEnVuelo).toBeGreaterThan(1)
      expect(maximoEnVuelo).toBeLessThanOrEqual(20)
    })

    test('una ruta que falla al firmar no tira abajo el resto del lote', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      getSignedUrl.mockImplementation(async () => {
        throw new Error('boom')
      })
      const urls = await crearProveedorGcs().urlsLectura(['u1/a.jpg', 'u1/b.jpg'])
      expect(urls).toEqual({})
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })
})

describe('contrato compartido entre proveedores', () => {
  const proveedores: [string, () => ReturnType<typeof crearProveedorSupabase>][] = [
    ['supabase', crearProveedorSupabase],
    ['gcs', crearProveedorGcs],
  ]

  beforeEach(() => {
    process.env.GCS_BUCKET = 'maipu-pba'
    process.env.GCS_SERVICE_ACCOUNT_KEY = CLAVE_GCS
  })

  test.each(proveedores)('%s: el valor a guardar de prepararSubida es siempre la ruta', async (_nombre, crear) => {
    const destino = await crear().prepararSubida('u1/r1/a.jpg', 'image/jpeg')
    expect(destino.ruta).toBe('u1/r1/a.jpg')
    expect(valorParaGuardar(destino)).toBe('u1/r1/a.jpg')
  })

  test.each(proveedores)('%s: urlLectura de una URL https la devuelve sin tocarla', async (_nombre, crear) => {
    const url = await crear().urlLectura('https://ya-es-publica.example.com/foto.jpg')
    expect(url).toBe('https://ya-es-publica.example.com/foto.jpg')
  })

  test.each(proveedores)('%s: urlsLectura con lista vacía devuelve un mapa vacío', async (_nombre, crear) => {
    expect(await crear().urlsLectura([])).toEqual({})
  })
})

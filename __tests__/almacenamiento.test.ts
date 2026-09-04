// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const createSignedUploadUrl = vi.fn()
const createSignedUrl = vi.fn()
const fromBucket = vi.fn(() => ({ createSignedUploadUrl, createSignedUrl }))

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

const CLAVE_GCS = JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: 'x' })
const entornoOriginal = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
  createSignedUploadUrl.mockResolvedValue({
    data: { signedUrl: 'https://sb.co/storage/v1/object/upload/sign/evidencia-vial/u1/r1/a.jpg?token=t', token: 't' },
    error: null,
  })
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://sb.co/firmada' }, error: null })
  getSignedUrl.mockResolvedValue(['https://storage.googleapis.com/maipu-pba/u1/r1/a.jpg?X-Goog-Signature=z'])
})

afterEach(() => {
  process.env = { ...entornoOriginal }
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
    expect(Storage).toHaveBeenCalledWith({ credentials: JSON.parse(CLAVE_GCS) })
    expect(destino.urlLectura).toBe('https://storage.googleapis.com/maipu-pba/u1/r1/a.jpg')
  })

  test('ALMACENAMIENTO=gcs sin credenciales falla con un mensaje claro', () => {
    process.env.ALMACENAMIENTO = 'gcs'
    delete process.env.GCS_BUCKET
    delete process.env.GCS_SERVICE_ACCOUNT_KEY
    expect(() => obtenerProveedor()).toThrow(/GCS_BUCKET/)
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
        apikey: 'sb_publishable_test',
        authorization: 'Bearer sb_publishable_test',
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

  test('error de Supabase se registra y devuelve mensaje genérico', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(crearProveedorSupabase().prepararSubida('u1/r1/a.jpg', 'image/jpeg')).rejects.toThrow(
      /No se pudo preparar la subida/,
    )
    expect(spy).toHaveBeenCalledWith('[almacenamiento]', 'boom')
    spy.mockRestore()
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
    expect(valorParaGuardar(destino)).toBe('https://storage.googleapis.com/maipu-pba/u1/r1/a.jpg')
  })

  test('la lectura de una ruta es la URL pública del bucket', async () => {
    expect(await crearProveedorGcs().urlLectura('u1/r1/a.jpg')).toBe(
      'https://storage.googleapis.com/maipu-pba/u1/r1/a.jpg',
    )
  })

  test('una credencial mal formada da un error claro', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.GCS_SERVICE_ACCOUNT_KEY = 'no-es-json'
    await expect(crearProveedorGcs().prepararSubida('u1/r1/a.jpg', 'image/jpeg')).rejects.toThrow(
      /JSON válido/,
    )
    spy.mockRestore()
  })
})

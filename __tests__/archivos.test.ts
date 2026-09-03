import { describe, expect, test } from 'vitest'
import { rutaEvidencia, validarArchivo } from '@/lib/archivos'

describe('validarArchivo', () => {
  test('acepta jpeg de 5 MB', () => {
    const f = new File([new Uint8Array(5 * 1024 * 1024)], 'foto.jpg', { type: 'image/jpeg' })
    expect(validarArchivo(f)).toBeNull()
  })
  test('rechaza tipo no permitido', () => {
    const f = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    expect(validarArchivo(f)).toMatch(/tipo/i)
  })
  test('rechaza más de 100 MB', () => {
    const f = new File([new Uint8Array(1)], 'v.mp4', { type: 'video/mp4' })
    Object.defineProperty(f, 'size', { value: 101 * 1024 * 1024 })
    expect(validarArchivo(f)).toMatch(/100 MB/)
  })
})

describe('rutaEvidencia', () => {
  test('arma uid/relevamiento/timestamp-nombre sin caracteres raros', () => {
    const r = rutaEvidencia('u1', 'r1', 'mi foto ñ.JPG', 1700000000000)
    expect(r).toBe('u1/r1/1700000000000-mi-foto-n.jpg')
  })
})

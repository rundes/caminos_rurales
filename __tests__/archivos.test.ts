import { describe, expect, test } from 'vitest'
import { rutaEvidencia, validarArchivo } from '@/lib/archivos'

describe('validarArchivo', () => {
  test('acepta jpeg de 5 MB', () => {
    const f = new File([new Uint8Array(5 * 1024 * 1024)], 'foto.jpg', { type: 'image/jpeg' })
    expect(validarArchivo(f)).toBeNull()
  })
  test('acepta video webm', () => {
    const f = new File(['x'], 'clip.webm', { type: 'video/webm' })
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
  test('arma uid/recorrido/timestamp-nombre sin caracteres raros', () => {
    const r = rutaEvidencia('u1', 'r1', 'mi foto ñ.JPG', 1700000000000)
    expect(r).toBe('u1/r1/1700000000000-mi-foto-n.jpg')
  })

  test('con el id de la observación la ruta es determinística', () => {
    const obs = '22222222-2222-4222-8222-222222222222'

    const primera = rutaEvidencia('u1', 'r1', 'foto.jpg', obs)
    const reintento = rutaEvidencia('u1', 'r1', 'foto.jpg', obs)

    expect(primera).toBe(`u1/r1/${obs}-foto.jpg`)
    expect(reintento).toBe(primera)
  })

  test('sin id cae al timestamp, así que dos llamadas difieren', () => {
    const a = rutaEvidencia('u1', 'r1', 'foto.jpg', 1)
    const b = rutaEvidencia('u1', 'r1', 'foto.jpg', 2)

    expect(a).not.toBe(b)
  })
})

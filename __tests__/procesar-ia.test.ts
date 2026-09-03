// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

const RELEVAMIENTO_ID = '7c1f2e40-9b3a-4c5d-8e6f-0a1b2c3d4e5f'

const getUser = vi.fn()
const supabaseFrom = vi.fn()
const relevamientoSingle = vi.fn()
const perfilMaybeSingle = vi.fn()

const crearClienteAdminMock = vi.fn()
const adminFrom = vi.fn()
const claimUpdate = vi.fn()
const claimEq1 = vi.fn()
const claimEq2 = vi.fn()
const claimSelectResultado = vi.fn()
const fallasInsert = vi.fn()
const fallasDelete = vi.fn()
const fallasDeleteEq = vi.fn()
const fallasDeleteResultado = vi.fn()
const caminosUpdate = vi.fn()
const caminosEq = vi.fn()
const caminosResultado = vi.fn()
const resetUpdate = vi.fn()
const resetEq = vi.fn()
const resetResultado = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser },
    from: supabaseFrom,
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  crearClienteAdmin: (...args: unknown[]) => {
    crearClienteAdminMock(...args)
    return { from: adminFrom }
  },
}))

const { POST } = await import('@/app/api/procesar-ia/route')

function crearRequest(cuerpo: unknown): Request {
  return new Request('http://localhost/api/procesar-ia', {
    method: 'POST',
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    headers: { 'Content-Type': 'application/json' },
  })
}

function relevamientoFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: RELEVAMIENTO_ID,
    usuario_id: 'u1',
    camino_id: 'c1',
    procesado_ia: false,
    metadata: { km: 3, archivos: ['u1/r1/a.jpg'] },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

  supabaseFrom.mockImplementation((tabla: string) => {
    if (tabla === 'relevamientos') {
      return { select: () => ({ eq: () => ({ single: relevamientoSingle }) }) }
    }
    if (tabla === 'perfiles') {
      return { select: () => ({ eq: () => ({ maybeSingle: perfilMaybeSingle }) }) }
    }
    throw new Error(`tabla inesperada: ${tabla}`)
  })
  relevamientoSingle.mockResolvedValue({ data: relevamientoFixture(), error: null })
  perfilMaybeSingle.mockResolvedValue({ data: { municipio_id: 'carlos-tejedor' }, error: null })

  adminFrom.mockImplementation((tabla: string) => {
    if (tabla === 'relevamientos') {
      return {
        update: (payload: { procesado_ia: boolean }) => {
          if (payload.procesado_ia === true) {
            claimUpdate(payload)
            return {
              eq: (col: string, val: unknown) => {
                claimEq1(col, val)
                return {
                  eq: (col2: string, val2: unknown) => {
                    claimEq2(col2, val2)
                    return { select: () => claimSelectResultado() }
                  },
                }
              },
            }
          }
          resetUpdate(payload)
          return {
            eq: (col: string, val: unknown) => {
              resetEq(col, val)
              return resetResultado()
            },
          }
        },
      }
    }
    if (tabla === 'fallas_deteccion') {
      return {
        insert: (filas: unknown) => fallasInsert(filas),
        delete: () => {
          fallasDelete()
          return {
            eq: (col: string, val: unknown) => {
              fallasDeleteEq(col, val)
              return fallasDeleteResultado()
            },
          }
        },
      }
    }
    if (tabla === 'caminos') {
      return {
        update: (payload: unknown) => {
          caminosUpdate(payload)
          return {
            eq: (col: string, val: unknown) => {
              caminosEq(col, val)
              return caminosResultado()
            },
          }
        },
      }
    }
    throw new Error(`tabla admin inesperada: ${tabla}`)
  })
  claimSelectResultado.mockReturnValue({ data: [{ id: RELEVAMIENTO_ID }], error: null })
  fallasInsert.mockReturnValue({ error: null })
  fallasDeleteResultado.mockReturnValue({ error: null })
  caminosResultado.mockReturnValue({ error: null })
  resetResultado.mockReturnValue({ error: null })
})

describe('POST /api/procesar-ia', () => {
  test('401 cuando no hay usuario autenticado', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(crearRequest({ relevamiento_id: RELEVAMIENTO_ID }))

    expect(res.status).toBe(401)
    expect(crearClienteAdminMock).not.toHaveBeenCalled()
  })

  test('400 con cuerpo JSON malformado', async () => {
    const res = await POST(crearRequest('{invalido'))

    expect(res.status).toBe(400)
    expect(crearClienteAdminMock).not.toHaveBeenCalled()
  })

  test('400 con relevamiento_id no uuid', async () => {
    const res = await POST(crearRequest({ relevamiento_id: 'no-es-uuid' }))

    expect(res.status).toBe(400)
    expect(crearClienteAdminMock).not.toHaveBeenCalled()
  })

  test('403 cuando el relevamiento no es del usuario', async () => {
    relevamientoSingle.mockResolvedValue({ data: relevamientoFixture({ usuario_id: 'otro' }), error: null })

    const res = await POST(crearRequest({ relevamiento_id: RELEVAMIENTO_ID }))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.ok).toBe(false)
    expect(crearClienteAdminMock).not.toHaveBeenCalled()
  })

  test('409 cuando el pre-check ya indica procesado', async () => {
    relevamientoSingle.mockResolvedValue({ data: relevamientoFixture({ procesado_ia: true }), error: null })

    const res = await POST(crearRequest({ relevamiento_id: RELEVAMIENTO_ID }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({ ok: false, error: 'Ya fue procesado' })
    expect(crearClienteAdminMock).not.toHaveBeenCalled()
  })

  test('409 cuando el reclamo concurrente no afecta filas', async () => {
    claimSelectResultado.mockReturnValue({ data: [], error: null })

    const res = await POST(crearRequest({ relevamiento_id: RELEVAMIENTO_ID }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({ ok: false, error: 'Ya fue procesado' })
    expect(fallasInsert).not.toHaveBeenCalled()
  })

  test('camino feliz: reclama, inserta fallas y actualiza el camino', async () => {
    const res = await POST(crearRequest({ relevamiento_id: RELEVAMIENTO_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(claimUpdate).toHaveBeenCalledWith({ procesado_ia: true })
    expect(claimEq1).toHaveBeenCalledWith('id', RELEVAMIENTO_ID)
    expect(claimEq2).toHaveBeenCalledWith('procesado_ia', false)

    expect(fallasInsert).toHaveBeenCalledTimes(1)
    const filas = fallasInsert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(filas.length).toBeGreaterThanOrEqual(2)
    expect(filas.length).toBeLessThanOrEqual(6)
    for (const fila of filas) {
      expect(fila.relevamiento_id).toBe(RELEVAMIENTO_ID)
      expect(fila.url_evidencia_imagen).toBe('u1/r1/a.jpg')
    }

    expect(caminosUpdate).toHaveBeenCalledTimes(1)
    const payload = caminosUpdate.mock.calls[0][0] as { estado_general: string; ultima_actualizacion: string }
    expect(['bueno', 'regular', 'malo', 'intransitable']).toContain(payload.estado_general)
    expect(typeof payload.ultima_actualizacion).toBe('string')
    expect(caminosEq).toHaveBeenCalledWith('id', 'c1')

    expect(body.ok).toBe(true)
    expect(body.fallas).toBe(filas.length)
  })

  test('500 oculta el mensaje de la base y revierte procesado_ia', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fallasInsert.mockReturnValue({ error: { message: 'boom' } })

    const res = await POST(crearRequest({ relevamiento_id: RELEVAMIENTO_ID }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(body.error).not.toContain('boom')
    expect(spy).toHaveBeenCalled()
    expect(resetUpdate).toHaveBeenCalledWith({ procesado_ia: false })
    expect(resetEq).toHaveBeenCalledWith('id', RELEVAMIENTO_ID)

    spy.mockRestore()
  })

  test('500 cuando falla la actualización del camino: borra las fallas insertadas y revierte procesado_ia', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    caminosResultado.mockReturnValue({ error: { message: 'boom' } })

    const res = await POST(crearRequest({ relevamiento_id: RELEVAMIENTO_ID }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(body.error).not.toContain('boom')
    expect(spy).toHaveBeenCalled()

    expect(fallasInsert).toHaveBeenCalledTimes(1)
    expect(fallasDelete).toHaveBeenCalledTimes(1)
    expect(fallasDeleteEq).toHaveBeenCalledWith('relevamiento_id', RELEVAMIENTO_ID)

    expect(resetUpdate).toHaveBeenCalledWith({ procesado_ia: false })
    expect(resetEq).toHaveBeenCalledWith('id', RELEVAMIENTO_ID)

    spy.mockRestore()
  })
})

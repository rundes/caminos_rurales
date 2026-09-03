// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

type Fila = Record<string, unknown>
type Resultado = { data: Fila[] | Fila | null; error: { message: string } | null }
type Operacion = { metodo: string; args: unknown[] }
type Escritura = { cliente: 'usuario' | 'admin'; tabla: string; filas: unknown; opciones?: unknown }

interface Consulta extends PromiseLike<Resultado> {
  select(...args: unknown[]): Consulta
  eq(...args: unknown[]): Consulta
  in(...args: unknown[]): Consulta
  gte(...args: unknown[]): Consulta
  limit(...args: unknown[]): Consulta
  maybeSingle(): Promise<Resultado>
  insert(filas: unknown): Promise<{ error: null }>
  upsert(filas: unknown, opciones?: unknown): Promise<{ error: null }>
}

/** Filas que devuelve cada consulta; se ajustan por test. */
const db = {
  perfil: { municipio_id: 'maipu' } as Fila | null,
  recorridoExistente: null as Fila | null,
  tramos: [] as Fila[],
  coberturaPrevia: [] as Fila[],
  coberturaRecienteUsuario: [] as Fila[],
  coberturaDelRecorrido: [] as Fila[],
  coberturaDeEsosTramos: [] as Fila[],
  puntosDelRecorrido: [] as Fila[],
  recorridosDelUsuario: [] as Fila[],
  logrosDelUsuario: [] as Fila[],
  coberturaMunicipio: [] as Fila[],
}

const escrituras: Escritura[] = []
const tablasUsuario: string[] = []
const tablasAdmin: string[] = []

function columnas(ops: Operacion[]): string {
  return String(ops.find((o) => o.metodo === 'select')?.args[0] ?? '')
}

function tieneMetodo(ops: Operacion[], metodo: string): boolean {
  return ops.some((o) => o.metodo === metodo)
}

function resolver(tabla: string, ops: Operacion[]): Resultado {
  const cols = columnas(ops)
  if (tabla === 'perfiles') return { data: db.perfil, error: null }
  if (tabla === 'tramos') return { data: db.tramos, error: null }
  if (tabla === 'recorridos' && cols.includes('usuario_id')) {
    return { data: db.recorridoExistente, error: null }
  }
  if (tabla === 'recorridos') return { data: db.recorridosDelUsuario, error: null }
  if (tabla === 'cobertura_tramos' && cols.includes('created_at')) {
    return { data: db.coberturaDeEsosTramos, error: null }
  }
  if (tabla === 'cobertura_tramos' && tieneMetodo(ops, 'gte')) {
    return { data: db.coberturaRecienteUsuario, error: null }
  }
  if (tabla === 'cobertura_tramos' && tieneMetodo(ops, 'in')) {
    return { data: db.coberturaPrevia, error: null }
  }
  if (tabla === 'cobertura_tramos') return { data: db.coberturaDelRecorrido, error: null }
  if (tabla === 'puntos_eventos') return { data: db.puntosDelRecorrido, error: null }
  if (tabla === 'logros') return { data: db.logrosDelUsuario, error: null }
  throw new Error(`Consulta no prevista: ${tabla} ${cols}`)
}

function crearTabla(cliente: 'usuario' | 'admin', tabla: string): Consulta {
  const ops: Operacion[] = []
  const registrar = (metodo: string, args: unknown[]): Consulta => {
    ops.push({ metodo, args })
    return consulta
  }
  const consulta: Consulta = {
    select: (...args) => registrar('select', args),
    eq: (...args) => registrar('eq', args),
    in: (...args) => registrar('in', args),
    gte: (...args) => registrar('gte', args),
    limit: (...args) => registrar('limit', args),
    maybeSingle: async () => resolver(tabla, ops),
    insert: async (filas) => {
      escrituras.push({ cliente, tabla, filas })
      return { error: null }
    },
    upsert: async (filas, opciones) => {
      escrituras.push({ cliente, tabla, filas, opciones })
      return { error: null }
    },
    then: (cumplir, rechazar) => Promise.resolve(resolver(tabla, ops)).then(cumplir, rechazar),
  }
  return consulta
}

const getUser = vi.fn()
const rpc = vi.fn(async () => ({ data: db.coberturaMunicipio, error: null }))

const clienteUsuario = {
  auth: { getUser },
  rpc,
  from: (tabla: string) => {
    tablasUsuario.push(tabla)
    return crearTabla('usuario', tabla)
  },
}

const crearClienteAdmin = vi.fn(() => ({
  from: (tabla: string) => {
    tablasAdmin.push(tabla)
    return crearTabla('admin', tabla)
  },
}))

vi.mock('@/lib/supabase/server', () => ({ crearClienteServidor: async () => clienteUsuario }))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const prepararSubidaProveedor = vi.fn()
vi.mock('@/lib/almacenamiento', () => ({
  obtenerProveedor: () => ({ prepararSubida: prepararSubidaProveedor, urlLectura: vi.fn() }),
}))

const { finalizarRecorrido, prepararSubida } = await import('@/app/dashboard/recorrido/actions')

const ID_RECORRIDO = 'aaaaaaaa-0000-4000-8000-000000000001'
const ID_OBSERVACION = 'bbbbbbbb-0000-4000-8000-000000000002'

/** Tramo recto de ~1,1 km sobre el ecuador; el track corre encima. */
const TRAMO_CUBIERTO: Fila = {
  id: 'w1',
  km: 2,
  localidad: 'Segurola',
  geometria: [
    [0, 0],
    [0.01, 0],
  ],
}
const TRAMO_LEJANO: Fila = {
  id: 'w2',
  km: 3,
  localidad: 'Segurola',
  geometria: [
    [0, 1],
    [0.01, 1],
  ],
}

function trackSobreElTramo(): [number, number][] {
  return Array.from({ length: 21 }, (_, i) => [0, i * 0.0005] as [number, number])
}

function payload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID_RECORRIDO,
    inicio: '2026-09-03T10:00:00.000Z',
    fin: '2026-09-03T11:00:00.000Z',
    puntosGps: 120,
    track: trackSobreElTramo(),
    observaciones: [],
    ...extra,
  }
}

function escrituraDe(tabla: string): Escritura | undefined {
  return escrituras.find((e) => e.tabla === tabla)
}

beforeEach(() => {
  vi.clearAllMocks()
  escrituras.length = 0
  tablasUsuario.length = 0
  tablasAdmin.length = 0
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  db.perfil = { municipio_id: 'maipu' }
  db.recorridoExistente = null
  db.tramos = [TRAMO_CUBIERTO, TRAMO_LEJANO]
  db.coberturaPrevia = []
  db.coberturaRecienteUsuario = []
  db.coberturaDelRecorrido = []
  db.coberturaDeEsosTramos = []
  db.puntosDelRecorrido = []
  db.recorridosDelUsuario = [{ km: 1.2 }]
  db.logrosDelUsuario = []
  db.coberturaMunicipio = [
    { localidad: 'Segurola', tramos: 2, cubiertos: 1, km: 5, km_cubiertos: 2 },
  ]
})

describe('finalizarRecorrido', () => {
  test('cubre el tramo recorrido, otorga puntos e insignias y devuelve el resumen', async () => {
    const r = await finalizarRecorrido(payload())

    expect(r).toEqual({
      ok: true,
      data: {
        km: expect.any(Number),
        tramosNuevos: 1,
        tramosRepetidos: 0,
        puntos: 20,
        insignias: ['primer_recorrido'],
        coberturaMunicipio: 0.4,
      },
    })

    const recorrido = escrituraDe('recorridos')
    expect(recorrido?.cliente).toBe('usuario')
    expect(recorrido?.filas).toMatchObject({
      id: ID_RECORRIDO,
      usuario_id: 'u1',
      municipio: 'maipu',
      puntos_gps: 120,
      estado: 'finalizado',
    })

    expect(escrituraDe('cobertura_tramos')).toEqual({
      cliente: 'admin',
      tabla: 'cobertura_tramos',
      filas: [{ tramo_id: 'w1', recorrido_id: ID_RECORRIDO, usuario_id: 'u1' }],
      opciones: { onConflict: 'tramo_id,recorrido_id', ignoreDuplicates: true },
    })
  })

  test('marca como repetido un tramo que ya tenía cobertura previa', async () => {
    db.coberturaPrevia = [{ tramo_id: 'w1' }]
    const r = await finalizarRecorrido(payload())
    expect(r.ok && r.data.tramosNuevos).toBe(0)
    expect(r.ok && r.data.tramosRepetidos).toBe(1)
    // 2 km repetidos * 2 puntos
    expect(r.ok && r.data.puntos).toBe(4)
  })

  test('anti-farmeo: un tramo repetido cubierto por el mismo usuario hace 1 hora no da puntos', async () => {
    db.coberturaPrevia = [{ tramo_id: 'w1' }]
    db.coberturaRecienteUsuario = [{ tramo_id: 'w1' }]
    const r = await finalizarRecorrido(payload())
    expect(r.ok && r.data.tramosNuevos).toBe(0)
    // sigue contando como repetido a efectos informativos...
    expect(r.ok && r.data.tramosRepetidos).toBe(1)
    // ...pero no otorga puntos porque el usuario lo cubrió hace menos de 24 h
    expect(r.ok && r.data.puntos).toBe(0)
    expect(escrituraDe('puntos_eventos')).toBeUndefined()
    // igual se registra la cobertura del tramo para este recorrido
    expect(escrituraDe('cobertura_tramos')).toMatchObject({
      filas: [{ tramo_id: 'w1', recorrido_id: ID_RECORRIDO, usuario_id: 'u1' }],
    })
  })

  test('anti-farmeo: un tramo repetido cubierto por el mismo usuario hace 2 días sí da puntos', async () => {
    db.coberturaPrevia = [{ tramo_id: 'w1' }]
    db.coberturaRecienteUsuario = []
    const r = await finalizarRecorrido(payload())
    expect(r.ok && r.data.tramosRepetidos).toBe(1)
    // 2 km repetidos * 2 puntos, igual que un repetido sin restricción reciente
    expect(r.ok && r.data.puntos).toBe(4)
  })

  test('puntos y logros se escriben solo con el cliente admin', async () => {
    await finalizarRecorrido(payload())
    expect(escrituraDe('puntos_eventos')).toMatchObject({
      cliente: 'admin',
      filas: [{ usuario_id: 'u1', municipio: 'maipu', recorrido_id: ID_RECORRIDO, motivo: 'km_nuevos', puntos: 20 }],
    })
    expect(escrituraDe('logros')).toEqual({
      cliente: 'admin',
      tabla: 'logros',
      filas: [{ usuario_id: 'u1', codigo: 'primer_recorrido' }],
      opciones: { onConflict: 'usuario_id,codigo', ignoreDuplicates: true },
    })
    expect(tablasUsuario).not.toContain('puntos_eventos')
    expect(tablasUsuario).not.toContain('logros')
    expect(tablasUsuario).not.toContain('cobertura_tramos')
  })

  test('inserta las observaciones con el cliente del usuario y la columna de evidencia correcta', async () => {
    const r = await finalizarRecorrido(
      payload({
        observaciones: [
          {
            id: ID_OBSERVACION,
            tipo_falla: 'bache',
            severidad: 'alta',
            latitud: 0,
            longitud: 0.005,
            descripcion: 'Bache profundo',
            evidencia: { ruta: 'u1/r1/foto.jpg', tipo: 'imagen' },
          },
          {
            id: 'cccccccc-0000-4000-8000-000000000003',
            tipo_falla: 'otro',
            severidad: 'baja',
            latitud: 0,
            longitud: 0.006,
            evidencia: { ruta: 'u1/r1/clip.mp4', tipo: 'video' },
          },
        ],
      }),
    )

    const fallas = escrituraDe('fallas_deteccion')
    expect(fallas?.cliente).toBe('usuario')
    expect(fallas?.filas).toEqual([
      {
        id: ID_OBSERVACION,
        recorrido_id: ID_RECORRIDO,
        tipo_falla: 'bache',
        severidad: 'alta',
        latitud: 0,
        longitud: 0.005,
        descripcion: 'Bache profundo',
        url_evidencia_imagen: 'u1/r1/foto.jpg',
        url_evidencia_video: null,
      },
      {
        id: 'cccccccc-0000-4000-8000-000000000003',
        recorrido_id: ID_RECORRIDO,
        tipo_falla: 'otro',
        severidad: 'baja',
        latitud: 0,
        longitud: 0.006,
        descripcion: null,
        url_evidencia_imagen: null,
        url_evidencia_video: 'u1/r1/clip.mp4',
      },
    ])
    // 20 por km nuevos + 5 por cada observación con evidencia
    expect(r.ok && r.data.puntos).toBe(30)
  })

  test('es idempotente: si el recorrido ya existe recalcula el resumen sin escribir', async () => {
    db.recorridoExistente = { id: ID_RECORRIDO, usuario_id: 'u1', km: 4.2 }
    db.coberturaDelRecorrido = [{ tramo_id: 'w1' }]
    db.coberturaDeEsosTramos = [
      { tramo_id: 'w1', recorrido_id: ID_RECORRIDO, created_at: '2026-09-03T11:00:00Z' },
    ]
    db.puntosDelRecorrido = [{ puntos: 20 }, { puntos: 5 }]

    const r = await finalizarRecorrido(payload())

    expect(r).toEqual({
      ok: true,
      data: {
        km: 4.2,
        tramosNuevos: 1,
        tramosRepetidos: 0,
        puntos: 25,
        insignias: [],
        coberturaMunicipio: 0.4,
      },
    })
    expect(escrituras).toEqual([])
  })

  test('rechaza un recorrido con el mismo id de otra persona', async () => {
    db.recorridoExistente = { id: ID_RECORRIDO, usuario_id: 'u2', km: 4.2 }
    const r = await finalizarRecorrido(payload())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/otra persona/i) })
    expect(escrituras).toEqual([])
  })

  test('datos inválidos: no crea el cliente admin ni escribe nada', async () => {
    const r = await finalizarRecorrido(payload({ track: [[0, 0]] }))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/al menos 2 puntos/i) })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
    expect(escrituras).toEqual([])
    expect(tablasUsuario).toEqual([])
  })

  test('rechaza un recorrido que termina antes de empezar', async () => {
    const r = await finalizarRecorrido(payload({ fin: '2026-09-03T09:00:00.000Z' }))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/anterior al inicio/i) })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  test('sin sesión no escribe nada', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const r = await finalizarRecorrido(payload())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sesión/i) })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  test('sin perfil devuelve error de partido y no escribe', async () => {
    db.perfil = null
    const r = await finalizarRecorrido(payload())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/partido/i) })
    expect(escrituras).toEqual([])
  })
})

describe('prepararSubida', () => {
  const DESTINO = {
    urlSubida: 'https://sb.co/subir',
    metodo: 'PUT' as const,
    headers: { 'content-type': 'image/jpeg' },
    urlLectura: 'u1/r1/foto.jpg',
    ruta: 'u1/r1/foto.jpg',
  }

  test('devuelve el destino del proveedor para una ruta bajo el usuario', async () => {
    prepararSubidaProveedor.mockResolvedValue(DESTINO)
    const r = await prepararSubida(ID_RECORRIDO, 'Foto Bache.JPG', 'image/jpeg')
    expect(r).toEqual({ ok: true, data: DESTINO })
    const [ruta, contentType] = prepararSubidaProveedor.mock.calls[0]
    expect(ruta).toMatch(new RegExp(`^u1/${ID_RECORRIDO}/\\d+-foto-bache.jpg$`))
    expect(contentType).toBe('image/jpeg')
  })

  test('rechaza tipos de archivo no permitidos', async () => {
    const r = await prepararSubida(ID_RECORRIDO, 'malicioso.exe', 'application/x-msdownload')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/tipo de archivo/i) })
    expect(prepararSubidaProveedor).not.toHaveBeenCalled()
  })

  test('rechaza un id de recorrido que no es uuid', async () => {
    const r = await prepararSubida('no-uuid', 'foto.jpg', 'image/jpeg')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/identificador/i) })
    expect(prepararSubidaProveedor).not.toHaveBeenCalled()
  })

  test('sin sesión no pide URL firmada', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const r = await prepararSubida(ID_RECORRIDO, 'foto.jpg', 'image/jpeg')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sesión/i) })
    expect(prepararSubidaProveedor).not.toHaveBeenCalled()
  })

  test('un fallo del proveedor devuelve mensaje genérico y lo registra', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    prepararSubidaProveedor.mockRejectedValue(new Error('sin credenciales'))
    const r = await prepararSubida(ID_RECORRIDO, 'foto.jpg', 'image/jpeg')
    expect(r).toEqual({ ok: false, error: 'No se pudo preparar la subida de la evidencia.' })
    expect(spy).toHaveBeenCalledWith('[recorrido]', expect.any(Error))
    spy.mockRestore()
  })
})

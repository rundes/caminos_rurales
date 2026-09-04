// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

type Fila = Record<string, unknown>
type ErrorSupabase = { message: string; code?: string }
type Resultado = { data: Fila[] | Fila | null; count?: number; error: ErrorSupabase | null }
type Operacion = { metodo: string; args: unknown[] }
type Escritura = { cliente: 'usuario' | 'admin'; tabla: string; filas: unknown; opciones?: unknown }
type Mutacion = {
  cliente: 'usuario' | 'admin'
  tabla: string
  tipo: 'delete' | 'update'
  valores?: unknown
  filtros: unknown[][]
}

interface Consulta extends PromiseLike<Resultado> {
  select(...args: unknown[]): Consulta
  eq(...args: unknown[]): Consulta
  in(...args: unknown[]): Consulta
  gte(...args: unknown[]): Consulta
  order(...args: unknown[]): Consulta
  limit(...args: unknown[]): Consulta
  delete(): Consulta
  update(valores: unknown): Consulta
  maybeSingle(): Promise<Resultado>
  insert(filas: unknown): Promise<{ error: ErrorSupabase | null }>
  upsert(filas: unknown, opciones?: unknown): Promise<{ error: ErrorSupabase | null }>
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
  puntosDelDia: [] as Fila[],
  recorridosDelUsuario: [] as Fila[],
  logrosDelUsuario: [] as Fila[],
  coberturaMunicipio: [] as Fila[],
  muestrasDelRecorrido: [] as Fila[],
  fallasSensorDelRecorrido: [] as Fila[],
  /** Cuadros ya guardados del recorrido (los cuenta `select ... head: true`). */
  cuadrosDelRecorrido: 0,
  /** `t` de los cuadros ya guardados, para el chequeo de plausibilidad (`select t`). */
  cuadrosExistentesT: [] as string[],
}

const escrituras: Escritura[] = []
const mutaciones: Mutacion[] = []
const tablasUsuario: string[] = []
const tablasAdmin: string[] = []
/** Error que devuelve el `insert` de una tabla, por test. */
const erroresInsert: Record<string, ErrorSupabase | undefined> = {}
/** Efecto colateral al insertar en una tabla (para simular carreras). */
const alInsertar: Record<string, (() => void) | undefined> = {}

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
  if (tabla === 'puntos_eventos' && tieneMetodo(ops, 'gte')) {
    return { data: db.puntosDelDia, error: null }
  }
  if (tabla === 'puntos_eventos') return { data: db.puntosDelRecorrido, error: null }
  if (tabla === 'logros') return { data: db.logrosDelUsuario, error: null }
  if (tabla === 'muestras_sensor') return { data: db.muestrasDelRecorrido, error: null }
  if (tabla === 'fallas_deteccion') return { data: db.fallasSensorDelRecorrido, error: null }
  // `guardarCuadros` lee `select('t')` para el chequeo de plausibilidad...
  if (tabla === 'cuadros' && cols === 't') {
    return { data: db.cuadrosExistentesT.map((t) => ({ t })), error: null }
  }
  // ...y `recalcularPuntosCuadros` los cuenta con `head: true`.
  if (tabla === 'cuadros') return { data: null, count: db.cuadrosDelRecorrido, error: null }
  throw new Error(`Consulta no prevista: ${tabla} ${cols}`)
}

/** `delete()`/`update()` se registran como mutaciones y no devuelven filas. */
function resolverConsulta(cliente: 'usuario' | 'admin', tabla: string, ops: Operacion[]): Resultado {
  const mutacion = ops.find((o) => o.metodo === 'delete' || o.metodo === 'update')
  if (mutacion) {
    mutaciones.push({
      cliente,
      tabla,
      tipo: mutacion.metodo as 'delete' | 'update',
      valores: mutacion.args[0],
      filtros: ops.filter((o) => o.metodo === 'eq').map((o) => o.args),
    })
    return { data: null, error: null }
  }
  return resolver(tabla, ops)
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
    order: (...args) => registrar('order', args),
    limit: (...args) => registrar('limit', args),
    delete: () => registrar('delete', []),
    update: (valores) => registrar('update', [valores]),
    maybeSingle: async () => resolver(tabla, ops),
    insert: async (filas) => {
      escrituras.push({ cliente, tabla, filas })
      alInsertar[tabla]?.()
      return { error: erroresInsert[tabla] ?? null }
    },
    upsert: async (filas, opciones) => {
      escrituras.push({ cliente, tabla, filas, opciones })
      return { error: erroresInsert[tabla] ?? null }
    },
    then: (cumplir, rechazar) =>
      Promise.resolve(resolverConsulta(cliente, tabla, ops)).then(cumplir, rechazar),
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

const { finalizarRecorrido, prepararSubida, registrarCuadros } = await import(
  '@/app/dashboard/recorrido/actions',
)

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

const SIN_SENSORES = { sin_dato: 0, bueno: 0, regular: 0, malo: 0, intransitable: 0 }

/** Muestra sobre el tramo w1 (lat 0, lng 0..0.01), a `lng` del origen. */
function muestra(lng: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    t: 1_756_900_000_000,
    lat: 0,
    lng,
    velocidadKmh: 40,
    rumbo: 90,
    altitud: 12,
    rmsVertical: 0.5,
    picoVertical: 2,
    frenadas: 0,
    laterales: 0,
    muestras: 200,
    calidad: 'bueno',
    ...extra,
  }
}

function escrituraDe(tabla: string): Escritura | undefined {
  return escrituras.find((e) => e.tabla === tabla)
}

function escriturasDe(tabla: string): Escritura[] {
  return escrituras.filter((e) => e.tabla === tabla)
}

function mutacionesDe(tabla: string, tipo: 'delete' | 'update'): Mutacion[] {
  return mutaciones.filter((m) => m.tabla === tabla && m.tipo === tipo)
}

function mutacionDe(tabla: string, tipo: 'delete' | 'update'): Mutacion | undefined {
  return mutaciones.find((m) => m.tabla === tabla && m.tipo === tipo)
}

beforeEach(() => {
  vi.clearAllMocks()
  escrituras.length = 0
  mutaciones.length = 0
  tablasUsuario.length = 0
  tablasAdmin.length = 0
  delete erroresInsert.recorridos
  delete alInsertar.recorridos
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  db.perfil = { municipio_id: 'maipu' }
  db.recorridoExistente = null
  db.tramos = [TRAMO_CUBIERTO, TRAMO_LEJANO]
  db.coberturaPrevia = []
  db.coberturaRecienteUsuario = []
  db.coberturaDelRecorrido = []
  db.coberturaDeEsosTramos = []
  db.puntosDelRecorrido = []
  db.puntosDelDia = []
  db.recorridosDelUsuario = [{ km: 1.2 }]
  db.logrosDelUsuario = []
  db.muestrasDelRecorrido = []
  db.fallasSensorDelRecorrido = []
  db.cuadrosDelRecorrido = 0
  db.cuadrosExistentesT = []
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
        kmPorCalidad: SIN_SENSORES,
        impactos: 0,
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

  test('reentrega de un recorrido ya procesado: recalcula el resumen sin escribir', async () => {
    db.recorridoExistente = {
      id: ID_RECORRIDO,
      usuario_id: 'u1',
      km: 4.2,
      procesado_at: '2026-09-03T11:05:00Z',
    }
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
        kmPorCalidad: SIN_SENSORES,
        impactos: 0,
      },
    })
    expect(escrituras).toEqual([])
    expect(mutaciones).toEqual([])
  })

  test('reentrega de un recorrido a medias (procesado_at null): reprocesa y lo sella', async () => {
    db.recorridoExistente = { id: ID_RECORRIDO, usuario_id: 'u1', km: 4.2, procesado_at: null }

    const r = await finalizarRecorrido(payload())

    // usa los km ya guardados y no vuelve a insertar el recorrido
    expect(r.ok && r.data.km).toBe(4.2)
    expect(escrituraDe('recorridos')).toBeUndefined()
    expect(escrituraDe('cobertura_tramos')).toMatchObject({
      filas: [{ tramo_id: 'w1', recorrido_id: ID_RECORRIDO, usuario_id: 'u1' }],
    })
    expect(escrituraDe('puntos_eventos')).toBeDefined()
    // idempotencia: borra los eventos previos de este recorrido antes de insertar
    expect(mutacionDe('puntos_eventos', 'delete')).toMatchObject({
      cliente: 'admin',
      filtros: [['recorrido_id', ID_RECORRIDO]],
    })
    // sello final
    expect(mutacionDe('recorridos', 'update')).toMatchObject({
      cliente: 'admin',
      valores: { procesado_at: expect.any(String) },
      filtros: [['id', ID_RECORRIDO]],
    })
  })

  test('carrera de insercion: un 23505 se trata como recorrido existente', async () => {
    erroresInsert.recorridos = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    }
    alInsertar.recorridos = () => {
      db.recorridoExistente = { id: ID_RECORRIDO, usuario_id: 'u1', km: 4.2, procesado_at: null }
    }

    const r = await finalizarRecorrido(payload())

    expect(r.ok).toBe(true)
    expect(r.ok && r.data.km).toBe(4.2)
    expect(mutacionDe('recorridos', 'update')).toBeDefined()
  })

  test('carrera de insercion con la fila ya procesada: devuelve el resumen guardado', async () => {
    erroresInsert.recorridos = { code: '23505', message: 'duplicate key' }
    alInsertar.recorridos = () => {
      db.recorridoExistente = {
        id: ID_RECORRIDO,
        usuario_id: 'u1',
        km: 4.2,
        procesado_at: '2026-09-03T11:05:00Z',
      }
    }
    db.puntosDelRecorrido = [{ puntos: 7 }]

    const r = await finalizarRecorrido(payload())

    expect(r.ok && r.data.puntos).toBe(7)
    expect(escrituraDe('cobertura_tramos')).toBeUndefined()
    expect(mutacionDe('recorridos', 'update')).toBeUndefined()
  })

  test('un error de insercion que no es 23505 devuelve el error generico', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    erroresInsert.recorridos = { code: '23503', message: 'foreign key violation' }
    const r = await finalizarRecorrido(payload())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no se pudo guardar/i) })
    spy.mockRestore()
  })

  test('tope diario: trunca los puntos que exceden el maximo de 24 h', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.puntosDelDia = [{ puntos: 1990 }, { puntos: 5 }]

    const r = await finalizarRecorrido(payload())

    // el recorrido valia 20 puntos, pero solo quedan 5 disponibles en el dia
    expect(r.ok && r.data.puntos).toBe(5)
    expect(escrituraDe('puntos_eventos')).toMatchObject({
      filas: [{ motivo: 'km_nuevos', puntos: 5 }],
    })
    expect(spy).toHaveBeenCalledWith(
      '[recorrido] tope diario de puntos alcanzado',
      expect.anything(),
    )
    spy.mockRestore()
  })

  test('tope diario agotado: no inserta eventos de puntos', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.puntosDelDia = [{ puntos: 2000 }]

    const r = await finalizarRecorrido(payload())

    expect(r.ok && r.data.puntos).toBe(0)
    expect(escrituraDe('puntos_eventos')).toBeUndefined()
    spy.mockRestore()
  })

  test('rechaza un recorrido implausible sin escribir ni crear el cliente admin', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // ~1113 km en una hora: velocidad media y km fuera de todo rango
    const r = await finalizarRecorrido(
      payload({
        track: [
          [0, 0],
          [0, 10],
        ],
      }),
    )

    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no pudo validarse/i), definitivo: true })
    expect(spy).toHaveBeenCalledWith(
      '[recorrido] implausible',
      expect.arrayContaining([expect.any(String)]),
    )
    expect(crearClienteAdmin).not.toHaveBeenCalled()
    expect(escrituras).toEqual([])
    expect(mutaciones).toEqual([])
    expect(tablasUsuario).toEqual([])
    spy.mockRestore()
  })

  test('rechaza un recorrido con saltos imposibles entre puntos crudos', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const r = await finalizarRecorrido(
      payload({
        puntos: [
          { lat: 0, lng: 0, t: 1756900000000, precision: 8 },
          { lat: 0, lng: 0.02, t: 1756900010000, precision: 8 }, // ~2,2 km en 10 s
        ],
      }),
    )

    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no pudo validarse/i), definitivo: true })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  test('acepta puntos crudos plausibles', async () => {
    const r = await finalizarRecorrido(
      payload({
        puntos: [
          { lat: 0, lng: 0, t: 1756900000000, precision: 8 },
          { lat: 0, lng: 0.005, t: 1756900060000, precision: 12 },
        ],
      }),
    )
    expect(r.ok).toBe(true)
  })

  test('rechaza un recorrido con el mismo id de otra persona', async () => {
    db.recorridoExistente = { id: ID_RECORRIDO, usuario_id: 'u2', km: 4.2, procesado_at: null }
    const r = await finalizarRecorrido(payload())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/otra persona/i), definitivo: true })
    expect(escrituras).toEqual([])
  })

  test('datos inválidos: no crea el cliente admin ni escribe nada', async () => {
    const r = await finalizarRecorrido(payload({ track: [[0, 0]] }))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/al menos 2 puntos/i), definitivo: true })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
    expect(escrituras).toEqual([])
    expect(tablasUsuario).toEqual([])
  })

  test('rechaza un recorrido que termina antes de empezar', async () => {
    const r = await finalizarRecorrido(payload({ fin: '2026-09-03T09:00:00.000Z' }))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/anterior al inicio/i), definitivo: true })
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

  test('guarda las muestras de sensores con el cliente del usuario y el tramo asignado', async () => {
    const r = await finalizarRecorrido(
      payload({
        muestras: [0, 0.002, 0.004, 0.006, 0.008, 0.01].map((lng) => muestra(lng)),
      }),
    )

    const filas = escrituraDe('muestras_sensor')
    expect(filas?.cliente).toBe('usuario')
    expect(filas?.filas).toHaveLength(6)
    expect((filas?.filas as Fila[])[1]).toEqual({
      recorrido_id: ID_RECORRIDO,
      usuario_id: 'u1',
      tramo_id: 'w1',
      t: new Date(1_756_900_000_000).toISOString(),
      latitud: 0,
      longitud: 0.002,
      velocidad_kmh: 40,
      rumbo: 90,
      altitud: 12,
      rms_vertical: 0.5,
      pico_vertical: 2,
      frenadas: 0,
      laterales: 0,
      muestras: 200,
      calidad: 'bueno',
    })
    // todas caen sobre el tramo w1, que corre por debajo del track
    expect((filas?.filas as Fila[]).every((f) => f.tramo_id === 'w1')).toBe(true)
    expect(r.ok && r.data.kmPorCalidad.bueno).toBeCloseTo(1.112, 3)
    expect(r.ok && r.data.impactos).toBe(0)
  })

  test('una muestra lejos de todo tramo se guarda igual, con tramo_id null', async () => {
    await finalizarRecorrido(
      payload({ muestras: [muestra(0), muestra(5, { lat: 5, calidad: 'sin_dato' })] }),
    )

    const filas = escrituraDe('muestras_sensor')?.filas as Fila[]
    expect(filas[0].tramo_id).toBe('w1')
    expect(filas[1].tramo_id).toBeNull()
  })

  test('registra los impactos como observaciones de origen sensor', async () => {
    const r = await finalizarRecorrido(
      payload({
        impactos: [
          { t: 1_756_900_000_000, lat: 0, lng: 0.003, pico: 10, velocidadKmh: 40 },
          { t: 1_756_900_010_000, lat: 0, lng: 0.006, pico: 14.2, velocidadKmh: 33.4 },
        ],
      }),
    )

    const fallas = escrituraDe('fallas_deteccion')
    expect(fallas?.cliente).toBe('usuario')
    expect(fallas?.filas).toEqual([
      {
        recorrido_id: ID_RECORRIDO,
        tipo_falla: 'bache',
        severidad: 'media',
        latitud: 0,
        longitud: 0.003,
        descripcion: 'Impacto detectado: 10.0 m/s² a 40 km/h',
        origen: 'sensor',
        magnitud: 10,
        tramo_id: 'w1',
      },
      {
        recorrido_id: ID_RECORRIDO,
        tipo_falla: 'bache',
        severidad: 'alta',
        latitud: 0,
        longitud: 0.006,
        descripcion: 'Impacto detectado: 14.2 m/s² a 33 km/h',
        origen: 'sensor',
        magnitud: 14.2,
        tramo_id: 'w1',
      },
    ])
    expect(r.ok && r.data.impactos).toBe(2)
  })

  test('km_sensor: suma puntos cuando los sensores cubren al menos la mitad del recorrido', async () => {
    const r = await finalizarRecorrido(
      payload({ muestras: [0, 0.002, 0.004, 0.006, 0.008, 0.01].map((lng) => muestra(lng)) }),
    )

    // 20 por km nuevos + 1 por el km recorrido con sensores
    expect(r.ok && r.data.puntos).toBe(21)
    expect(escrituraDe('puntos_eventos')?.filas).toEqual([
      expect.objectContaining({ motivo: 'km_nuevos', puntos: 20 }),
      expect.objectContaining({ motivo: 'km_sensor', puntos: 1 }),
    ])
  })

  test('km_sensor: no suma puntos si los sensores cubren menos de la mitad del recorrido', async () => {
    const r = await finalizarRecorrido(payload({ muestras: [muestra(0), muestra(0.002)] }))

    expect(r.ok && r.data.puntos).toBe(20)
    expect(escrituraDe('puntos_eventos')?.filas).toEqual([
      expect.objectContaining({ motivo: 'km_nuevos' }),
    ])
  })

  test('los segmentos sin calidad estimada no cuentan para el premio por sensores', async () => {
    const r = await finalizarRecorrido(
      payload({
        muestras: [0, 0.002, 0.004, 0.006, 0.008, 0.01].map((lng) =>
          muestra(lng, { calidad: 'sin_dato', velocidadKmh: 5 }),
        ),
      }),
    )

    expect(r.ok && r.data.puntos).toBe(20)
    // los km se registran igual, pero como "sin datos"
    expect(r.ok && r.data.kmPorCalidad.bueno).toBe(0)
    expect(r.ok && r.data.kmPorCalidad.sin_dato).toBeCloseTo(1.112, 3)
  })

  test('reprocesar borra las muestras y las observaciones de sensor previas antes de reinsertar', async () => {
    db.recorridoExistente = { id: ID_RECORRIDO, usuario_id: 'u1', km: 4.2, procesado_at: null }

    await finalizarRecorrido(
      payload({
        muestras: [muestra(0), muestra(0.002)],
        impactos: [{ t: 1_756_900_000_000, lat: 0, lng: 0.003, pico: 7, velocidadKmh: 30 }],
      }),
    )

    expect(mutacionDe('muestras_sensor', 'delete')).toMatchObject({
      cliente: 'usuario',
      filtros: [['recorrido_id', ID_RECORRIDO]],
    })
    expect(mutacionesDe('fallas_deteccion', 'delete')).toMatchObject([
      { cliente: 'usuario', filtros: [['recorrido_id', ID_RECORRIDO], ['origen', 'sensor']] },
    ])
    // y después reinserta lo que llegó en el payload
    expect(escrituraDe('muestras_sensor')?.filas).toHaveLength(2)
    expect(escriturasDe('fallas_deteccion')).toHaveLength(1)
  })

  test('reentrega procesada: el resumen de sensores se recalcula desde la base', async () => {
    db.recorridoExistente = {
      id: ID_RECORRIDO,
      usuario_id: 'u1',
      km: 4.2,
      procesado_at: '2026-09-03T11:05:00Z',
    }
    db.muestrasDelRecorrido = [
      { latitud: 0, longitud: 0, calidad: 'bueno' },
      { latitud: 0, longitud: 0.002, calidad: 'bueno' },
    ]
    db.fallasSensorDelRecorrido = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }]

    const r = await finalizarRecorrido(payload())

    expect(r.ok && r.data.impactos).toBe(3)
    expect(r.ok && r.data.kmPorCalidad.bueno).toBeCloseTo(0.222, 3)
    expect(escrituras).toEqual([])
    expect(mutaciones).toEqual([])
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

describe('registrarCuadros', () => {
  const T_BASE = 1_756_900_000_000

  function cuadro(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      t: T_BASE,
      lat: 0,
      lng: 0.004,
      rumbo: 90,
      velocidadKmh: 42,
      ruta: `u1/${ID_RECORRIDO}/cuadro-${T_BASE}-cuadro.jpg`,
      ...extra,
    }
  }

  function lote(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { recorridoId: ID_RECORRIDO, cuadros: [cuadro()], ...extra }
  }

  /** El recorrido ya está guardado: la cola de cuadros arranca después. */
  function recorridoPropio(): void {
    db.recorridoExistente = {
      id: ID_RECORRIDO,
      usuario_id: 'u1',
      km: 4.2,
      procesado_at: '2026-09-03T11:05:00Z',
      // Ventana amplia (2 h) para que el margen y el tope por duración no
      // interfieran con los tests que no apuntan a esas reglas.
      inicio: new Date(T_BASE - 3_600_000).toISOString(),
      fin: new Date(T_BASE + 3_600_000).toISOString(),
    }
  }

  test('guarda los cuadros con el cliente del usuario, asignados al tramo', async () => {
    recorridoPropio()
    db.cuadrosDelRecorrido = 30

    const r = await registrarCuadros(
      lote({ cuadros: [cuadro(), cuadro({ t: T_BASE + 5000, lng: 0.008 })] }),
    )

    expect(r).toEqual({ ok: true, data: { registrados: 2, puntos: 3 } })

    const cuadros = escrituraDe('cuadros')
    expect(cuadros?.cliente).toBe('usuario')
    expect(cuadros?.opciones).toEqual({ onConflict: 'recorrido_id,t' })
    expect((cuadros?.filas as Fila[])[0]).toEqual({
      recorrido_id: ID_RECORRIDO,
      usuario_id: 'u1',
      tramo_id: 'w1',
      t: new Date(T_BASE).toISOString(),
      latitud: 0,
      longitud: 0.004,
      rumbo: 90,
      velocidad_kmh: 42,
      ruta: `u1/${ID_RECORRIDO}/cuadro-${T_BASE}-cuadro.jpg`,
    })
  })

  test('los puntos por cuadros los escribe el admin y reemplazan a los previos', async () => {
    recorridoPropio()
    db.cuadrosDelRecorrido = 30

    await registrarCuadros(lote())

    expect(mutacionDe('puntos_eventos', 'delete')).toMatchObject({
      cliente: 'admin',
      filtros: [['recorrido_id', ID_RECORRIDO], ['motivo', 'cuadros']],
    })
    expect(escrituraDe('puntos_eventos')).toMatchObject({
      cliente: 'admin',
      filas: {
        usuario_id: 'u1',
        municipio: 'maipu',
        recorrido_id: ID_RECORRIDO,
        motivo: 'cuadros',
        puntos: 3,
      },
    })
    expect(tablasUsuario).not.toContain('puntos_eventos')
  })

  test('con menos de diez cuadros guardados no inserta puntos', async () => {
    recorridoPropio()
    db.cuadrosDelRecorrido = 9

    const r = await registrarCuadros(lote())

    expect(r).toEqual({ ok: true, data: { registrados: 1, puntos: 0 } })
    expect(escrituraDe('puntos_eventos')).toBeUndefined()
    // igual borra el evento previo: si el total bajó, los puntos bajan
    expect(mutacionDe('puntos_eventos', 'delete')).toBeDefined()
  })

  test('el recorrido de otra persona no registra nada', async () => {
    db.recorridoExistente = {
      id: ID_RECORRIDO,
      usuario_id: 'u2',
      km: 4.2,
      procesado_at: '2026-09-03T11:05:00Z',
    }

    const r = await registrarCuadros(lote())

    // Definitivo: reintentar el lote daría siempre lo mismo.
    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/otra persona/i),
      definitivo: true,
    })
    expect(escrituras).toEqual([])
    expect(mutaciones).toEqual([])
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  test('un recorrido que no existe es un rechazo definitivo y no escribe nada', async () => {
    db.recorridoExistente = null

    const r = await registrarCuadros(lote())

    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/ya no está disponible/i),
      definitivo: true,
    })
    expect(escrituras).toEqual([])
  })

  test('una ruta que no cuelga del usuario y el recorrido no llega a la base', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    recorridoPropio()

    const r = await registrarCuadros(lote({ cuadros: [cuadro({ ruta: 'u2/otro/foto.jpg' })] }))

    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no se pudieron registrar/i) })
    expect(escrituraDe('cuadros')).toBeUndefined()
    expect(escrituraDe('puntos_eventos')).toBeUndefined()
    expect(spy).toHaveBeenCalledWith('[cuadros]', expect.any(Error))
    spy.mockRestore()
  })

  test('un cuadro fuera de la ventana del recorrido se rechaza sin escribir', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    recorridoPropio()

    const antes = T_BASE - 3_600_000 - 61_000 // antes de inicio - 60 s
    const r = await registrarCuadros(lote({ cuadros: [cuadro({ t: antes })] }))

    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/no pudieron validarse/i),
      definitivo: true,
    })
    expect(escrituraDe('cuadros')).toBeUndefined()
    expect(escrituraDe('puntos_eventos')).toBeUndefined()
    expect(spy).toHaveBeenCalledWith('[cuadros]', expect.any(Error))
    spy.mockRestore()
  })

  test('espaciado menor al mínimo dentro del lote se rechaza sin escribir', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    recorridoPropio()

    const r = await registrarCuadros(
      lote({ cuadros: [cuadro(), cuadro({ t: T_BASE + 3000, lng: 0.006 })] }),
    )

    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/no pudieron validarse/i),
      definitivo: true,
    })
    expect(escrituraDe('cuadros')).toBeUndefined()
    spy.mockRestore()
  })

  test('el espaciado se chequea también contra los cuadros ya guardados del recorrido', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    recorridoPropio()
    db.cuadrosExistentesT = [new Date(T_BASE).toISOString()]

    const r = await registrarCuadros(lote({ cuadros: [cuadro({ t: T_BASE + 3000 })] }))

    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/no pudieron validarse/i),
      definitivo: true,
    })
    expect(escrituraDe('cuadros')).toBeUndefined()
    spy.mockRestore()
  })

  test('un lote que supera el tope de cuadros por duración se rechaza sin escribir', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Recorrido de 15 s: tope = floor(15000/5000)+1 = 4 cuadros como máximo.
    db.recorridoExistente = {
      id: ID_RECORRIDO,
      usuario_id: 'u1',
      km: 4.2,
      procesado_at: '2026-09-03T11:05:00Z',
      inicio: new Date(T_BASE).toISOString(),
      fin: new Date(T_BASE + 15_000).toISOString(),
    }
    const cuadros = Array.from({ length: 5 }, (_, i) => cuadro({ t: T_BASE + i * 5000, lng: 0.001 * i }))

    const r = await registrarCuadros(lote({ cuadros }))

    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/no pudieron validarse/i),
      definitivo: true,
    })
    expect(escrituraDe('cuadros')).toBeUndefined()
    spy.mockRestore()
  })

  test('datos inválidos: no crea el cliente admin ni consulta nada', async () => {
    const r = await registrarCuadros(lote({ recorridoId: 'no-uuid' }))
    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/identificador/i),
      definitivo: true,
    })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
    expect(tablasUsuario).toEqual([])
    expect(escrituras).toEqual([])
  })

  test('un lote vacío se rechaza sin tocar la base', async () => {
    const r = await registrarCuadros(lote({ cuadros: [] }))
    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/no hay cuadros/i),
      definitivo: true,
    })
    expect(tablasUsuario).toEqual([])
  })

  test('más de 200 cuadros en una llamada se rechazan', async () => {
    const cuadros = Array.from({ length: 201 }, (_, i) => cuadro({ t: T_BASE + i }))
    const r = await registrarCuadros(lote({ cuadros }))
    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/demasiados cuadros/i),
      definitivo: true,
    })
    expect(tablasUsuario).toEqual([])
  })

  // Sin sesión NO es definitivo: la sesión puede volver y el lote sigue siendo válido.
  test('sin sesión no escribe nada y se puede reintentar', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const r = await registrarCuadros(lote())
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sesión/i) })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
    expect(escrituras).toEqual([])
  })
})

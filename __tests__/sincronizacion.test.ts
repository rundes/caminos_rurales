import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ResultadoRecorrido, ResumenRecorrido } from '@/app/dashboard/recorrido/actions'
import type { DestinoSubida } from '@/lib/almacenamiento/tipos'
import { procesarCola } from '@/lib/local/cola'
import {
  BACKOFF_MS,
  MAX_INTENTOS,
  sincronizarRecorrido,
  type DepsSincronizacion,
} from '@/lib/local/sincronizacion'
import type { BaseLocal, ItemCola, ObservacionLocal, PuntoLocal, RecorridoLocal } from '@/lib/local/tipos'
import type { ResultadoAccion } from '@/lib/tipos'

const ID = '11111111-1111-4111-8111-111111111111'
const ID_OBS = '22222222-2222-4222-8222-222222222222'
const AHORA = 1_700_000_000_000
const USUARIO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const OTRO_USUARIO = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'

const RESUMEN: ResumenRecorrido = {
  km: 1.2,
  tramosNuevos: 2,
  tramosRepetidos: 1,
  puntos: 30,
  insignias: ['primer_recorrido'],
  coberturaMunicipio: 0.1,
}

const DESTINO: DestinoSubida = {
  urlSubida: 'https://subida.test/put',
  metodo: 'PUT',
  headers: { 'content-type': 'image/jpeg' },
  urlLectura: 'uid/rec/123-foto.jpg',
  ruta: 'uid/rec/123-foto.jpg',
}

type Inicial = {
  recorridos?: RecorridoLocal[]
  puntos?: PuntoLocal[]
  observaciones?: ObservacionLocal[]
  cola?: ItemCola[]
}

/** Doble en memoria de `BaseLocal`, suficiente para toda la sincronización. */
function crearBase(inicial: Inicial) {
  const recorridos = new Map((inicial.recorridos ?? []).map((r) => [r.id, r]))
  const observaciones = new Map((inicial.observaciones ?? []).map((o) => [o.id, o]))
  const cola = new Map((inicial.cola ?? []).map((c) => [c.recorridoId, c]))
  const puntos = [...(inicial.puntos ?? [])]

  const db: BaseLocal = {
    guardarRecorrido: async (r) => void recorridos.set(r.id, r),
    obtenerRecorrido: async (id) => recorridos.get(id),
    recorridoEnCurso: async (usuarioId) =>
      [...recorridos.values()].find((r) => r.usuarioId === usuarioId && r.estado === 'en_curso'),
    listarRecorridos: async (usuarioId) =>
      [...recorridos.values()].filter((r) => r.usuarioId === usuarioId),
    guardarPunto: async (p) => void puntos.push(p),
    listarPuntos: async (id) => puntos.filter((p) => p.recorridoId === id),
    guardarObservacion: async (o) => void observaciones.set(o.id, o),
    listarObservaciones: async (id) => [...observaciones.values()].filter((o) => o.recorridoId === id),
    encolar: async (id) => {
      if (!cola.has(id)) cola.set(id, { recorridoId: id, intentos: 0, proximoIntento: 0 })
    },
    obtenerItemCola: async (id) => cola.get(id),
    guardarItemCola: async (item) => void cola.set(item.recorridoId, item),
    listarCola: async () => [...cola.values()],
    borrarItemCola: async (id) => void cola.delete(id),
  }

  return { db, recorridos, observaciones, cola }
}

type Base = ReturnType<typeof crearBase>

function recorrido(estado: RecorridoLocal['estado'] = 'finalizado'): RecorridoLocal {
  return {
    id: ID,
    usuarioId: USUARIO,
    inicio: '2026-09-03T10:00:00.000Z',
    fin: '2026-09-03T10:30:00.000Z',
    estado,
    municipio: 'maipu',
    puntosGps: 3,
    km: 1.2,
  }
}

function puntosDe(recorridoId = ID): PuntoLocal[] {
  return [0, 1, 2].map((i) => ({
    recorridoId,
    lat: -36.85 + i * 0.001,
    lng: -57.88,
    t: AHORA + i * 1000,
    precision: 8,
  }))
}

function observacionConFoto(): ObservacionLocal {
  return {
    id: ID_OBS,
    recorridoId: ID,
    tipo_falla: 'bache',
    severidad: 'alta',
    latitud: -36.85,
    longitud: -57.88,
    archivo: new Blob(['bytes'], { type: 'image/jpeg' }),
    nombreArchivo: 'foto.jpg',
    tipoArchivo: 'image/jpeg',
    estadoSubida: 'pendiente',
  }
}

type DepsEspiadas = DepsSincronizacion & {
  finalizarRecorrido: ReturnType<typeof vi.fn>
  prepararSubida: ReturnType<typeof vi.fn>
  subir: ReturnType<typeof vi.fn>
  comprimir: ReturnType<typeof vi.fn>
}

function crearDeps(
  base: Base,
  respuesta: ResultadoRecorrido = { ok: true, data: RESUMEN },
  orden: string[] = [],
): DepsEspiadas {
  return {
    db: base.db,
    prepararSubida: vi.fn(async () => {
      orden.push('preparar')
      return { ok: true, data: DESTINO } as ResultadoAccion<DestinoSubida>
    }),
    finalizarRecorrido: vi.fn(async () => {
      orden.push('finalizar')
      return respuesta
    }),
    subir: vi.fn(async () => {
      orden.push('subir')
    }),
    comprimir: vi.fn(async (archivo: File) => {
      orden.push('comprimir')
      return archivo
    }),
    ahora: () => AHORA,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sincronizarRecorrido', () => {
  test('sube la evidencia antes de finalizar y deja el recorrido subido', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      puntos: puntosDe(),
      observaciones: [observacionConFoto()],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const orden: string[] = []
    const deps = crearDeps(base, { ok: true, data: RESUMEN }, orden)

    const resultado = await sincronizarRecorrido(ID, deps)

    expect(resultado).toEqual({ ok: true, data: RESUMEN })
    expect(orden).toEqual(['comprimir', 'preparar', 'subir', 'finalizar'])
    expect(base.recorridos.get(ID)?.estado).toBe('subido')
    expect(base.cola.size).toBe(0)

    const guardada = base.observaciones.get(ID_OBS)
    expect(guardada?.estadoSubida).toBe('subida')
    expect(guardada?.archivo).toBeUndefined()
    expect(guardada?.evidencia).toEqual({ ruta: DESTINO.ruta, tipo: 'imagen' })
  })

  test('manda el track simplificado y la evidencia en el payload', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      puntos: puntosDe(),
      observaciones: [observacionConFoto()],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base)

    await sincronizarRecorrido(ID, deps)

    const payload = deps.finalizarRecorrido.mock.calls[0][0] as {
      id: string
      puntosGps: number
      track: [number, number][]
      puntos: { lat: number; lng: number; t: number; precision: number }[]
      observaciones: { evidencia?: { ruta: string; tipo: string } }[]
    }
    expect(payload.id).toBe(ID)
    expect(payload.puntosGps).toBe(3)
    expect(payload.track.length).toBeGreaterThanOrEqual(2)
    expect(payload.track[0]).toEqual([-36.85, -57.88])
    expect(payload.track.length).toBe(payload.puntos.length)
    expect(payload.puntos[0]).toEqual({ lat: -36.85, lng: -57.88, t: AHORA, precision: 8 })
    expect(payload.puntos.every((p) => typeof p.t === 'number' && typeof p.precision === 'number')).toBe(true)
    expect(payload.observaciones[0].evidencia).toEqual({ ruta: DESTINO.ruta, tipo: 'imagen' })
  })

  test('no vuelve a subir una evidencia ya subida', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      puntos: puntosDe(),
      observaciones: [
        { ...observacionConFoto(), estadoSubida: 'subida', evidencia: { ruta: 'x/y.jpg', tipo: 'imagen' } },
      ],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base)

    await sincronizarRecorrido(ID, deps)

    expect(deps.subir).not.toHaveBeenCalled()
    expect(deps.finalizarRecorrido).toHaveBeenCalledTimes(1)
  })

  test('un fallo del servidor anota el intento con backoff creciente', async () => {
    const error = 'No se pudo guardar el recorrido. Intentá de nuevo.'
    const base = crearBase({
      recorridos: [recorrido()],
      puntos: puntosDe(),
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base, { ok: false, error })

    await sincronizarRecorrido(ID, deps)
    expect(base.cola.get(ID)).toEqual({
      recorridoId: ID,
      intentos: 1,
      proximoIntento: AHORA + BACKOFF_MS[0],
      ultimoError: error,
    })
    expect(base.recorridos.get(ID)?.estado).toBe('finalizado')

    await sincronizarRecorrido(ID, deps)
    expect(base.cola.get(ID)?.intentos).toBe(2)
    expect(base.cola.get(ID)?.proximoIntento).toBe(AHORA + BACKOFF_MS[1])

    await sincronizarRecorrido(ID, deps)
    await sincronizarRecorrido(ID, deps)
    expect(base.cola.get(ID)?.intentos).toBe(4)
    expect(base.cola.get(ID)?.proximoIntento).toBe(AHORA + BACKOFF_MS[2])
  })

  test('un fallo al subir la evidencia no llama a finalizarRecorrido', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      puntos: puntosDe(),
      observaciones: [observacionConFoto()],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base)
    deps.subir = vi.fn(async () => {
      throw new Error('No se pudo subir la evidencia. Lo reintentamos más tarde.')
    })

    const resultado = await sincronizarRecorrido(ID, deps)

    expect(resultado.ok).toBe(false)
    expect(deps.finalizarRecorrido).not.toHaveBeenCalled()
    expect(base.cola.get(ID)?.intentos).toBe(1)
  })

  test('al llegar al intento 20 marca el recorrido en error', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      puntos: puntosDe(),
      cola: [{ recorridoId: ID, intentos: MAX_INTENTOS - 1, proximoIntento: 0 }],
    })
    const deps = crearDeps(base, { ok: false, error: 'falló' })

    await sincronizarRecorrido(ID, deps)

    expect(base.cola.get(ID)?.intentos).toBe(MAX_INTENTOS)
    expect(base.recorridos.get(ID)?.estado).toBe('error')
  })

  test('un error definitivo marca el recorrido en error y lo saca de la cola sin reintentar', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      puntos: puntosDe(),
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base, {
      ok: false,
      error: 'Ese recorrido ya fue registrado por otra persona.',
      definitivo: true,
    })

    const resultado = await sincronizarRecorrido(ID, deps)

    expect(resultado.ok).toBe(false)
    expect(base.cola.size).toBe(0)
    expect(base.recorridos.get(ID)?.estado).toBe('error')
    expect(base.recorridos.get(ID)?.ultimoError).toMatch(/otra persona/i)
  })

  test('manda el id de la observación al preparar la subida', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      puntos: puntosDe(),
      observaciones: [observacionConFoto()],
      cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base)

    await sincronizarRecorrido(ID, deps)

    expect(deps.prepararSubida).toHaveBeenCalledWith(ID, 'foto.jpg', 'image/jpeg', ID_OBS)
  })

  test('si el recorrido ya no está en el dispositivo se saca de la cola', async () => {
    const base = crearBase({ cola: [{ recorridoId: ID, intentos: 0, proximoIntento: 0 }] })
    const deps = crearDeps(base)

    const resultado = await sincronizarRecorrido(ID, deps)

    expect(resultado.ok).toBe(false)
    expect(base.cola.size).toBe(0)
  })
})

describe('procesarCola', () => {
  test('procesa solo los items vencidos y devuelve el resumen por recorrido', async () => {
    const otro: RecorridoLocal = { ...recorrido(), id: 'otro' }
    const base = crearBase({
      recorridos: [recorrido(), otro],
      puntos: [...puntosDe(), ...puntosDe('otro')],
      cola: [
        { recorridoId: ID, intentos: 0, proximoIntento: 0 },
        { recorridoId: 'otro', intentos: 1, proximoIntento: AHORA + 60_000 },
      ],
    })
    const deps = crearDeps(base)

    const resultado = await procesarCola(deps, USUARIO)

    expect(deps.finalizarRecorrido).toHaveBeenCalledTimes(1)
    expect(resultado).toEqual({ procesados: 1, pendientes: 1, resumenes: { [ID]: RESUMEN } })
  })

  test('los items agotados no se procesan, se marcan en error y no cuentan como pendientes', async () => {
    const base = crearBase({
      recorridos: [recorrido()],
      puntos: puntosDe(),
      cola: [{ recorridoId: ID, intentos: MAX_INTENTOS, proximoIntento: 0, ultimoError: 'falló' }],
    })
    const deps = crearDeps(base)

    const resultado = await procesarCola(deps, USUARIO)

    expect(deps.finalizarRecorrido).not.toHaveBeenCalled()
    expect(resultado.procesados).toBe(0)
    expect(resultado.pendientes).toBe(0)
    expect(base.recorridos.get(ID)?.estado).toBe('error')
    expect(base.recorridos.get(ID)?.ultimoError).toBe('falló')
  })

  test('no toca los recorridos de otro usuario', async () => {
    const ajeno: RecorridoLocal = { ...recorrido(), id: 'ajeno', usuarioId: OTRO_USUARIO }
    const base = crearBase({
      recorridos: [ajeno],
      puntos: puntosDe('ajeno'),
      cola: [{ recorridoId: 'ajeno', intentos: 0, proximoIntento: 0 }],
    })
    const deps = crearDeps(base)

    const resultado = await procesarCola(deps, USUARIO)

    expect(deps.finalizarRecorrido).not.toHaveBeenCalled()
    expect(resultado).toEqual({ procesados: 0, pendientes: 0, resumenes: {} })
    expect(base.recorridos.get('ajeno')?.estado).toBe('finalizado')
    expect(base.cola.size).toBe(1)
  })

  test('reencola un recorrido finalizado del usuario que perdió su item de cola', async () => {
    const base = crearBase({ recorridos: [recorrido()], puntos: puntosDe(), cola: [] })
    const deps = crearDeps(base)

    const resultado = await procesarCola(deps, USUARIO)

    expect(deps.finalizarRecorrido).toHaveBeenCalledTimes(1)
    expect(resultado.procesados).toBe(1)
    expect(base.recorridos.get(ID)?.estado).toBe('subido')
  })
})

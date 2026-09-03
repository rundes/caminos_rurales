// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, test } from 'vitest'

/**
 * `public/sw-cache.js` se carga con `importScripts` dentro del worker, así que
 * no es un módulo ESM. Acá se evalúa tal cual, con un `self` y un `module`
 * falsos, para verificar los dos caminos de exportación.
 */
const CODIGO = readFileSync(fileURLToPath(new URL('../public/sw-cache.js', import.meta.url)), 'utf8')

type Recortar = (cache: CacheFalso, max: number) => Promise<number>

function cargar(): { self: Record<string, unknown>; recortarCache: Recortar } {
  const contextoSelf: Record<string, unknown> = {}
  const contextoModule = { exports: {} as { recortarCache?: Recortar } }
  new Function('self', 'module', CODIGO)(contextoSelf, contextoModule)
  return { self: contextoSelf, recortarCache: contextoModule.exports.recortarCache as Recortar }
}

/** Cache mínimo: guarda las claves en orden de inserción, como el real. */
class CacheFalso {
  claves: string[]
  borradas: string[] = []

  constructor(cantidad: number) {
    this.claves = Array.from({ length: cantidad }, (_, i) => `/tesela/${i}`)
  }

  async keys(): Promise<string[]> {
    return [...this.claves]
  }

  async delete(clave: string): Promise<boolean> {
    this.borradas.push(clave)
    this.claves = this.claves.filter((c) => c !== clave)
    return true
  }
}

let recortarCache: Recortar

beforeEach(() => {
  recortarCache = cargar().recortarCache
})

describe('recortarCache', () => {
  test('se expone en self y en module.exports', () => {
    const cargado = cargar()

    expect(typeof cargado.self.recortarCache).toBe('function')
    expect(typeof cargado.recortarCache).toBe('function')
  })

  test('no borra nada cuando el cache está por debajo del tope', async () => {
    const cache = new CacheFalso(10)

    expect(await recortarCache(cache, 20)).toBe(0)
    expect(cache.borradas).toEqual([])
  })

  test('no borra nada cuando está justo en el tope', async () => {
    const cache = new CacheFalso(20)

    expect(await recortarCache(cache, 20)).toBe(0)
    expect(cache.claves).toHaveLength(20)
  })

  test('borra las entradas más viejas hasta dejar el tope', async () => {
    const cache = new CacheFalso(25)

    expect(await recortarCache(cache, 20)).toBe(5)
    expect(cache.borradas).toEqual(['/tesela/0', '/tesela/1', '/tesela/2', '/tesela/3', '/tesela/4'])
    expect(cache.claves).toHaveLength(20)
    expect(cache.claves[0]).toBe('/tesela/5')
  })

  test('recorta en lotes un excedente grande', async () => {
    const cache = new CacheFalso(1700)

    expect(await recortarCache(cache, 1500)).toBe(200)
    expect(cache.claves).toHaveLength(1500)
    expect(cache.borradas).toHaveLength(200)
  })

  test('tolera un cache ausente o un tope inválido', async () => {
    expect(await recortarCache(undefined as unknown as CacheFalso, 10)).toBe(0)
    expect(await recortarCache(new CacheFalso(5), 0)).toBe(0)
  })
})

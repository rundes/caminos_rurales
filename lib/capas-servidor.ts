import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { FeatureCollection, Polygon } from 'geojson'
import { capasDe } from '@/lib/capas'

type LimitesBounds = [[number, number], [number, number]]

const cacheLimites = new Map<string, LimitesBounds | null>()

function boundsDeAnillo(anillo: number[][]): LimitesBounds {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const [lng, lat] of anillo) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

/**
 * Bounds [[sur, oeste], [norte, este]] del límite de un municipio, leyendo
 * su `limite.geojson` de `public/`. `null` si el municipio no tiene capa de
 * límite registrada o el archivo no se puede leer. Cacheado en memoria del
 * proceso (los archivos de `public/` no cambian en runtime).
 */
export async function limitesDe(slug: string | null | undefined): Promise<LimitesBounds | null> {
  if (!slug) return null

  if (cacheLimites.has(slug)) return cacheLimites.get(slug) ?? null

  const capas = capasDe(slug)
  if (!capas?.limite) {
    cacheLimites.set(slug, null)
    return null
  }

  try {
    const ruta = path.join(process.cwd(), 'public', capas.limite)
    const contenido = await readFile(ruta, 'utf8')
    const coleccion = JSON.parse(contenido) as FeatureCollection<Polygon>
    const anillo = coleccion.features[0]?.geometry?.coordinates?.[0]
    if (!anillo) {
      cacheLimites.set(slug, null)
      return null
    }
    const bounds = boundsDeAnillo(anillo)
    cacheLimites.set(slug, bounds)
    return bounds
  } catch (error) {
    console.error('[capas-servidor]', error)
    cacheLimites.set(slug, null)
    return null
  }
}

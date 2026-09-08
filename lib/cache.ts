import 'server-only'
import { revalidateTag, unstable_cache } from 'next/cache'

const REVALIDATE_SEGUNDOS = 120

/**
 * Envuelve una consulta agregada de un municipio con `unstable_cache`,
 * taggeada `municipio:<slug>` y revalidada cada 120s o al llamar
 * `revalidarMunicipio(slug)` (por ejemplo, al cerrar un recorrido).
 *
 * `unstable_cache` no soporta `cookies()`/`headers()` dentro del scope
 * cacheado (el resultado se comparte entre requests y usuarios), así que
 * `fn` debe resolver sus datos con el cliente ADMIN y un filtro explícito
 * por municipio en vez de depender de la sesión o de RLS — ver
 * `obtenerTramosConEstadoCacheado` en `cobertura-consultas.ts`.
 *
 * `slug` va en `keyParts` (no solo capturado por closure en `fn`): la key de
 * `unstable_cache` se arma con el string de `fn` más `keyParts`, y como acá
 * `fn` es siempre la misma expresión (solo cambia el valor cerrado del
 * municipio), sin `slug` en `keyParts` todos los municipios pisarían la
 * misma entrada de caché.
 */
export function cacheMunicipio<T>(nombre: string, fn: () => Promise<T>, slug: string): () => Promise<T> {
  return unstable_cache(fn, [nombre, slug], {
    revalidate: REVALIDATE_SEGUNDOS,
    tags: [`municipio:${slug}`],
  })
}

/**
 * Invalida el caché agregado de un municipio (tras un recorrido finalizado,
 * etc.). `{ expire: 0 }` (Next 16 exige el segundo argumento) pisa el dato
 * ya mismo en vez de seguir sirviendo la versión vieja mientras revalida en
 * segundo plano (`profile: 'max'`): después de guardar un recorrido, quien
 * mira el mapa espera ver su cobertura nueva, no la de hace 2 minutos.
 */
export function revalidarMunicipio(slug: string): void {
  revalidateTag(`municipio:${slug}`, { expire: 0 })
}

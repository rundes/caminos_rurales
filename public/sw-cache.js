/*
 * Recorte LRU de un cache del service worker. Vive aparte de `sw.js` para
 * poder testearse en Node: se carga con `importScripts` dentro del worker
 * (queda en `self`) y con `module.exports` fuera de él.
 */

/** Cuántas entradas se borran por lote, para no encadenar miles de promesas. */
var TAMANO_LOTE = 50

/**
 * Deja el cache en `max` entradas como mucho, borrando las más viejas (las
 * claves vienen en orden de inserción). El borrado va por lotes.
 */
async function recortarCache(cache, max) {
  if (!cache || !(max > 0)) return 0

  const claves = await cache.keys()
  const sobran = claves.length - max
  if (sobran <= 0) return 0

  const viejas = claves.slice(0, sobran)
  for (let i = 0; i < viejas.length; i += TAMANO_LOTE) {
    await Promise.all(viejas.slice(i, i + TAMANO_LOTE).map((clave) => cache.delete(clave)))
  }
  return viejas.length
}

if (typeof self !== 'undefined') self.recortarCache = recortarCache
if (typeof module !== 'undefined' && module.exports) module.exports = { recortarCache, TAMANO_LOTE }

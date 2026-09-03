/*
 * Service worker de Visiovial Rural. Sin librerías: precache del shell,
 * network-first para navegación y assets de Next, cache-first para las capas
 * GeoJSON, los íconos y las teselas de IGN/OSM.
 */
const VERSION = 'v1'
const CACHE_SHELL = `visiovial-shell-${VERSION}`
const CACHE_ESTATICO = `visiovial-estatico-${VERSION}`
const CACHE_NEXT = `visiovial-next-${VERSION}`
const CACHE_TESELAS = `visiovial-teselas-${VERSION}`

const CACHES_PROPIOS = [CACHE_SHELL, CACHE_ESTATICO, CACHE_NEXT, CACHE_TESELAS]
const MAX_TESELAS = 300

const PRECACHE = [
  '/dashboard',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/icon.svg',
]

const HOSTS_TESELAS = ['wms.ign.gob.ar', 'tile.openstreetmap.org']

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .catch((error) => console.error('[sw]', error))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(nombres.filter((n) => !CACHES_PROPIOS.includes(n)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  )
})

/** Recorta un cache a `max` entradas borrando las más viejas (orden de inserción). */
async function recortarCache(nombre, max) {
  const cache = await caches.open(nombre)
  const claves = await cache.keys()
  if (claves.length <= max) return
  await Promise.all(claves.slice(0, claves.length - max).map((clave) => cache.delete(clave)))
}

async function cacheFirst(peticion, nombreCache, max) {
  const cache = await caches.open(nombreCache)
  const guardada = await cache.match(peticion)
  if (guardada) return guardada

  const respuesta = await fetch(peticion)
  if (respuesta && (respuesta.ok || respuesta.type === 'opaque')) {
    await cache.put(peticion, respuesta.clone())
    if (max) await recortarCache(nombreCache, max)
  }
  return respuesta
}

async function networkFirst(peticion, nombreCache, alternativa) {
  const cache = await caches.open(nombreCache)
  try {
    const respuesta = await fetch(peticion)
    if (respuesta && respuesta.ok) await cache.put(peticion, respuesta.clone())
    return respuesta
  } catch (error) {
    const guardada = (await cache.match(peticion)) || (alternativa ? await caches.match(alternativa) : undefined)
    if (guardada) return guardada
    throw error
  }
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request
  if (peticion.method !== 'GET') return

  const url = new URL(peticion.url)
  const mismoOrigen = url.origin === self.location.origin

  if (!mismoOrigen) {
    if (HOSTS_TESELAS.includes(url.hostname)) {
      evento.respondWith(cacheFirst(peticion, CACHE_TESELAS, MAX_TESELAS))
    }
    return
  }

  if (url.pathname.startsWith('/capas/') || url.pathname.startsWith('/icons/')) {
    evento.respondWith(cacheFirst(peticion, CACHE_ESTATICO))
    return
  }

  if (peticion.mode === 'navigate') {
    evento.respondWith(networkFirst(peticion, CACHE_SHELL, '/dashboard'))
    return
  }

  if (url.pathname.startsWith('/_next/')) {
    evento.respondWith(networkFirst(peticion, CACHE_NEXT))
  }
})

/*
 * Service worker de Visiovial Rural. Sin librerías.
 *
 * Regla principal: el HTML autenticado NUNCA se cachea. Una navegación se
 * resuelve siempre contra la red y, si no hay señal, cae en `/offline`, que es
 * una página estática sin datos de nadie. Así un celular compartido no puede
 * mostrarle a la persona equivocada el dashboard de otra.
 *
 * Los assets de `/_next/*`, las capas GeoJSON, los íconos y las teselas sí se
 * cachean: no llevan información de sesión.
 */
importScripts('/sw-cache.js')

const VERSION = 'v2'
const CACHE_SHELL = `visiovial-shell-${VERSION}`
const CACHE_ESTATICO = `visiovial-estatico-${VERSION}`
const CACHE_NEXT = `visiovial-next-${VERSION}`
const CACHE_TESELAS = `visiovial-teselas-${VERSION}`

const CACHES_PROPIOS = [CACHE_SHELL, CACHE_ESTATICO, CACHE_NEXT, CACHE_TESELAS]
const MAX_TESELAS = 1500

const RUTA_OFFLINE = '/offline'

const PRECACHE = [
  RUTA_OFFLINE,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/icon.svg',
]

const HOSTS_TESELAS = ['wms.ign.gob.ar', 'tile.openstreetmap.org']

// Sin `skipWaiting()`: el SW nuevo espera a que se cierren las pestañas. Tomar
// el control en medio de una sesión mezcla chunks de dos builds distintos.
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .catch((error) => console.error('[sw]', error)),
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

/** Borra todos los caches. Lo dispara la app al cerrar sesión. */
async function limpiarTodo() {
  const nombres = await caches.keys()
  await Promise.all(nombres.map((nombre) => caches.delete(nombre)))
}

self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.type === 'LIMPIAR') {
    evento.waitUntil(limpiarTodo().catch((error) => console.error('[sw]', error)))
  }
})

async function cacheFirst(peticion, nombreCache, max) {
  const cache = await caches.open(nombreCache)
  const guardada = await cache.match(peticion)
  if (guardada) return guardada

  const respuesta = await fetch(peticion)
  if (respuesta && (respuesta.ok || respuesta.type === 'opaque')) {
    await cache.put(peticion, respuesta.clone())
    if (max) await self.recortarCache(cache, max)
  }
  return respuesta
}

async function networkFirst(peticion, nombreCache) {
  const cache = await caches.open(nombreCache)
  try {
    const respuesta = await fetch(peticion)
    if (respuesta && respuesta.ok) await cache.put(peticion, respuesta.clone())
    return respuesta
  } catch (error) {
    const guardada = await cache.match(peticion)
    if (guardada) return guardada
    throw error
  }
}

/**
 * Navegación: siempre red, nunca `cache.put`. Sin señal se devuelve la página
 * estática de offline; si ni eso está, se propaga el fallo.
 */
async function navegacion(peticion) {
  try {
    return await fetch(peticion)
  } catch (error) {
    const alternativa = await caches.match(RUTA_OFFLINE)
    if (alternativa) return alternativa
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

  if (peticion.mode === 'navigate') {
    evento.respondWith(navegacion(peticion))
    return
  }

  if (url.pathname.startsWith('/capas/') || url.pathname.startsWith('/icons/')) {
    evento.respondWith(cacheFirst(peticion, CACHE_ESTATICO))
    return
  }

  if (url.pathname.startsWith('/_next/')) {
    evento.respondWith(networkFirst(peticion, CACHE_NEXT))
  }
})

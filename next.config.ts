import type { NextConfig } from 'next'

const UN_ANIO_EN_SEGUNDOS = 60 * 60 * 24 * 365

/**
 * Sin `script-src`: la app no tiene JS inline ni de terceros, así que el
 * `default-src 'self'` ya cubre los scripts propios servidos por Next. Los
 * hosts de `img-src`/`media-src`/`connect-src` son los proveedores de
 * evidencia (Supabase Storage o GCS) y las teselas del mapa (IGN, OSM).
 */
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://storage.googleapis.com https://*.supabase.co https://wms.ign.gob.ar https://tile.openstreetmap.org",
  "media-src 'self' blob: https://storage.googleapis.com https://*.supabase.co",
  // `storage.googleapis.com` también acá (no solo en img/media): la subida de
  // evidencia y de cuadros hace `fetch(PUT)` contra la URL firmada, y con
  // `ALMACENAMIENTO=gcs` ese host es el destino del PUT.
  "connect-src 'self' https://storage.googleapis.com https://*.supabase.co https://wms.ign.gob.ar https://tile.openstreetmap.org",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const CACHE_INMUTABLE = 'public, max-age=31536000, immutable'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: `max-age=${UN_ANIO_EN_SEGUNDOS}; includeSubDomains; preload` },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(self), accelerometer=(self), gyroscope=(self), microphone=(), payment=()',
          },
          { key: 'Content-Security-Policy', value: CSP },
        ],
      },
      {
        // Capas GeoJSON de los municipios: no llevan hash en el nombre, pero
        // no cambian salvo un redeploy explícito de `public/capas`.
        source: '/capas/:path*',
        headers: [{ key: 'Cache-Control', value: CACHE_INMUTABLE }],
      },
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: CACHE_INMUTABLE }],
      },
    ]
  },
}

export default nextConfig

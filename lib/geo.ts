export type Coordenada = { lat: number; lng: number }

const RADIO_TIERRA_KM = 6371

function aRadianes(grados: number): number {
  return (grados * Math.PI) / 180
}

/** Distancia haversine en kilómetros. */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const dLat = aRadianes(b.lat - a.lat)
  const dLng = aRadianes(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h))
}

/**
 * Punto uniforme dentro de un círculo de `radioKm` alrededor de `centro`.
 * `aleatorio` devuelve [0, 1). Inyectable para tests.
 */
export function puntoAleatorioEnRadio(
  centro: Coordenada,
  radioKm: number,
  aleatorio: () => number = Math.random,
): Coordenada {
  const distancia = radioKm * Math.sqrt(aleatorio())
  const angulo = 2 * Math.PI * aleatorio()
  const dLat = (distancia / RADIO_TIERRA_KM) * (180 / Math.PI)
  const dLng = dLat / Math.cos(aRadianes(centro.lat))
  return {
    lat: Number((centro.lat + dLat * Math.cos(angulo)).toFixed(6)),
    lng: Number((centro.lng + dLng * Math.sin(angulo)).toFixed(6)),
  }
}

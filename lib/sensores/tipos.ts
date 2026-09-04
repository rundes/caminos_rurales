export type CalidadSegmento = 'sin_dato' | 'bueno' | 'regular' | 'malo' | 'intransitable'

/** Agregado de sensores por segmento (5 s o 100 m). */
export type MuestraSensor = {
  t: number // epoch ms del cierre del segmento
  lat: number
  lng: number
  velocidadKmh: number
  rumbo: number | null
  altitud: number | null
  rmsVertical: number // m/s²
  picoVertical: number // m/s²
  frenadas: number
  laterales: number
  muestras: number // cantidad de eventos de movimiento
  calidad: CalidadSegmento
}

export type Impacto = {
  t: number
  lat: number
  lng: number
  pico: number // m/s²
  velocidadKmh: number
}

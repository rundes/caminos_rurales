/**
 * Funciones puras de export (CSV y GeoJSON). No tocan Supabase ni el
 * request/response: los route handlers arman las filas y llaman a estas.
 */

/** Valor de una celda: se admite `null`/`undefined` para campos ausentes. */
export type ValorCelda = string | number | boolean | null | undefined

export type FilaCsv = Record<string, ValorCelda>

/** Reglas de RFC 4180: comillas dobles si el campo tiene coma, comilla o salto de línea; comilla escapada duplicándola. */
function celdaCsv(valor: ValorCelda): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  if (/[",\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`
  return texto
}

const BOM_UTF8 = '﻿'

/**
 * Serializa filas a CSV (RFC 4180, separador coma, fin de línea CRLF) con BOM
 * UTF-8 al principio para que Excel abra los acentos bien. Las columnas salen
 * de las claves de la primera fila; si no hay filas, solo se devuelve el BOM.
 */
export function aCsv(filas: readonly FilaCsv[]): string {
  if (filas.length === 0) return BOM_UTF8

  const columnas = Object.keys(filas[0])
  const lineas = [
    columnas.map(celdaCsv).join(','),
    ...filas.map((fila) => columnas.map((c) => celdaCsv(fila[c])).join(',')),
  ]
  return BOM_UTF8 + lineas.join('\r\n')
}

export type FilaGeoJson = {
  latitud: number
  longitud: number
  propiedades: Record<string, ValorCelda>
}

export type FeaturePunto = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: Record<string, ValorCelda>
}

export type FeatureCollectionPuntos = {
  type: 'FeatureCollection'
  features: FeaturePunto[]
}

/** Arma un FeatureCollection de puntos (GeoJSON usa [longitud, latitud]). */
export function aGeoJson(filas: readonly FilaGeoJson[]): FeatureCollectionPuntos {
  return {
    type: 'FeatureCollection',
    features: filas.map((f) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [f.longitud, f.latitud] },
      properties: f.propiedades,
    })),
  }
}

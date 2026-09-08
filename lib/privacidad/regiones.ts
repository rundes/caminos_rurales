import type { CajaPx, RegionDetectada, TipoRegion } from './tipos'
import { CONFIANZA_MINIMA_CARA, CONFIANZA_MINIMA_OBJETO, MARGEN_CAJA_PCT } from './umbrales'

/**
 * Expande `caja` un `margenPct` de su propio ancho/alto por cada lado y la
 * recorta a los límites `[0, anchoImg] x [0, altoImg]`. Una caja que ya
 * tocaba el borde de la imagen no crece de ese lado (no hay más imagen).
 */
export function expandirCaja(
  caja: CajaPx,
  margenPct: number,
  anchoImg: number,
  altoImg: number,
): CajaPx {
  const margenX = caja.ancho * margenPct
  const margenY = caja.alto * margenPct
  const x = Math.max(0, caja.x - margenX)
  const y = Math.max(0, caja.y - margenY)
  const finX = Math.min(anchoImg, caja.x + caja.ancho + margenX)
  const finY = Math.min(altoImg, caja.y + caja.alto + margenY)
  return { x, y, ancho: Math.max(0, finX - x), alto: Math.max(0, finY - y) }
}

const CONFIANZA_MINIMA: Record<TipoRegion, number> = {
  cara: CONFIANZA_MINIMA_CARA,
  persona: CONFIANZA_MINIMA_OBJETO,
  vehiculo: CONFIANZA_MINIMA_OBJETO,
}

/**
 * De las detecciones crudas, las que hay que pixelar: con confianza
 * suficiente para su tipo, ya expandidas por el margen y recortadas a la
 * imagen. Descarta las que quedaron sin área (cajas fuera de cuadro).
 */
export function regionesABloquear(
  detecciones: readonly RegionDetectada[],
  anchoImg: number,
  altoImg: number,
  margenPct: number = MARGEN_CAJA_PCT,
): CajaPx[] {
  return detecciones
    .filter((d) => d.confianza >= CONFIANZA_MINIMA[d.tipo])
    .map((d) => expandirCaja(d.caja, margenPct, anchoImg, altoImg))
    .filter((c) => c.ancho > 0 && c.alto > 0)
}

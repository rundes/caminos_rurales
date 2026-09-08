import type { CajaPx } from './tipos'
import { LADO_BLOQUE_PIXELADO } from './umbrales'

/**
 * Pixela (mosaico) la región `caja` dentro de `datos`, mutando el buffer in
 * situ: el `ImageData` de trabajo es, igual que el canvas en
 * `lib/camara/captura.ts`, una superficie mutable por naturaleza — copiarla
 * entera por cada región desperdiciaría memoria en cuadros con varias
 * detecciones. Cada bloque de `lado` x `lado` px se reemplaza por su color
 * promedio: es irreversible (el detalle original no sobrevive en ningún
 * pixel del archivo final, ni con el bloque entero a la vista) y barato de
 * calcular. Recorta `caja` a los límites de `datos` antes de procesar.
 */
export function pixelarRegion(
  datos: ImageData,
  caja: CajaPx,
  lado: number = LADO_BLOQUE_PIXELADO,
): void {
  const { width: anchoImg, height: altoImg, data } = datos
  const x0 = Math.max(0, Math.floor(caja.x))
  const y0 = Math.max(0, Math.floor(caja.y))
  const x1 = Math.min(anchoImg, Math.ceil(caja.x + caja.ancho))
  const y1 = Math.min(altoImg, Math.ceil(caja.y + caja.alto))
  const ladoEfectivo = Math.max(1, Math.floor(lado))
  if (x1 <= x0 || y1 <= y0) return

  for (let by = y0; by < y1; by += ladoEfectivo) {
    const finY = Math.min(y1, by + ladoEfectivo)
    for (let bx = x0; bx < x1; bx += ladoEfectivo) {
      const finX = Math.min(x1, bx + ladoEfectivo)

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let py = by; py < finY; py += 1) {
        for (let px = bx; px < finX; px += 1) {
          const i = (py * anchoImg + px) * 4
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          a += data[i + 3]
          n += 1
        }
      }
      if (n === 0) continue
      const rProm = Math.round(r / n)
      const gProm = Math.round(g / n)
      const bProm = Math.round(b / n)
      const aProm = Math.round(a / n)

      for (let py = by; py < finY; py += 1) {
        for (let px = bx; px < finX; px += 1) {
          const i = (py * anchoImg + px) * 4
          data[i] = rProm
          data[i + 1] = gProm
          data[i + 2] = bProm
          data[i + 3] = aProm
        }
      }
    }
  }
}

/** Pixela todas las `cajas` sobre el mismo `ImageData`. */
export function pixelarRegiones(
  datos: ImageData,
  cajas: readonly CajaPx[],
  lado: number = LADO_BLOQUE_PIXELADO,
): void {
  for (const caja of cajas) pixelarRegion(datos, caja, lado)
}

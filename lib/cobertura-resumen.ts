const DECIMALES_KM = 1

function aNumero(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined) return 0
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

function redondear(n: number): number {
  return Number(n.toFixed(DECIMALES_KM))
}

/** Fila cruda devuelta por la función SQL `cobertura_municipio` (los `numeric` de Postgres pueden llegar como string). */
export type FilaCoberturaMunicipio = {
  localidad: string
  tramos: number
  cubiertos: number
  km: number | string
  km_cubiertos: number | string
}

export type CoberturaLocalidad = {
  localidad: string
  tramos: number
  cubiertos: number
  km: number
  kmCubiertos: number
}

export type TotalCobertura = {
  tramos: number
  cubiertos: number
  km: number
  kmCubiertos: number
  fraccion: number
}

export type ResumenCobertura = {
  porLocalidad: CoberturaLocalidad[]
  total: TotalCobertura
}

/** Normaliza las filas de `cobertura_municipio` a un resumen con totales del municipio. */
export function resumirCobertura(filas: readonly FilaCoberturaMunicipio[]): ResumenCobertura {
  const porLocalidad: CoberturaLocalidad[] = filas.map((f) => ({
    localidad: f.localidad,
    tramos: f.tramos,
    cubiertos: f.cubiertos,
    km: aNumero(f.km),
    kmCubiertos: aNumero(f.km_cubiertos),
  }))

  const tramos = porLocalidad.reduce((acumulado, f) => acumulado + f.tramos, 0)
  const cubiertos = porLocalidad.reduce((acumulado, f) => acumulado + f.cubiertos, 0)
  const km = redondear(porLocalidad.reduce((acumulado, f) => acumulado + f.km, 0))
  const kmCubiertos = redondear(porLocalidad.reduce((acumulado, f) => acumulado + f.kmCubiertos, 0))
  const fraccion = tramos > 0 ? cubiertos / tramos : 0

  return { porLocalidad, total: { tramos, cubiertos, km, kmCubiertos, fraccion } }
}

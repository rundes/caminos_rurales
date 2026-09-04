/** Cuadro georreferenciado de la cámara, tal como lo devuelve `obtenerCuadros`. */
export type Cuadro = {
  id: string
  recorrido_id: string
  tramo_id: string | null
  t: string
  lat: number
  lng: number
  rumbo: number | null
  velocidadKmh: number | null
  ruta: string
}

/** Clave de agrupación para cuadros sin tramo asignado. */
export const SIN_TRAMO = 'sin-tramo'

/** Agrupa cuadros por tramo (o `SIN_TRAMO`), cada grupo ordenado por `t` ascendente. */
export function agruparPorTramo(cuadros: readonly Cuadro[]): Map<string, Cuadro[]> {
  const grupos = new Map<string, Cuadro[]>()

  for (const cuadro of cuadros) {
    const clave = cuadro.tramo_id ?? SIN_TRAMO
    const grupo = grupos.get(clave)
    if (grupo) grupo.push(cuadro)
    else grupos.set(clave, [cuadro])
  }

  for (const grupo of grupos.values()) {
    grupo.sort((a, b) => a.t.localeCompare(b.t))
  }

  return grupos
}

export type Vecinos = { anterior: Cuadro | null; siguiente: Cuadro | null }

/** Cuadro anterior/siguiente dentro del mismo tramo que `id`, ordenados por `t`. */
export function vecinos(cuadros: readonly Cuadro[], id: string): Vecinos {
  const actual = cuadros.find((c) => c.id === id)
  if (!actual) return { anterior: null, siguiente: null }

  const grupo = agruparPorTramo(cuadros).get(actual.tramo_id ?? SIN_TRAMO) ?? []
  const indice = grupo.findIndex((c) => c.id === id)
  if (indice === -1) return { anterior: null, siguiente: null }

  return {
    anterior: indice > 0 ? grupo[indice - 1] : null,
    siguiente: indice < grupo.length - 1 ? grupo[indice + 1] : null,
  }
}

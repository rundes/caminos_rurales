import { ALFA_GRAVEDAD, CALIBRACION_MS } from './umbrales'

/** Vector de aceleración en el marco del dispositivo, en m/s². */
export type Vector3 = readonly [number, number, number]

export type FiltroGravedad = {
  /** Incorpora una lectura con gravedad y devuelve la estimación actual de `g`. */
  actualizar: (ax: number, ay: number, az: number) => Vector3
  /** `true` cuando ya pasó la ventana de calibración desde la primera consulta. */
  listo: (t: number) => boolean
}

function numero(valor: number): number {
  return Number.isFinite(valor) ? valor : 0
}

export function producto(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function magnitud(a: Vector3): number {
  return Math.hypot(a[0], a[1], a[2])
}

/** Versor de `a`, o `null` si el vector es nulo (no tiene dirección definida). */
export function normalizar(a: Vector3): Vector3 | null {
  const largo = magnitud(a)
  if (!(largo > 0)) return null
  return [a[0] / largo, a[1] / largo, a[2] / largo]
}

function cruz(a: Vector3, b: Vector3): Vector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

/**
 * Filtro pasa-bajos que estima el vector gravedad a partir del acelerómetro
 * con gravedad incluida. Con `alfa` chico la estimación sigue la orientación
 * media del celular e ignora los golpes del camino.
 *
 * La primera lectura inicializa el filtro (así no arranca desde cero y tarda
 * un segundo en despegar) y `listo` toma como origen de la ventana de
 * calibración la primera vez que se lo consulta.
 */
export function crearFiltroGravedad(
  alfa: number = ALFA_GRAVEDAD,
  ventanaMs: number = CALIBRACION_MS,
): FiltroGravedad {
  let g: Vector3 = [0, 0, 0]
  let muestras = 0
  let inicio: number | null = null

  return {
    actualizar(ax, ay, az) {
      const lectura: Vector3 = [numero(ax), numero(ay), numero(az)]
      g =
        muestras === 0
          ? lectura
          : [
              g[0] + alfa * (lectura[0] - g[0]),
              g[1] + alfa * (lectura[1] - g[1]),
              g[2] + alfa * (lectura[2] - g[2]),
            ]
      muestras += 1
      return g
    },
    listo(t) {
      if (inicio === null) inicio = t
      return muestras > 0 && t - inicio >= ventanaMs
    },
  }
}

/**
 * Componente de `a` sobre la vertical, con signo: positivo cuando apunta en
 * el mismo sentido que la gravedad estimada. Independiente de cómo esté
 * montado el celular. Sin gravedad estimada devuelve 0.
 */
export function proyectarVertical(a: Vector3, g: Vector3): number {
  const versor = normalizar(g)
  if (!versor) return 0
  return producto(a, versor)
}

/**
 * Separa la aceleración horizontal (la que queda al sacarle la componente
 * vertical) en longitudinal y lateral.
 *
 * Con `direccion` —un vector en el marco del dispositivo que apunta hacia
 * adelante— `longitudinal` sale con signo (negativo = frenada) y `lateral`
 * también (signo según el sentido de giro).
 *
 * Sin `direccion` no hay forma de distinguir una frenada de una curva: se
 * devuelve solo la magnitud horizontal en `longitudinal` (siempre ≥ 0) y 0 en
 * `lateral`, así el agregador —que exige signo negativo para una frenada y un
 * umbral en el lateral— no cuenta eventos ambiguos.
 */
export function componentesHorizontales(
  a: Vector3,
  g: Vector3,
  direccion?: Vector3 | null,
): { longitudinal: number; lateral: number } {
  const versor = normalizar(g)
  if (!versor) return { longitudinal: 0, lateral: 0 }

  const vertical = producto(a, versor)
  const horizontal: Vector3 = [
    a[0] - vertical * versor[0],
    a[1] - vertical * versor[1],
    a[2] - vertical * versor[2],
  ]

  const adelante = direccion ? proyectarEnPlano(direccion, versor) : null
  if (!adelante) return { longitudinal: magnitud(horizontal), lateral: 0 }

  const costado = normalizar(cruz(versor, adelante))
  return {
    longitudinal: producto(horizontal, adelante),
    lateral: costado ? producto(horizontal, costado) : 0,
  }
}

/** Versor de `v` proyectado sobre el plano perpendicular a `versorG`. */
function proyectarEnPlano(v: Vector3, versorG: Vector3): Vector3 | null {
  const vertical = producto(v, versorG)
  return normalizar([
    v[0] - vertical * versorG[0],
    v[1] - vertical * versorG[1],
    v[2] - vertical * versorG[2],
  ])
}

/**
 * Utilidades genéricas para procesar listas largas sin mandar todas las
 * llamadas de golpe. Las usa `lib/almacenamiento` para firmar lecturas en
 * lote (Supabase agrupa rutas en un pedido por lote; GCS firma una por una,
 * sin API de lote, así que necesita el límite de concurrencia para no lanzar
 * cientos de promesas sin freno).
 */

/** Parte `items` en sublistas de a lo sumo `tamano` elementos, en orden. */
export function enLotes<T>(items: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano))
  }
  return lotes
}

/**
 * Aplica `fn` a cada elemento de `items`, con a lo sumo `concurrencia`
 * llamadas en vuelo a la vez (un pool de "trabajadores" que van tomando el
 * próximo ítem apenas terminan el anterior). El resultado respeta el orden
 * de `items`, no el orden de finalización.
 */
export async function mapConConcurrencia<T, R>(
  items: readonly T[],
  concurrencia: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(items.length)
  let siguiente = 0

  async function trabajador(): Promise<void> {
    for (;;) {
      const indice = siguiente
      siguiente += 1
      if (indice >= items.length) return
      resultados[indice] = await fn(items[indice], indice)
    }
  }

  const cantidadTrabajadores = Math.max(1, Math.min(concurrencia, items.length))
  await Promise.all(Array.from({ length: cantidadTrabajadores }, trabajador))
  return resultados
}

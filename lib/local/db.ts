import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  BaseCuadros,
  BaseLocal,
  CuadroConBlob,
  CuadroGuardado,
  CuadroLocal,
  CuadroNuevo,
  EstadoRecorridoLocal,
  EstadoSubida,
  ImpactoLocal,
  ItemCola,
  ItemColaCuadros,
  MuestraLocal,
  ObservacionLocal,
  PuntoLocal,
  RecorridoLocal,
} from './tipos'

export const NOMBRE_DB = 'visiovial'
/**
 * v2 agrega el índice `usuarioId` en `recorridos`. Los registros de la v1 no
 * tienen ese campo: quedan fuera del índice y por lo tanto se tratan como
 * ajenos (nunca se procesan ni se suben con la sesión actual).
 *
 * v3 agrega los stores `muestras` e `impactos` de la captura por sensores.
 *
 * v4 agrega `cuadros` (imágenes de la cámara) y su cola `colaCuadros`.
 *
 * v5 separa el blob de `cuadros` a un store aparte (`blobs`, misma clave):
 * una fila de `cuadros` sola pesa unos pocos bytes, así que listar, contar o
 * marcar por índice ya no arrastra megabytes de imagen. Agrega también el
 * índice compuesto `porRecorridoEstado` (`[recorridoId, estadoSubida]`) para
 * poder leer o contar los pendientes de un recorrido sin recorrer todos sus
 * cuadros. La migración mueve los blobs existentes con un cursor.
 *
 * v6 agrega `cuadros.difuminado` (difuminado de privacidad, `lib/
 * privacidad/`): `false` para los cuadros ya guardados de una sesión
 * anterior, así la cola los trata como "todavía sin procesar" y los
 * difumina antes de subirlos igual que a los nuevos, en vez de dejarlos
 * pasar sin pixelar por venir de antes de esta versión.
 */
export const VERSION_DB = 6

const ERROR_SIN_INDEXEDDB = 'Este navegador no puede guardar el recorrido en el dispositivo.'

interface EsquemaVisiovial extends DBSchema {
  recorridos: { key: string; value: RecorridoLocal; indexes: { usuarioId: string } }
  puntos: { key: number; value: PuntoLocal; indexes: { recorridoId: string } }
  observaciones: { key: string; value: ObservacionLocal; indexes: { recorridoId: string } }
  cola: { key: string; value: ItemCola }
  muestras: { key: number; value: MuestraLocal; indexes: { recorridoId: string } }
  impactos: { key: number; value: ImpactoLocal; indexes: { recorridoId: string } }
  cuadros: {
    key: number
    value: CuadroLocal
    indexes: { recorridoId: string; porRecorridoEstado: [string, EstadoSubida] }
  }
  blobs: { key: number; value: { id: number; blob: Blob } }
  colaCuadros: { key: string; value: ItemColaCuadros }
}

export type DbVisiovial = IDBPDatabase<EsquemaVisiovial>

/** Stores que se vacían al cerrar sesión. */
const STORES = [
  'recorridos',
  'puntos',
  'observaciones',
  'cola',
  'muestras',
  'impactos',
  'cuadros',
  'blobs',
  'colaCuadros',
] as const

let conexion: Promise<DbVisiovial> | null = null

function olvidar(): void {
  conexion = null
}

/**
 * Abre (una sola vez por pestaña) la base local. La conexión se memoiza en un
 * módulo, así que todos los hooks comparten la misma. Si la apertura falla la
 * promesa memoizada se descarta, para que el siguiente intento vuelva a abrir.
 */
export function abrirDb(): Promise<DbVisiovial> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error(ERROR_SIN_INDEXEDDB))
  if (!conexion) {
    conexion = openDB<EsquemaVisiovial>(NOMBRE_DB, VERSION_DB, {
      async upgrade(db, anterior, _nueva, tx) {
        if (anterior < 1) {
          db.createObjectStore('puntos', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
          db.createObjectStore('observaciones', { keyPath: 'id' }).createIndex('recorridoId', 'recorridoId')
          db.createObjectStore('cola', { keyPath: 'recorridoId' })
        }
        const recorridos =
          anterior < 1
            ? db.createObjectStore('recorridos', { keyPath: 'id' })
            : tx.objectStore('recorridos')
        if (!recorridos.indexNames.contains('usuarioId')) recorridos.createIndex('usuarioId', 'usuarioId')
        if (anterior < 3) {
          db.createObjectStore('muestras', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
          db.createObjectStore('impactos', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
        }
        const cuadros =
          anterior < 4
            ? db.createObjectStore('cuadros', { keyPath: 'id', autoIncrement: true })
            : tx.objectStore('cuadros')
        if (anterior < 4) {
          cuadros.createIndex('recorridoId', 'recorridoId')
          // La clave va adentro del valor (`keyPath`) porque la cola necesita
          // marcar cuadro por cuadro después de subirlo.
          db.createObjectStore('colaCuadros', { keyPath: 'recorridoId' })
        }
        if (anterior < 5) {
          if (!cuadros.indexNames.contains('porRecorridoEstado')) {
            cuadros.createIndex('porRecorridoEstado', ['recorridoId', 'estadoSubida'])
          }
          const blobs = db.createObjectStore('blobs', { keyPath: 'id' })
          // v4 guardaba el blob adentro de la fila: se lo mueve al store nuevo
          // (misma clave) con un cursor, así nunca se cargan todas las filas
          // (con sus imágenes) en memoria de una sola vez.
          let cursor = await cuadros.openCursor()
          while (cursor) {
            const fila = cursor.value as CuadroLocal & { blob?: Blob }
            const tieneBlob = fila.blob !== undefined
            if (tieneBlob) await blobs.put({ id: cursor.primaryKey as number, blob: fila.blob as Blob })
            const sinBlob: CuadroLocal = {
              id: fila.id,
              recorridoId: fila.recorridoId,
              t: fila.t,
              lat: fila.lat,
              lng: fila.lng,
              rumbo: fila.rumbo,
              velocidadKmh: fila.velocidadKmh,
              estadoSubida: fila.estadoSubida,
              ...(fila.ruta ? { ruta: fila.ruta } : {}),
              tieneBlob,
              difuminado: fila.difuminado ?? false,
            }
            await cursor.update(sinBlob)
            cursor = await cursor.continue()
          }
        }
        if (anterior < 6) {
          // Cursor aparte (no se puede reusar el de arriba: la transacción
          // de upgrade sigue viva, pero el cursor de v5 ya se agotó). Los
          // cuadros de antes de esta versión no tienen `difuminado`: quedan
          // en `false`, así la cola los trata como pendientes de procesar.
          let cursorDifuminado = await cuadros.openCursor()
          while (cursorDifuminado) {
            const fila = cursorDifuminado.value as CuadroLocal
            if (fila.difuminado === undefined) {
              await cursorDifuminado.update({ ...fila, difuminado: false })
            }
            cursorDifuminado = await cursorDifuminado.continue()
          }
        }
      },
      // Otra pestaña quiere migrar: cerramos para no bloquearla.
      blocking(_anterior, _nueva, evento) {
        ;(evento.target as unknown as DbVisiovial)?.close?.()
        olvidar()
      },
      blocked() {
        olvidar()
      },
      terminated() {
        olvidar()
      },
    })
    conexion.catch((error) => {
      console.error('[db]', error)
      olvidar()
    })
  }
  return conexion
}

/** Cierra y olvida la conexión memoizada (solo se usa en tests y al salir). */
export async function cerrarDb(): Promise<void> {
  const pendiente = conexion
  if (!pendiente) return
  olvidar()
  try {
    ;(await pendiente).close()
  } catch (error) {
    console.error('[db]', error)
  }
}

/** Vacía todos los stores locales. Se usa al cerrar sesión. */
export async function limpiarLocal(): Promise<void> {
  const db = await abrirDb()
  const tx = db.transaction(STORES, 'readwrite')
  await Promise.all([...STORES.map((store) => tx.objectStore(store).clear()), tx.done])
}

export async function guardarRecorrido(recorrido: RecorridoLocal): Promise<void> {
  const db = await abrirDb()
  await db.put('recorridos', recorrido)
}

export async function obtenerRecorrido(id: string): Promise<RecorridoLocal | undefined> {
  const db = await abrirDb()
  return db.get('recorridos', id)
}

/** Recorridos del usuario en sesión. Los de la v1 (sin `usuarioId`) quedan afuera. */
export async function listarRecorridos(usuarioId: string): Promise<RecorridoLocal[]> {
  const db = await abrirDb()
  return db.getAllFromIndex('recorridos', 'usuarioId', usuarioId)
}

/** Recorrido del usuario que quedó abierto de una sesión anterior. */
export async function recorridoEnCurso(usuarioId: string): Promise<RecorridoLocal | undefined> {
  const propios = await listarRecorridos(usuarioId)
  return propios.find((r) => r.estado === 'en_curso')
}

export async function cambiarEstadoRecorrido(id: string, estado: EstadoRecorridoLocal): Promise<void> {
  const db = await abrirDb()
  const recorrido = await db.get('recorridos', id)
  if (!recorrido) return
  await db.put('recorridos', { ...recorrido, estado })
}

export async function guardarPunto(punto: PuntoLocal): Promise<void> {
  const db = await abrirDb()
  await db.add('puntos', punto)
}

export async function listarPuntos(recorridoId: string): Promise<PuntoLocal[]> {
  const db = await abrirDb()
  const puntos = await db.getAllFromIndex('puntos', 'recorridoId', recorridoId)
  return puntos.sort((a, b) => a.t - b.t)
}

export async function guardarObservacion(observacion: ObservacionLocal): Promise<void> {
  const db = await abrirDb()
  await db.put('observaciones', observacion)
}

export async function listarObservaciones(recorridoId: string): Promise<ObservacionLocal[]> {
  const db = await abrirDb()
  return db.getAllFromIndex('observaciones', 'recorridoId', recorridoId)
}

export async function guardarMuestra(muestra: MuestraLocal): Promise<void> {
  const db = await abrirDb()
  await db.add('muestras', muestra)
}

/** Segmentos de sensores de un recorrido, en orden cronológico. */
export async function listarMuestras(recorridoId: string): Promise<MuestraLocal[]> {
  const db = await abrirDb()
  const muestras = await db.getAllFromIndex('muestras', 'recorridoId', recorridoId)
  return muestras.sort((a, b) => a.t - b.t)
}

export async function guardarImpacto(impacto: ImpactoLocal): Promise<void> {
  const db = await abrirDb()
  await db.add('impactos', impacto)
}

/** Impactos detectados en un recorrido, en orden cronológico. */
export async function listarImpactos(recorridoId: string): Promise<ImpactoLocal[]> {
  const db = await abrirDb()
  const impactos = await db.getAllFromIndex('impactos', 'recorridoId', recorridoId)
  return impactos.sort((a, b) => a.t - b.t)
}

/** Encola un recorrido para subir. Si ya estaba encolado no reinicia sus intentos. */
export async function encolar(recorridoId: string): Promise<void> {
  const db = await abrirDb()
  const existente = await db.get('cola', recorridoId)
  if (existente) return
  await db.put('cola', { recorridoId, intentos: 0, proximoIntento: 0 })
}

export async function obtenerItemCola(recorridoId: string): Promise<ItemCola | undefined> {
  const db = await abrirDb()
  return db.get('cola', recorridoId)
}

export async function guardarItemCola(item: ItemCola): Promise<void> {
  const db = await abrirDb()
  await db.put('cola', item)
}

export async function listarCola(): Promise<ItemCola[]> {
  const db = await abrirDb()
  return db.getAll('cola')
}

export async function borrarItemCola(recorridoId: string): Promise<void> {
  const db = await abrirDb()
  await db.delete('cola', recorridoId)
}

/**
 * Guarda un cuadro de la cámara y devuelve la clave que le asignó IndexedDB.
 * La fila (sin blob) y el blob (en su store aparte, misma clave) se escriben
 * en una única transacción: nunca queda uno sin el otro.
 */
export async function guardarCuadro(cuadro: CuadroNuevo): Promise<number> {
  const db = await abrirDb()
  const { blob, ...resto } = cuadro
  const tx = db.transaction(['cuadros', 'blobs'], 'readwrite')
  const id = await tx.objectStore('cuadros').add({ ...resto, tieneBlob: true, difuminado: false })
  await tx.objectStore('blobs').put({ id, blob })
  await tx.done
  return id
}

/** Cuadros de un recorrido (sin blob), en orden cronológico y opcionalmente por estado. */
export async function listarCuadros(
  recorridoId: string,
  estado?: EstadoSubida,
): Promise<CuadroGuardado[]> {
  const db = await abrirDb()
  const cuadros = (await db.getAllFromIndex('cuadros', 'recorridoId', recorridoId)) as CuadroGuardado[]
  const filtrados = estado ? cuadros.filter((c) => c.estadoSubida === estado) : cuadros
  return filtrados.sort((a, b) => a.t - b.t)
}

/**
 * Cuadros `pendiente` de un recorrido, hasta `limite`, con su blob ya cargado.
 * Recorre el índice compuesto `porRecorridoEstado` con un cursor y corta ni
 * bien junta `limite` filas: nunca carga en memoria más blobs que los de un
 * lote de subida.
 */
export async function listarCuadrosPendientes(
  recorridoId: string,
  limite: number,
): Promise<CuadroConBlob[]> {
  const db = await abrirDb()
  const tx = db.transaction(['cuadros', 'blobs'], 'readonly')
  const indice = tx.objectStore('cuadros').index('porRecorridoEstado')
  const blobs = tx.objectStore('blobs')
  const salida: CuadroConBlob[] = []
  let cursor = await indice.openCursor(IDBKeyRange.only([recorridoId, 'pendiente']))
  while (cursor && salida.length < limite) {
    const fila = cursor.value as CuadroGuardado
    const filaBlob = fila.tieneBlob ? await blobs.get(fila.id) : undefined
    salida.push({ ...fila, blob: filaBlob?.blob })
    cursor = await cursor.continue()
  }
  await tx.done
  return salida.sort((a, b) => a.t - b.t)
}

export async function contarCuadros(recorridoId: string, estado?: EstadoSubida): Promise<number> {
  const db = await abrirDb()
  if (!estado) return db.countFromIndex('cuadros', 'recorridoId', recorridoId)
  return db.countFromIndex('cuadros', 'porRecorridoEstado', IDBKeyRange.only([recorridoId, estado]))
}

/** Deja el cuadro en el estado indicado, guardando la ruta del objeto subido. */
export async function marcarCuadro(id: number, estado: EstadoSubida, ruta?: string): Promise<void> {
  const db = await abrirDb()
  const cuadro = await db.get('cuadros', id)
  if (!cuadro) return
  await db.put('cuadros', { ...cuadro, estadoSubida: estado, ...(ruta ? { ruta } : {}) })
}

/**
 * Guarda el cuadro ya difuminado (blob nuevo, resultado de `lib/privacidad/`)
 * y lo marca `difuminado: true`, en una única transacción: fila y blob nunca
 * quedan desincronizados, igual que en `guardarCuadro`. Un cuadro que ya no
 * está (se descartó entre que se leyó y se difuminó) no rompe nada: el `put`
 * de `blobs` simplemente no tiene fila que acompañar.
 */
export async function marcarDifuminado(id: number, blob: Blob): Promise<void> {
  const db = await abrirDb()
  const tx = db.transaction(['cuadros', 'blobs'], 'readwrite')
  const cuadro = await tx.objectStore('cuadros').get(id)
  if (cuadro) await tx.objectStore('cuadros').put({ ...cuadro, difuminado: true })
  await tx.objectStore('blobs').put({ id, blob })
  await tx.done
}

/**
 * Libera los blobs de los cuadros ya subidos: la fila queda (para el contador
 * y la ruta) pero la imagen, que es lo que ocupa, se borra del dispositivo.
 * Recorre y actualiza `cuadros` y borra de `blobs` en una única transacción.
 */
export async function borrarCuadrosSubidos(recorridoId: string): Promise<number> {
  const db = await abrirDb()
  const tx = db.transaction(['cuadros', 'blobs'], 'readwrite')
  const indice = tx.objectStore('cuadros').index('porRecorridoEstado')
  const blobs = tx.objectStore('blobs')
  let liberados = 0
  let cursor = await indice.openCursor(IDBKeyRange.only([recorridoId, 'subida']))
  while (cursor) {
    const fila = cursor.value as CuadroGuardado
    if (fila.tieneBlob) {
      await cursor.update({ ...fila, tieneBlob: false })
      await blobs.delete(fila.id)
      liberados += 1
    }
    cursor = await cursor.continue()
  }
  await tx.done
  return liberados
}

/**
 * Da por perdidos los cuadros pendientes de un recorrido: quedan en `error` y
 * sin blob. La fila se conserva para poder contarlos en el resumen; el blob se
 * libera porque ya no se va a reintentar la subida. Recorre y actualiza
 * `cuadros` y borra de `blobs` en una única transacción.
 */
export async function marcarCuadrosEnError(recorridoId: string): Promise<number> {
  const db = await abrirDb()
  const tx = db.transaction(['cuadros', 'blobs'], 'readwrite')
  const indice = tx.objectStore('cuadros').index('porRecorridoEstado')
  const blobs = tx.objectStore('blobs')
  let marcados = 0
  let cursor = await indice.openCursor(IDBKeyRange.only([recorridoId, 'pendiente']))
  while (cursor) {
    const fila = cursor.value as CuadroGuardado
    if (fila.tieneBlob) await blobs.delete(fila.id)
    await cursor.update({ ...fila, estadoSubida: 'error', tieneBlob: false })
    marcados += 1
    cursor = await cursor.continue()
  }
  await tx.done
  return marcados
}

/** Encola los cuadros de un recorrido. Si ya estaba encolado no reinicia sus intentos. */
export async function encolarCuadros(recorridoId: string): Promise<void> {
  const db = await abrirDb()
  const existente = await db.get('colaCuadros', recorridoId)
  if (existente) return
  await db.put('colaCuadros', { recorridoId, intentos: 0, proximoIntento: 0 })
}

export async function obtenerItemColaCuadros(
  recorridoId: string,
): Promise<ItemColaCuadros | undefined> {
  const db = await abrirDb()
  return db.get('colaCuadros', recorridoId)
}

export async function guardarItemColaCuadros(item: ItemColaCuadros): Promise<void> {
  const db = await abrirDb()
  await db.put('colaCuadros', item)
}

export async function listarColaCuadros(): Promise<ItemColaCuadros[]> {
  const db = await abrirDb()
  return db.getAll('colaCuadros')
}

export async function borrarItemColaCuadros(recorridoId: string): Promise<void> {
  const db = await abrirDb()
  await db.delete('colaCuadros', recorridoId)
}

/** Implementación de `BaseLocal` sobre IndexedDB, para inyectar en la sincronización. */
export const baseLocal: BaseLocal = {
  guardarRecorrido,
  obtenerRecorrido,
  recorridoEnCurso,
  listarRecorridos,
  guardarPunto,
  listarPuntos,
  guardarObservacion,
  listarObservaciones,
  guardarMuestra,
  listarMuestras,
  guardarImpacto,
  listarImpactos,
  encolar,
  obtenerItemCola,
  guardarItemCola,
  listarCola,
  borrarItemCola,
}

/** Implementación de `BaseCuadros` sobre IndexedDB, para la cola de cuadros. */
export const baseCuadros: BaseCuadros = {
  listarRecorridos,
  listarCuadrosPendientes,
  contarCuadros,
  marcarCuadro,
  marcarDifuminado,
  borrarCuadrosSubidos,
  marcarCuadrosEnError,
  encolarCuadros,
  obtenerItemColaCuadros,
  guardarItemColaCuadros,
  listarColaCuadros,
  borrarItemColaCuadros,
}

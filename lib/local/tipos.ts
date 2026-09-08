import type { Impacto, MuestraSensor } from '@/lib/sensores/tipos'
import type { Severidad, TipoFalla } from '@/lib/tipos'

export type EstadoRecorridoLocal =
  | 'en_curso'
  | 'finalizado'
  | 'subiendo'
  | 'subido'
  | 'error'
  | 'descartado'

/** Recorrido tal como se guarda en el dispositivo mientras se graba y hasta que se sube. */
export type RecorridoLocal = {
  id: string
  /** Dueño del recorrido. La cola solo procesa lo que pertenece al usuario en sesión. */
  usuarioId: string
  inicio: string
  fin?: string
  estado: EstadoRecorridoLocal
  municipio: string
  puntosGps: number
  km: number
  /** Último error del servidor, para poder mostrarlo cuando el estado es `error`. */
  ultimoError?: string
}

/** Punto GPS aceptado por el filtro del grabador, ya asociado a un recorrido. */
export type PuntoLocal = {
  recorridoId: string
  lat: number
  lng: number
  t: number
  precision: number
}

/** Segmento agregado de sensores, ya asociado a un recorrido. */
export type MuestraLocal = MuestraSensor & { recorridoId: string }

/** Impacto detectado por el acelerómetro, ya asociado a un recorrido. */
export type ImpactoLocal = Impacto & { recorridoId: string }

export type EstadoSubida = 'pendiente' | 'subida' | 'error'

export type TipoEvidencia = 'imagen' | 'video'

/**
 * Observación registrada en ruta. El archivo viaja como `Blob` hasta que se
 * sube; después queda solo la `evidencia` (ruta guardable) y el blob se borra.
 */
export type ObservacionLocal = {
  id: string
  recorridoId: string
  tipo_falla: TipoFalla
  severidad: Severidad
  latitud: number
  longitud: number
  descripcion?: string
  archivo?: Blob
  nombreArchivo?: string
  tipoArchivo?: string
  evidencia?: { ruta: string; tipo: TipoEvidencia }
  estadoSubida: EstadoSubida
}

/**
 * Cuadro de la cámara georreferenciado. El `id` lo pone IndexedDB al guardarlo.
 * El blob vive aparte, en el store `blobs` (misma clave): la fila de `cuadros`
 * solo sabe si todavía lo tiene (`tieneBlob`), así los índices y los conteos
 * no cargan megabytes de imagen para leer un campo.
 *
 * `difuminado`: si ya se le aplicó el pipeline de privacidad
 * (`lib/privacidad/`) y el blob guardado es el resultado de eso, no el
 * original de la cámara. Se marca antes de subir (`lib/local/cola-
 * cuadros.ts`) para que un reintento de subida no lo vuelva a difuminar (es
 * lossy: aplicarlo dos veces no suma privacidad y sí pierde nitidez de más).
 */
export type CuadroLocal = {
  id?: number
  recorridoId: string
  t: number
  lat: number
  lng: number
  rumbo: number | null
  velocidadKmh: number | null
  estadoSubida: EstadoSubida
  ruta?: string
  tieneBlob: boolean
  difuminado: boolean
}

/** Cuadro ya guardado: tiene la clave que asignó IndexedDB. */
export type CuadroGuardado = CuadroLocal & { id: number }

/** Cuadro nuevo a guardar: todavía no tiene `id` ni `tieneBlob` (los pone `guardarCuadro`). */
export type CuadroNuevo = {
  recorridoId: string
  t: number
  lat: number
  lng: number
  rumbo: number | null
  velocidadKmh: number | null
  blob: Blob
  estadoSubida: EstadoSubida
}

/** Cuadro guardado con su blob adjunto, cuando se lo cargó aparte (lectura acotada). */
export type CuadroConBlob = CuadroGuardado & { blob?: Blob }

/** Entrada de la cola de subida: un recorrido finalizado esperando sincronizarse. */
export type ItemCola = {
  recorridoId: string
  intentos: number
  proximoIntento: number
  ultimoError?: string
}

/** Entrada de la cola de cuadros: mismos campos y mismo backoff que `ItemCola`. */
export type ItemColaCuadros = ItemCola

/**
 * Operaciones que la sincronización necesita del almacenamiento local.
 * `lib/local/db.ts` la implementa con IndexedDB; los tests usan un doble.
 */
export interface BaseLocal {
  guardarRecorrido(recorrido: RecorridoLocal): Promise<void>
  obtenerRecorrido(id: string): Promise<RecorridoLocal | undefined>
  recorridoEnCurso(usuarioId: string): Promise<RecorridoLocal | undefined>
  listarRecorridos(usuarioId: string): Promise<RecorridoLocal[]>
  guardarPunto(punto: PuntoLocal): Promise<void>
  listarPuntos(recorridoId: string): Promise<PuntoLocal[]>
  guardarObservacion(observacion: ObservacionLocal): Promise<void>
  listarObservaciones(recorridoId: string): Promise<ObservacionLocal[]>
  /**
   * Sensores. Son opcionales para que un doble de test sin sensores siga
   * cumpliendo el contrato: sin ellos el payload simplemente no lleva muestras.
   */
  guardarMuestra?(muestra: MuestraLocal): Promise<void>
  listarMuestras?(recorridoId: string): Promise<MuestraLocal[]>
  guardarImpacto?(impacto: ImpactoLocal): Promise<void>
  listarImpactos?(recorridoId: string): Promise<ImpactoLocal[]>
  encolar(recorridoId: string): Promise<void>
  obtenerItemCola(recorridoId: string): Promise<ItemCola | undefined>
  guardarItemCola(item: ItemCola): Promise<void>
  listarCola(): Promise<ItemCola[]>
  borrarItemCola(recorridoId: string): Promise<void>
}

/**
 * Operaciones que la cola de cuadros necesita del almacenamiento local. Va
 * aparte de `BaseLocal` porque un dispositivo sin cámara sincroniza igual.
 */
export interface BaseCuadros {
  listarRecorridos(usuarioId: string): Promise<RecorridoLocal[]>
  /**
   * Cuadros pendientes de un recorrido, hasta `limite`, con su blob ya
   * cargado. Lectura acotada por cursor: nunca trae más blobs que los que se
   * van a subir en este lote.
   */
  listarCuadrosPendientes(recorridoId: string, limite: number): Promise<CuadroConBlob[]>
  contarCuadros(recorridoId: string, estado?: EstadoSubida): Promise<number>
  marcarCuadro(id: number, estado: EstadoSubida, ruta?: string): Promise<void>
  /**
   * Guarda el cuadro ya difuminado (blob nuevo) y lo marca `difuminado`, en
   * una única operación: así un reintento de subida ve el trabajo hecho y no
   * vuelve a difuminar ni sube el original sin procesar si la subida en sí
   * falla después.
   */
  marcarDifuminado(id: number, blob: Blob): Promise<void>
  /** Libera los blobs de los cuadros ya subidos. Devuelve cuántos liberó. */
  borrarCuadrosSubidos(recorridoId: string): Promise<number>
  /**
   * Da por perdidos los cuadros pendientes de un recorrido: los deja en
   * `error` y libera sus blobs (la fila queda para poder contarlos en la UI).
   * Devuelve cuántos marcó.
   */
  marcarCuadrosEnError(recorridoId: string): Promise<number>
  encolarCuadros(recorridoId: string): Promise<void>
  obtenerItemColaCuadros(recorridoId: string): Promise<ItemColaCuadros | undefined>
  guardarItemColaCuadros(item: ItemColaCuadros): Promise<void>
  listarColaCuadros(): Promise<ItemColaCuadros[]>
  borrarItemColaCuadros(recorridoId: string): Promise<void>
}

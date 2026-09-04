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

/** Entrada de la cola de subida: un recorrido finalizado esperando sincronizarse. */
export type ItemCola = {
  recorridoId: string
  intentos: number
  proximoIntento: number
  ultimoError?: string
}

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

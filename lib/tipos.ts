export type ResultadoAccion<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type Severidad = 'baja' | 'media' | 'alta'

export type TipoFalla =
  | 'bache'
  | 'carcava'
  | 'acumulacion_agua'
  | 'falta_alcantarilla'
  | 'maleza_alta'
  | 'alcantarilla_rota'
  | 'senalizacion'
  | 'otro'

export type OrigenObservacion = 'manual' | 'sensor'

export type PuntoFalla = {
  id: string
  tipo_falla: TipoFalla
  severidad: Severidad
  latitud: number
  longitud: number
  fecha: string
  url_evidencia_imagen: string | null
  url_evidencia_video: string | null
  municipio: string
  origen: OrigenObservacion
  magnitud: number | null
}

export const ETIQUETA_TIPO_FALLA: Record<TipoFalla, string> = {
  bache: 'Bache',
  carcava: 'Cárcava',
  acumulacion_agua: 'Acumulación de agua',
  falta_alcantarilla: 'Falta de alcantarilla',
  maleza_alta: 'Maleza alta',
  alcantarilla_rota: 'Alcantarilla rota',
  senalizacion: 'Señalización',
  otro: 'Otro',
}

export const ETIQUETA_SEVERIDAD: Record<Severidad, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

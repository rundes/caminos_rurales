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

export type PuntoFalla = {
  id: string
  tipo_falla: TipoFalla
  severidad: Severidad
  latitud: number
  longitud: number
  fecha: string
  url_evidencia_imagen: string | null
  municipio: string
}

export const ETIQUETA_TIPO_FALLA: Record<TipoFalla, string> = {
  bache: 'Bache',
  carcava: 'Cárcava',
  acumulacion_agua: 'Acumulación de agua',
  falta_alcantarilla: 'Falta de alcantarilla',
  maleza_alta: 'Maleza alta',
}

export const ETIQUETA_SEVERIDAD: Record<Severidad, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Boton } from '@/components/Boton'
import { medirDuracionVideo, validarEvidencia, type MedirDuracion } from '@/lib/evidencia'
import { ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_FALLA, type Severidad, type TipoFalla } from '@/lib/tipos'

export type NuevaObservacion = {
  tipo_falla: TipoFalla
  severidad: Severidad
  descripcion?: string
  archivo?: File
}

type Props = {
  posicion: { lat: number; lng: number } | null
  onGuardar: (observacion: NuevaObservacion) => void | Promise<void>
  onCancelar: () => void
  /** Inyectable para poder testear la validación de duración sin un video real. */
  medirDuracion?: MedirDuracion
}

const MAX_DESCRIPCION = 500
const SEVERIDADES: Severidad[] = ['baja', 'media', 'alta']
const TIPOS = Object.keys(ETIQUETA_TIPO_FALLA) as TipoFalla[]
const ERROR_SIN_POSICION = 'Todavía no tenemos tu ubicación. Esperá unos segundos.'

const CLASES_SEVERIDAD: Record<Severidad, string> = {
  baja: 'border-green-600 text-green-800',
  media: 'border-amber-500 text-amber-700',
  alta: 'border-red-600 text-red-700',
}

/** Formulario rápido de observación en ruta: tipo, severidad, evidencia y nota. */
export function ObservacionForm({ posicion, onGuardar, onCancelar, medirDuracion = medirDuracionVideo }: Props) {
  const [tipo, setTipo] = useState<TipoFalla>('bache')
  const [severidad, setSeveridad] = useState<Severidad>('media')
  const [descripcion, setDescripcion] = useState('')
  const [archivo, setArchivo] = useState<File | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [validando, setValidando] = useState(false)
  const entradaArchivo = useRef<HTMLInputElement>(null)

  async function alElegirArchivo(elegido: File | undefined) {
    if (!elegido) {
      setArchivo(undefined)
      setError(null)
      return
    }
    setValidando(true)
    try {
      const problema = await validarEvidencia(elegido, medirDuracion)
      if (problema) {
        setArchivo(undefined)
        setError(problema)
        // Sin limpiar el input, volver a elegir el mismo archivo no dispara `change`.
        if (entradaArchivo.current) entradaArchivo.current.value = ''
        return
      }
      setError(null)
      setArchivo(elegido)
    } finally {
      setValidando(false)
    }
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!posicion) {
      setError(ERROR_SIN_POSICION)
      return
    }
    setGuardando(true)
    try {
      await onGuardar({
        tipo_falla: tipo,
        severidad,
        descripcion: descripcion.trim() || undefined,
        archivo,
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" aria-label="Nueva observación">
      <div className="flex flex-col gap-1">
        <label htmlFor="tipo" className="text-sm font-medium text-gray-700">
          Tipo
        </label>
        <select
          id="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoFalla)}
          className="rounded-xl border border-gray-300 px-3 py-3 text-base"
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_FALLA[t]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-gray-700">Severidad</legend>
        <div className="grid grid-cols-3 gap-2">
          {SEVERIDADES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={severidad === s}
              onClick={() => setSeveridad(s)}
              className={`rounded-xl border-2 py-4 text-base font-semibold ${CLASES_SEVERIDAD[s]} ${
                severidad === s ? 'bg-gray-100' : 'bg-white'
              }`}
            >
              {ETIQUETA_SEVERIDAD[s]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="evidencia" className="text-sm font-medium text-gray-700">
          Foto o video (máx. 15 s)
        </label>
        <input
          ref={entradaArchivo}
          id="evidencia"
          type="file"
          accept="image/*,video/*"
          capture="environment"
          onChange={(e) => void alElegirArchivo(e.target.files?.[0])}
          className="rounded-xl border border-gray-300 px-3 py-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="descripcion" className="text-sm font-medium text-gray-700">
          Nota (opcional)
        </label>
        <textarea
          id="descripcion"
          value={descripcion}
          maxLength={MAX_DESCRIPCION}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          className="rounded-xl border border-gray-300 px-3 py-3 text-base"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Boton type="submit" cargando={guardando} disabled={validando}>
          Guardar observación
        </Boton>
        <Boton type="button" variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}

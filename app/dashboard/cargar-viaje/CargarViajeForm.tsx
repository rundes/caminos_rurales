'use client'

import { useRouter } from 'next/navigation'
import { useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { Boton } from '@/components/Boton'
import { TIPOS_PERMITIDOS } from '@/lib/archivos'
import { crearClienteNavegador } from '@/lib/supabase/client'
import {
  aplicarParche,
  crearItem,
  ETIQUETA_ESTADO,
  procesarRelevamiento,
  rutasSubidas,
  subirPendientes,
  type ArchivoEnLista,
} from '@/lib/subida'
import { ORIGENES_DATOS } from '@/lib/validaciones'
import { crearRelevamiento, registrarArchivos } from './actions'

type Camino = { id: string; nombre_codigo: string }
type Fase = 'formulario' | 'subiendo' | 'procesando' | 'listo' | 'error'

const ETIQUETA_ORIGEN: Record<(typeof ORIGENES_DATOS)[number], string> = {
  formulario: 'Formulario manual',
  camara_dashcam: 'Cámara / dashcam',
  app_sensor: 'App con sensores',
}

const CAMPO = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-lg'

export function CargarViajeForm({ caminos, uid }: { caminos: Camino[]; uid: string }) {
  const router = useRouter()
  const [archivos, setArchivos] = useState<ArchivoEnLista[]>([])
  const [fase, setFase] = useState<Fase>('formulario')
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<string | null>(null)
  const [relevamientoId, setRelevamientoId] = useState<string | null>(null)
  const [km, setKm] = useState<number | null>(null)
  const [llaveFormulario, setLlaveFormulario] = useState(0)

  const ocupado = fase === 'subiendo' || fase === 'procesando'

  function agregar(lista: FileList | null) {
    if (!lista || ocupado) return
    const nuevos = Array.from(lista).map(crearItem)
    setArchivos((prev) => [...prev, ...nuevos])
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    agregar(e.dataTransfer.files)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    agregar(e.target.files)
    e.target.value = ''
  }

  function fallar(mensaje: string) {
    setFase('error')
    setError(mensaje)
  }

  async function subirYProcesar(id: string, kmRelevamiento: number) {
    setError(null)
    setFase('subiendo')
    const finales = await subirPendientes(crearClienteNavegador(), uid, id, archivos, (idArchivo, parche) =>
      setArchivos((prev) => aplicarParche(prev, idArchivo, parche)),
    )
    const rutas = rutasSubidas(finales)

    const registro = await registrarArchivos(id, kmRelevamiento, rutas)
    if (!registro.ok) return fallar(registro.error)

    const fallidos = finales.filter((a) => a.estado === 'error').length
    if (fallidos > 0) return fallar(`No se pudieron subir ${fallidos} archivo(s). Podés reintentar.`)

    setFase('procesando')
    const procesado = await procesarRelevamiento(id)
    if (!procesado.ok) return fallar(procesado.error)

    setFase('listo')
    setResumen(
      `Relevamiento guardado. ${rutas.length} archivo(s) subidos, ${procesado.data.fallas} fallas detectadas.`,
    )
    router.refresh()
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (relevamientoId !== null && km !== null) return subirYProcesar(relevamientoId, km)

    const fd = new FormData(e.currentTarget)
    const creado = await crearRelevamiento({
      camino_id: String(fd.get('camino_id') ?? ''),
      origen_datos: String(fd.get('origen_datos') ?? ''),
      km: String(fd.get('km') ?? '0'),
    })
    if (!creado.ok) return fallar(creado.error)

    setRelevamientoId(creado.data.id)
    setKm(creado.data.km)
    return subirYProcesar(creado.data.id, creado.data.km)
  }

  function reiniciar() {
    setArchivos([])
    setFase('formulario')
    setError(null)
    setResumen(null)
    setRelevamientoId(null)
    setKm(null)
    setLlaveFormulario((n) => n + 1)
    router.refresh()
  }

  if (fase === 'listo') {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-green-800">
          {resumen}
        </p>
        <Boton type="button" onClick={() => router.push('/dashboard/mapa')}>
          Ver en el mapa
        </Boton>
        <Boton type="button" variante="secundario" onClick={reiniciar}>
          Cargar otro viaje
        </Boton>
      </div>
    )
  }

  const puedeReintentar = fase === 'error' && relevamientoId !== null && km !== null

  return (
    <form key={llaveFormulario} onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Camino</span>
        <select name="camino_id" required defaultValue="" className={CAMPO} disabled={ocupado}>
          <option value="" disabled>
            Elegí un camino
          </option>
          {caminos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre_codigo}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Origen de los datos</span>
        <select name="origen_datos" required defaultValue="camara_dashcam" className={CAMPO} disabled={ocupado}>
          {ORIGENES_DATOS.map((o) => (
            <option key={o} value={o}>
              {ETIQUETA_ORIGEN[o]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Kilómetros recorridos</span>
        <input name="km" type="number" step="0.1" min="0" max="1000" required className={CAMPO} disabled={ocupado} />
      </label>

      <div
        onDragOver={(e) => !ocupado && e.preventDefault()}
        onDrop={onDrop}
        className="rounded-2xl border-2 border-dashed border-green-700 bg-white p-6 text-center"
      >
        <p className="mb-3 text-gray-600">Arrastrá fotos o videos, o tocá para elegir</p>
        <input
          id="archivos-evidencia"
          type="file"
          multiple
          accept={TIPOS_PERMITIDOS.join(',')}
          onChange={onChange}
          disabled={ocupado}
          className="peer sr-only"
        />
        <label
          htmlFor="archivos-evidencia"
          className="inline-block cursor-pointer rounded-xl bg-green-700 px-4 py-3 font-semibold text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-green-900"
        >
          Elegir archivos
        </label>
      </div>

      {archivos.length > 0 && (
        <ul aria-live="polite" className="divide-y rounded-2xl bg-white shadow-sm">
          {archivos.map((a) => (
            <li key={a.id} className="flex justify-between gap-3 px-4 py-2 text-sm">
              <span className="truncate">{a.archivo.name}</span>
              <span
                className={
                  a.estado === 'error' || a.estado === 'invalido' ? 'shrink-0 text-red-700' : 'shrink-0 text-gray-500'
                }
              >
                {a.mensaje ?? ETIQUETA_ESTADO[a.estado]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {error}
        </p>
      )}

      {fase === 'procesando' && (
        <p role="status" className="rounded-xl bg-yellow-50 px-4 py-3 text-yellow-800">
          Analizando evidencia…
        </p>
      )}

      {puedeReintentar ? (
        <Boton type="button" onClick={() => subirYProcesar(relevamientoId, km)}>
          Reintentar
        </Boton>
      ) : (
        <Boton type="submit" cargando={ocupado} disabled={caminos.length === 0}>
          Guardar relevamiento
        </Boton>
      )}
    </form>
  )
}

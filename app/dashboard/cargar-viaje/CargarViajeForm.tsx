'use client'

import { useRouter } from 'next/navigation'
import { useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { Boton } from '@/components/Boton'
import { rutaEvidencia, validarArchivo } from '@/lib/archivos'
import { crearClienteNavegador } from '@/lib/supabase/client'
import { ORIGENES_DATOS } from '@/lib/validaciones'
import { crearRelevamiento, registrarArchivos } from './actions'

type Camino = { id: string; nombre_codigo: string }
type EstadoArchivo = { archivo: File; estado: 'pendiente' | 'subiendo' | 'ok' | 'error'; mensaje?: string }
type Fase = 'formulario' | 'subiendo' | 'procesando' | 'listo' | 'error'

const ETIQUETA_ORIGEN: Record<(typeof ORIGENES_DATOS)[number], string> = {
  formulario: 'Formulario manual',
  camara_dashcam: 'Cámara / dashcam',
  app_sensor: 'App con sensores',
}

const CAMPO = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-lg'

export function CargarViajeForm({ caminos, uid }: { caminos: Camino[]; uid: string }) {
  const router = useRouter()
  const [archivos, setArchivos] = useState<EstadoArchivo[]>([])
  const [fase, setFase] = useState<Fase>('formulario')
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<string | null>(null)

  function agregar(lista: FileList | null) {
    if (!lista) return
    const nuevos: EstadoArchivo[] = Array.from(lista).map((archivo) => {
      const invalido = validarArchivo(archivo)
      return invalido ? { archivo, estado: 'error', mensaje: invalido } : { archivo, estado: 'pendiente' }
    })
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const km = String(fd.get('km') ?? '0')

    const creado = await crearRelevamiento({
      camino_id: String(fd.get('camino_id') ?? ''),
      origen_datos: String(fd.get('origen_datos') ?? ''),
      km,
    })
    if (!creado.ok) {
      setError(creado.error)
      return
    }

    setFase('subiendo')
    const supabase = crearClienteNavegador()
    const rutas: string[] = []
    const validos = archivos.filter((a) => a.estado !== 'error')

    for (const item of validos) {
      setArchivos((prev) => prev.map((a) => (a === item ? { ...a, estado: 'subiendo' } : a)))
      const ruta = rutaEvidencia(uid, creado.data.id, item.archivo.name)
      const { error: errorSubida } = await supabase.storage.from('evidencia-vial').upload(ruta, item.archivo)
      if (errorSubida) {
        setArchivos((prev) =>
          prev.map((a) => (a === item ? { ...a, estado: 'error', mensaje: errorSubida.message } : a)),
        )
      } else {
        rutas.push(ruta)
        setArchivos((prev) => prev.map((a) => (a === item ? { ...a, estado: 'ok' } : a)))
      }
    }

    const registro = await registrarArchivos(creado.data.id, Number(km), rutas)
    if (!registro.ok) {
      setFase('error')
      setError(registro.error)
      return
    }

    setFase('procesando')
    const respuesta = await fetch('/api/procesar-ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relevamiento_id: creado.data.id }),
    })
    const cuerpo = (await respuesta.json()) as { ok: boolean; fallas?: number; error?: string }
    if (!respuesta.ok || !cuerpo.ok) {
      setFase('error')
      setError(cuerpo.error ?? `Error ${respuesta.status} al procesar`)
      return
    }

    setFase('listo')
    setResumen(`Relevamiento guardado. ${rutas.length} archivo(s) subidos, ${cuerpo.fallas ?? 0} fallas detectadas.`)
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
        <Boton type="button" variante="secundario" onClick={() => window.location.reload()}>
          Cargar otro viaje
        </Boton>
      </div>
    )
  }

  const ocupado = fase === 'subiendo' || fase === 'procesando'

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="rounded-2xl border-2 border-dashed border-green-700 bg-white p-6 text-center"
      >
        <p className="mb-3 text-gray-600">Arrastrá fotos o videos, o tocá para elegir</p>
        <label className="inline-block cursor-pointer rounded-xl bg-green-700 px-4 py-3 font-semibold text-white">
          Elegir archivos
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            onChange={onChange}
            className="hidden"
            disabled={ocupado}
          />
        </label>
      </div>

      {archivos.length > 0 && (
        <ul className="divide-y rounded-2xl bg-white shadow-sm">
          {archivos.map((a, i) => (
            <li key={`${a.archivo.name}-${i}`} className="flex justify-between px-4 py-2 text-sm">
              <span className="truncate">{a.archivo.name}</span>
              <span className={a.estado === 'error' ? 'text-red-700' : 'text-gray-500'}>
                {a.estado === 'error' ? a.mensaje : a.estado}
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

      <Boton type="submit" cargando={ocupado} disabled={caminos.length === 0}>
        Guardar relevamiento
      </Boton>
    </form>
  )
}

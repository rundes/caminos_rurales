'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Boton } from '@/components/Boton'
import { MapaDibujarTramoCliente } from '@/components/MapaDibujarTramoCliente'
import type { PuntoTramo } from '@/components/MapaDibujarTramo'
import { formatearKm } from '@/lib/cobertura-resumen'
import { kmDeTrack } from '@/lib/track'
import { actualizarTramo, crearTramo } from './actions'

type ValoresTramo = {
  nombreCodigo: string
  localidad: string
  geometria: [number, number][] // [lng, lat], igual que `tramos.geometria`
  activo: boolean
}

type Props = {
  modo: 'crear' | 'editar'
  tramoId?: string
  centro: [number, number]
  valoresIniciales?: ValoresTramo
}

const ERROR_SIN_PUNTOS = 'Dibujá el tramo en el mapa: hacé click para agregar al menos 2 puntos.'

/** [lng, lat] (formato de guardado) → {lat, lng} (formato del mapa/`kmDeTrack`). */
function aPuntos(geometria: readonly [number, number][]): PuntoTramo[] {
  return geometria.map(([lng, lat]) => ({ lat, lng }))
}

/**
 * Formulario de alta/edición de un tramo, compartido por
 * `/dashboard/tramos/nuevo` y `/dashboard/tramos/[id]/editar`. Dibuja la
 * geometría con click-to-add-vertex (sin biblioteca de dibujo) y muestra el
 * km en vivo con el mismo haversine que calcula el servidor
 * (`kmDeGeometria`/`kmDeTrack`) — el valor que ve la persona mientras dibuja
 * es el mismo que va a quedar guardado, nunca un número que el cliente pueda
 * inflar: el payload que se manda al servidor no incluye `km`.
 */
export function TramoForm({ modo, tramoId, centro, valoresIniciales }: Props) {
  const router = useRouter()
  const [puntos, setPuntos] = useState<PuntoTramo[]>(
    valoresIniciales ? aPuntos(valoresIniciales.geometria) : [],
  )
  const [nombreCodigo, setNombreCodigo] = useState(valoresIniciales?.nombreCodigo ?? '')
  const [localidad, setLocalidad] = useState(valoresIniciales?.localidad ?? '')
  const [activo, setActivo] = useState(valoresIniciales?.activo ?? true)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  const km = kmDeTrack(puntos)

  function agregarPunto(punto: PuntoTramo) {
    setPuntos((actuales) => [...actuales, punto])
  }

  function deshacer() {
    setPuntos((actuales) => actuales.slice(0, -1))
  }

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setError(null)

    if (puntos.length < 2) {
      setError(ERROR_SIN_PUNTOS)
      return
    }

    const geometria: [number, number][] = puntos.map((p) => [p.lng, p.lat])
    const payload = { nombreCodigo, localidad, geometria, activo }

    iniciarTransicion(async () => {
      if (modo === 'crear') {
        const resultado = await crearTramo(payload)
        if (!resultado.ok) {
          setError(resultado.error)
          return
        }
        router.push(`/dashboard/tramos/${resultado.data.id}`)
        router.refresh()
        return
      }

      const resultado = await actualizarTramo(tramoId as string, payload)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      router.push(`/dashboard/tramos/${tramoId}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={manejarEnvio} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-600">
          Dibujá el tramo: cada click en el mapa agrega un punto. Km calculado: <strong>{formatearKm(km)} km</strong>
        </p>
        <MapaDibujarTramoCliente puntos={puntos} onAgregarPunto={agregarPunto} centro={centro} />
        <button
          type="button"
          onClick={deshacer}
          disabled={puntos.length === 0}
          className="min-h-11 self-start rounded-xl border-2 border-gray-300 px-4 text-sm font-semibold text-gray-700 disabled:opacity-60"
        >
          Deshacer último punto
        </button>
        <p className="text-sm text-gray-500">{puntos.length} punto(s) dibujado(s)</p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Nombre o código</span>
        <input
          value={nombreCodigo}
          onChange={(evento) => setNombreCodigo(evento.target.value)}
          required
          minLength={2}
          maxLength={120}
          className="min-h-11 w-full rounded-xl border border-gray-300 px-4 py-3 text-lg"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Localidad</span>
        <input
          value={localidad}
          onChange={(evento) => setLocalidad(evento.target.value)}
          required
          minLength={2}
          maxLength={120}
          className="min-h-11 w-full rounded-xl border border-gray-300 px-4 py-3 text-lg"
        />
      </label>

      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={activo}
          onChange={(evento) => setActivo(evento.target.checked)}
          className="h-5 w-5"
        />
        <span className="font-medium">Activo (cuenta para la cobertura)</span>
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {error}
        </p>
      )}

      <Boton type="submit" cargando={pendiente}>
        {modo === 'crear' ? 'Crear tramo' : 'Guardar cambios'}
      </Boton>
    </form>
  )
}

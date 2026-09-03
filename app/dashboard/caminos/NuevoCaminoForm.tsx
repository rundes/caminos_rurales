'use client'

import { useActionState } from 'react'
import { Boton } from '@/components/Boton'
import { crearCamino, type EstadoAccionCamino } from './actions'

export function NuevoCaminoForm() {
  const [estado, accion, pendiente] = useActionState<EstadoAccionCamino, FormData>(crearCamino, undefined)

  return (
    <form action={accion} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Nuevo camino (nombre o código)</span>
        <input
          name="nombre_codigo"
          type="text"
          required
          minLength={2}
          placeholder="Ej: CR-014 Camino a La Elisa"
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg"
        />
      </label>
      {estado && !estado.ok && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {estado.error}
        </p>
      )}
      {estado && estado.ok && (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-green-800">
          Camino creado.
        </p>
      )}
      <Boton type="submit" cargando={pendiente}>
        Agregar camino
      </Boton>
    </form>
  )
}

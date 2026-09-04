'use client'

import { useActionState } from 'react'
import { Boton } from '@/components/Boton'
import { aceptarTerminos, type EstadoTerminos } from './actions'

export function TerminosForm() {
  const [estado, accion, pendiente] = useActionState<EstadoTerminos, FormData>(
    aceptarTerminos,
    undefined,
  )

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex items-start gap-3 rounded-xl border-2 border-green-700 px-4 py-4">
        <input
          type="checkbox"
          name="acepto"
          required
          className="mt-1 size-6 shrink-0 accent-green-700"
        />
        <span className="text-lg font-medium">
          Acepto los términos y el uso de mi ubicación, mis fotos, los sensores de movimiento del
          dispositivo (acelerómetro y giroscopio) para estimar el estado del camino y la cámara del
          dispositivo para registrar imágenes del camino durante el recorrido.
        </span>
      </label>

      {estado && !estado.ok && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">
          {estado.error}
        </p>
      )}

      <Boton type="submit" cargando={pendiente}>
        Aceptar y continuar
      </Boton>
    </form>
  )
}

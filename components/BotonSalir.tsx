'use client'

import { useState } from 'react'
import { signOut } from '@/app/login/actions'
import { limpiarSw } from '@/components/RegistroSw'
import { cerrarDb, limpiarLocal } from '@/lib/local/db'

/**
 * Cierra la sesión borrando primero todo lo local: la base del dispositivo y
 * los caches del service worker. En un celular compartido nadie hereda los
 * recorridos ni las evidencias de la persona anterior.
 */
export function BotonSalir() {
  const [saliendo, setSaliendo] = useState(false)

  async function salir() {
    setSaliendo(true)
    try {
      await limpiarLocal()
      await cerrarDb()
    } catch (error) {
      console.error('[salir]', error)
    }
    await limpiarSw()
    await signOut()
  }

  return (
    <button
      type="button"
      disabled={saliendo}
      onClick={() => void salir()}
      className="rounded-lg bg-green-700 px-3 py-2 text-sm disabled:opacity-60"
    >
      {saliendo ? 'Saliendo…' : 'Salir'}
    </button>
  )
}

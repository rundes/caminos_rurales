'use client'

import { useState } from 'react'
import { signOut } from '@/app/login/actions'
import { limpiarSw } from '@/components/RegistroSw'
import { cerrarDb, limpiarLocal, listarCola, listarRecorridos } from '@/lib/local/db'

type Props = {
  usuarioId: string
}

/** Recorridos en curso o con items de cola sin subir del usuario en sesión. */
async function contarRecorridosSinSubir(usuarioId: string): Promise<number> {
  const [recorridos, cola] = await Promise.all([listarRecorridos(usuarioId), listarCola()])
  const encolados = new Set(cola.map((item) => item.recorridoId))
  return recorridos.filter((r) => r.estado === 'en_curso' || encolados.has(r.id)).length
}

/**
 * Cierra la sesión borrando primero todo lo local: la base del dispositivo y
 * los caches del service worker. En un celular compartido nadie hereda los
 * recorridos ni las evidencias de la persona anterior.
 *
 * Antes de salir se fija si hay recorridos sin subir (en curso o encolados):
 * de haberlos, pide confirmación porque `limpiarLocal` los borra sin poder
 * recuperarlos después.
 */
export function BotonSalir({ usuarioId }: Props) {
  const [saliendo, setSaliendo] = useState(false)
  const [confirmando, setConfirmando] = useState<number | null>(null)

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

  async function pedirSalir() {
    try {
      const sinSubir = await contarRecorridosSinSubir(usuarioId)
      if (sinSubir > 0) {
        setConfirmando(sinSubir)
        return
      }
    } catch (error) {
      console.error('[salir]', error)
    }
    await salir()
  }

  return (
    <>
      <button
        type="button"
        disabled={saliendo}
        onClick={() => void pedirSalir()}
        className="min-h-11 rounded-lg bg-green-700 px-3 text-sm disabled:opacity-60"
      >
        {saliendo ? 'Saliendo…' : 'Salir'}
      </button>

      {confirmando !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar salida"
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="flex max-w-sm flex-col gap-4 rounded-2xl bg-white p-5 text-gray-900 shadow-lg">
            <p className="text-sm">
              Tenés {confirmando} recorrido{confirmando === 1 ? '' : 's'} sin subir. Si salís se
              pierden.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmando(null)}
                className="min-h-11 rounded-lg px-3 text-sm font-medium text-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmando(null)
                  void salir()
                }}
                className="min-h-11 rounded-lg bg-red-700 px-3 text-sm font-medium text-white"
              >
                Salir igual
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

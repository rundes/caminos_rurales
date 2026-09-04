'use client'

import { Boton } from '@/components/Boton'
import type { RecorridoLocal } from '@/lib/local/tipos'

type Props = {
  sinTerminar: RecorridoLocal | null
  error: string | null
  pendientes: number
  onIniciar: () => void
  onContinuar: () => void
  onCerrarPendiente: () => void
}

/** Pantalla sin recorrido activo: arranque, rescate del anterior y avisos. */
export function PantallaInicio({
  sinTerminar,
  error,
  pendientes,
  onIniciar,
  onContinuar,
  onCerrarPendiente,
}: Props) {
  return (
    <section className="flex flex-col gap-4">
      {sinTerminar && (
        <div className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-5">
          <p className="text-sm text-amber-900">Tenés un recorrido sin terminar en este dispositivo.</p>
          <Boton onClick={onContinuar}>Continuar</Boton>
          <Boton variante="secundario" onClick={onCerrarPendiente}>
            Finalizar y subir
          </Boton>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {pendientes > 0 && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {pendientes} recorrido(s) esperando subirse.
        </p>
      )}
      {!sinTerminar && <Boton onClick={onIniciar}>Iniciar recorrido</Boton>}
    </section>
  )
}

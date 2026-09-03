'use client'

import type { ResumenRecorrido as Resumen } from '@/app/dashboard/recorrido/actions'
import { Boton } from '@/components/Boton'
import { Insignia } from '@/components/Insignia'
import { ETIQUETA_INSIGNIA } from '@/lib/juego'
import { formatearKm } from './formato'

type Props = {
  km: number
  puntosGps: number
  resumen: Resumen | null
  pendiente: boolean
  onNuevo: () => void
}

const PENDIENTE = 'Pendiente de subir (sin conexión). Lo enviamos solo cuando vuelva la señal.'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center">
      <p className="text-xl font-bold text-green-800">{valor}</p>
      <p className="text-xs text-gray-600">{etiqueta}</p>
    </div>
  )
}

/** Cierre del recorrido: totales locales y, cuando llega, el resumen del servidor. */
export function ResumenRecorrido({ km, puntosGps, resumen, pendiente, onNuevo }: Props) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Recorrido finalizado</h2>

      <div className="grid grid-cols-3 gap-2">
        <Dato etiqueta="km" valor={formatearKm(resumen?.km ?? km)} />
        <Dato etiqueta="puntos GPS" valor={puntosGps} />
        <Dato etiqueta="puntos" valor={resumen?.puntos ?? 0} />
      </div>

      {resumen ? (
        <>
          <p className="text-sm text-gray-600">
            {resumen.tramosNuevos} tramo(s) nuevo(s) · {resumen.tramosRepetidos} repetido(s)
          </p>
          {resumen.insignias.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-gray-700">Insignias nuevas</h3>
              <div className="grid grid-cols-3 gap-2">
                {resumen.insignias.map((codigo) => (
                  <Insignia key={codigo} codigo={codigo} obtenida />
                ))}
              </div>
              <p className="sr-only">{resumen.insignias.map(ETIQUETA_INSIGNIA).join(', ')}</p>
            </div>
          )}
        </>
      ) : (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {pendiente ? PENDIENTE : 'Subiendo el recorrido…'}
        </p>
      )}

      <Boton onClick={onNuevo}>Iniciar otro recorrido</Boton>
    </section>
  )
}

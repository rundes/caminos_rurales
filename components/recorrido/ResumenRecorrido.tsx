'use client'

import type { ResumenRecorrido as Resumen } from '@/app/dashboard/recorrido/actions'
import { Boton } from '@/components/Boton'
import { Insignia } from '@/components/Insignia'
import { ETIQUETA_INSIGNIA } from '@/lib/juego'
import type { CalidadSegmento } from '@/lib/sensores/tipos'
import { formatearKm } from './formato'

type Props = {
  km: number
  puntosGps: number
  resumen: Resumen | null
  /** Sin señal el recorrido queda esperando; con señal se está subiendo. */
  sinConexion: boolean
  /** Cuadros de cámara capturados en el recorrido y los que faltan subir. */
  cuadros?: number
  cuadrosPendientes?: number
  /** Cuadros que ya no se van a subir: el servidor los rechazó o se agotaron los intentos. */
  cuadrosError?: number
  /** `false` cuando no pudimos confirmar que la red sea WiFi (iOS no lo informa). */
  redVerificada?: boolean
  /** Fuerza la subida de cuadros con datos móviles, saltando el ajuste de WiFi. */
  onSubirCuadros?: () => void
  onNuevo: () => void
}

const PENDIENTE = 'Pendiente de subir (sin conexión). Lo enviamos solo cuando vuelva la señal.'
const SUBIENDO = 'Subiendo…'
const RED_SIN_VERIFICAR =
  'No pudimos verificar si estás en WiFi; la subida usará la red disponible.'

/** Orden y etiqueta de las barras de calidad estimada por los sensores. */
const CALIDADES: readonly { codigo: CalidadSegmento; etiqueta: string; clase: string }[] = [
  { codigo: 'bueno', etiqueta: 'Bueno', clase: 'bg-green-600' },
  { codigo: 'regular', etiqueta: 'Regular', clase: 'bg-yellow-500' },
  { codigo: 'malo', etiqueta: 'Malo', clase: 'bg-orange-500' },
  { codigo: 'intransitable', etiqueta: 'Intransitable', clase: 'bg-red-600' },
  { codigo: 'sin_dato', etiqueta: 'Sin datos', clase: 'bg-gray-400' },
]

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center">
      <p className="text-xl font-bold text-green-800">{valor}</p>
      <p className="text-xs text-gray-600">{etiqueta}</p>
    </div>
  )
}

/** Km del recorrido por calidad estimada, en barras proporcionales al total. */
function BarrasCalidad({ kmPorCalidad }: { kmPorCalidad: Partial<Record<CalidadSegmento, number>> }) {
  const total = CALIDADES.reduce((suma, c) => suma + (kmPorCalidad[c.codigo] ?? 0), 0)
  if (total <= 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-gray-700">Estado estimado del camino</h3>
      {CALIDADES.filter((c) => (kmPorCalidad[c.codigo] ?? 0) > 0).map((c) => {
        const km = kmPorCalidad[c.codigo] ?? 0
        return (
          <div key={c.codigo} className="flex items-center gap-2 text-sm">
            <span className="w-28 shrink-0 text-gray-700">{c.etiqueta}</span>
            <span className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
              <span
                className={`block h-full rounded-full ${c.clase}`}
                style={{ width: `${(km / total) * 100}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums text-gray-700">
              {formatearKm(km)} km
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Cierre del recorrido: totales locales y, cuando llega, el resumen del servidor. */
export function ResumenRecorrido({
  km,
  puntosGps,
  resumen,
  sinConexion,
  cuadros = 0,
  cuadrosPendientes = 0,
  cuadrosError = 0,
  redVerificada = true,
  onSubirCuadros,
  onNuevo,
}: Props) {
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
            {resumen.impactos ? ` · ${resumen.impactos} impacto(s) detectado(s)` : ''}
          </p>
          {resumen.kmPorCalidad && <BarrasCalidad kmPorCalidad={resumen.kmPorCalidad} />}
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
          {sinConexion ? PENDIENTE : SUBIENDO}
        </p>
      )}

      {cuadros > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-600">
            Cuadros: {cuadros} capturados
            {cuadrosPendientes > 0 ? ` · ${cuadrosPendientes} pendientes de subir (WiFi)` : ''}
          </p>
          {cuadrosError > 0 && (
            <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              {cuadrosError} cuadros no pudieron subirse
            </p>
          )}
          {!redVerificada && cuadrosPendientes > 0 && (
            <p className="text-sm text-gray-600">{RED_SIN_VERIFICAR}</p>
          )}
          {cuadrosPendientes > 0 && onSubirCuadros && (
            <Boton variante="secundario" onClick={onSubirCuadros}>
              Subir ahora con datos
            </Boton>
          )}
        </div>
      )}

      <Boton onClick={onNuevo}>Iniciar otro recorrido</Boton>
    </section>
  )
}

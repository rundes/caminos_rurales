import { formatearKm, formatearPorcentaje, porcentajeCobertura } from '@/lib/cobertura-resumen'

type Props = { etiqueta: string; km: number; kmCubiertos: number; cubiertos: number; tramos: number }

/**
 * Barra de progreso accesible de una localidad (o el municipio): kilómetros
 * cubiertos/total como cifra principal, cantidad de tramos como texto
 * secundario (ver Ola 2, "% de cobertura por km").
 */
export function BarraCobertura({ etiqueta, km, kmCubiertos, cubiertos, tramos }: Props) {
  const porcentaje = porcentajeCobertura(kmCubiertos, km)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{etiqueta}</span>
        <span className="text-gray-500">
          {formatearKm(kmCubiertos)} km de {formatearKm(km)} km · {formatearPorcentaje(porcentaje)}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={etiqueta}
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
      >
        <div className="h-full rounded-full bg-green-700" style={{ width: `${porcentaje}%` }} />
      </div>
      <span className="text-xs text-gray-400">
        {cubiertos} de {tramos} tramos
      </span>
    </div>
  )
}

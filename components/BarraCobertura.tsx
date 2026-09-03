type Props = { etiqueta: string; cubiertos: number; tramos: number }

function calcularPorcentaje(cubiertos: number, tramos: number): number {
  if (tramos <= 0) return 0
  return Math.round((cubiertos / tramos) * 100)
}

/** Barra de progreso accesible: cubiertos/tramos de una localidad o el municipio. */
export function BarraCobertura({ etiqueta, cubiertos, tramos }: Props) {
  const porcentaje = calcularPorcentaje(cubiertos, tramos)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{etiqueta}</span>
        <span className="text-gray-500">
          {cubiertos}/{tramos} · {porcentaje}%
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
    </div>
  )
}

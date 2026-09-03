import { BarraCobertura } from '@/components/BarraCobertura'
import type { ResumenCobertura } from '@/lib/cobertura-resumen'
import { formatearNumero } from '@/lib/kpis'

type Props = { resumen: ResumenCobertura; titulo?: string }

/** Tarjeta de cobertura: % del municipio, km cubiertos/total y una barra por localidad. */
export function TarjetaCobertura({ resumen, titulo = 'Cobertura del municipio' }: Props) {
  const porcentaje = Math.round(resumen.total.fraccion * 100)

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
        <span className="text-2xl font-bold text-green-800">{porcentaje}%</span>
      </div>
      <p className="text-sm text-gray-500">
        {formatearNumero(resumen.total.kmCubiertos)} km cubiertos de {formatearNumero(resumen.total.km)} km
      </p>
      {resumen.porLocalidad.length > 0 ? (
        <div className="flex flex-col gap-3">
          {resumen.porLocalidad.map((loc) => (
            <BarraCobertura key={loc.localidad} etiqueta={loc.localidad} cubiertos={loc.cubiertos} tramos={loc.tramos} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Todavía no hay tramos registrados.</p>
      )}
    </section>
  )
}

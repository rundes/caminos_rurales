import { BarraCobertura } from '@/components/BarraCobertura'
import { formatearKm, formatearPorcentaje, porcentajeCobertura, type ResumenCobertura } from '@/lib/cobertura-resumen'

type Props = { resumen: ResumenCobertura; titulo?: string }

/**
 * Tarjeta de cobertura: kilómetros cubiertos/total (con el % entre
 * paréntesis) como cifra principal, cantidad de tramos como texto
 * secundario, y una barra por localidad debajo.
 */
export function TarjetaCobertura({ resumen, titulo = 'Cobertura del municipio' }: Props) {
  const porcentaje = porcentajeCobertura(resumen.total.kmCubiertos, resumen.total.km)

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
      <p className="text-2xl font-bold text-green-800">
        {formatearKm(resumen.total.kmCubiertos)} km de {formatearKm(resumen.total.km)} km ({formatearPorcentaje(porcentaje)}
        %)
      </p>
      <p className="text-sm text-gray-500">
        {resumen.total.cubiertos} de {resumen.total.tramos} tramos
      </p>
      {resumen.porLocalidad.length > 0 ? (
        <div className="flex flex-col gap-3">
          {resumen.porLocalidad.map((loc) => (
            <BarraCobertura
              key={loc.localidad}
              etiqueta={loc.localidad}
              km={loc.km}
              kmCubiertos={loc.kmCubiertos}
              cubiertos={loc.cubiertos}
              tramos={loc.tramos}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Todavía no hay tramos registrados.</p>
      )}
    </section>
  )
}

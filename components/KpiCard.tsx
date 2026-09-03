type Props = { etiqueta: string; valor: string | number }

export function KpiCard({ etiqueta, valor }: Props) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{etiqueta}</p>
      <p className="text-3xl font-bold text-green-800">{valor}</p>
    </div>
  )
}

'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { buscarPartido } from '@/lib/partidos'
import { ETIQUETA_TIPO_FALLA, type TipoFalla } from '@/lib/tipos'

const CAMPO = 'w-full rounded-xl border border-gray-300 px-3 py-2'

export function Filtros({ municipios }: { municipios: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function actualizar(clave: string, valor: string) {
    const siguiente = new URLSearchParams(params.toString())
    if (valor) siguiente.set(clave, valor)
    else siguiente.delete(clave)
    const qs = siguiente.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span>Tipo de falla</span>
        <select
          className={CAMPO}
          value={params.get('tipo') ?? ''}
          onChange={(e) => actualizar('tipo', e.target.value)}
        >
          <option value="">Todas</option>
          {(Object.keys(ETIQUETA_TIPO_FALLA) as TipoFalla[]).map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_FALLA[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Municipio</span>
        <select
          className={CAMPO}
          value={params.get('municipio') ?? ''}
          onChange={(e) => actualizar('municipio', e.target.value)}
        >
          <option value="">Todos</option>
          {municipios.map((m) => (
            <option key={m} value={m}>
              {buscarPartido(m)?.nombre ?? m}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

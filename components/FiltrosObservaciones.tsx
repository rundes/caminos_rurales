'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ETIQUETA_ESTADO_OBSERVACION, ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_FALLA, type EstadoObservacion, type Severidad, type TipoFalla } from '@/lib/tipos'

const CAMPO = 'w-full rounded-xl border border-gray-300 px-3 py-2'

const ETIQUETA_ORIGEN: Record<'manual' | 'sensor', string> = {
  manual: 'Manual',
  sensor: 'Sensor',
}

/**
 * Filtros compartidos por el mapa y la lista de observaciones: tipo,
 * severidad, origen, estado y rango de fechas. Sin selector de municipio
 * (RLS ya limita todo a la del usuario, así que era UI muerta).
 *
 * Enteramente derivado de la URL (`useSearchParams`), sin estado local
 * espejo: cada cambio reescribe la query string y el server component que
 * envuelve a este filtro vuelve a renderizar con los nuevos `searchParams`.
 */
export function FiltrosObservaciones() {
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

  const hayFiltros = params.toString().length > 0

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Tipo</span>
          <select className={CAMPO} value={params.get('tipo') ?? ''} onChange={(e) => actualizar('tipo', e.target.value)}>
            <option value="">Todos</option>
            {(Object.keys(ETIQUETA_TIPO_FALLA) as TipoFalla[]).map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_FALLA[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Severidad</span>
          <select
            className={CAMPO}
            value={params.get('severidad') ?? ''}
            onChange={(e) => actualizar('severidad', e.target.value)}
          >
            <option value="">Todas</option>
            {(Object.keys(ETIQUETA_SEVERIDAD) as Severidad[]).map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_SEVERIDAD[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Origen</span>
          <select className={CAMPO} value={params.get('origen') ?? ''} onChange={(e) => actualizar('origen', e.target.value)}>
            <option value="">Todos</option>
            <option value="manual">{ETIQUETA_ORIGEN.manual}</option>
            <option value="sensor">{ETIQUETA_ORIGEN.sensor}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Estado</span>
          <select className={CAMPO} value={params.get('estado') ?? ''} onChange={(e) => actualizar('estado', e.target.value)}>
            <option value="">Todos</option>
            {(Object.keys(ETIQUETA_ESTADO_OBSERVACION) as EstadoObservacion[]).map((estado) => (
              <option key={estado} value={estado}>
                {ETIQUETA_ESTADO_OBSERVACION[estado]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Desde</span>
          <input
            type="date"
            className={CAMPO}
            value={params.get('desde') ?? ''}
            onChange={(e) => actualizar('desde', e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Hasta</span>
          <input
            type="date"
            className={CAMPO}
            value={params.get('hasta') ?? ''}
            onChange={(e) => actualizar('hasta', e.target.value)}
          />
        </label>
      </div>
      {hayFiltros && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="self-start text-sm font-medium text-green-800 underline"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

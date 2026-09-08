import Link from 'next/link'
import { obtenerRugosidadTramos } from '@/lib/cobertura-consultas'
import { formatearKm } from '@/lib/cobertura-resumen'
import { formatearFecha } from '@/lib/fechas'
import { colorCalidad, ETIQUETA_CALIDAD } from '@/lib/sensores/colores'
import { buscarTramos, combinarTramos, ordenarTramos } from '@/lib/tramos'
import { obtenerTramosResumenCacheado } from '@/lib/tramos-consultas'
import { crearClienteServidor } from '@/lib/supabase/server'

type Props = { searchParams: Promise<{ q?: string; orden?: string }> }

/** Arma el href de un link de orden conservando la búsqueda actual. */
function enlaceOrden(q: string, orden: string): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('orden', orden)
  return `/dashboard/tramos?${params.toString()}`
}

export default async function TramosPage({ searchParams }: Props) {
  const { q = '', orden } = await searchParams
  const supabase = await crearClienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: perfil, error: errorPerfil } = user
    ? await supabase.from('perfiles').select('municipio_id').eq('id', user.id).maybeSingle()
    : { data: null, error: null }
  if (errorPerfil) console.error('[tramos]', errorPerfil.message)

  const municipio = perfil?.municipio_id ?? null
  if (!municipio) {
    return <p className="rounded-xl bg-red-50 p-4 text-red-800">Tu perfil no tiene un partido asignado.</p>
  }

  // Dos consultas independientes: el resumen por tramo (cacheado por
  // municipio, cliente admin) y la rugosidad estimada (RPC sin cachear, con
  // el cliente de sesión — ver `lib/tramos-consultas.ts`).
  const [resumen, rugosidad] = await Promise.all([
    obtenerTramosResumenCacheado(municipio),
    obtenerRugosidadTramos(supabase, municipio),
  ])

  const tramos = ordenarTramos(buscarTramos(combinarTramos(resumen, rugosidad), q), orden)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Tramos</h1>

      {/*
        Alta de tramos: sin formulario de carga en esta versión. `tramos`
        solo tiene la política de lectura `tramos_select` (los siembra el
        servidor con la clave secreta); no existe todavía una política de
        inserción para los roles municipio/auditor, a diferencia de
        `caminos_insert`. Cuando exista esa migración, el formulario debería
        montarse acá, gateado con `perfil.rol === 'municipio' || perfil.rol
        === 'auditor'` — nunca visible para `productor`.
      */}

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o código"
          aria-label="Buscar tramos"
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg"
        />
        {orden && <input type="hidden" name="orden" value={orden} />}
        <button type="submit" className="rounded-xl bg-green-700 px-4 text-white">
          Buscar
        </button>
      </form>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={enlaceOrden(q, 'km')} className="rounded-full border border-gray-300 px-3 py-1.5">
          Ordenar por km
        </Link>
        <Link href={enlaceOrden(q, 'visita')} className="rounded-full border border-gray-300 px-3 py-1.5">
          Ordenar por última visita
        </Link>
      </div>

      {tramos.length === 0 ? (
        <p className="text-gray-500">No hay tramos para mostrar.</p>
      ) : (
        <ul className="divide-y rounded-2xl bg-white shadow-sm">
          {tramos.map((t) => (
            <li key={t.id}>
              <Link href={`/dashboard/tramos/${t.id}`} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t.nombre_codigo}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: colorCalidad(t.calidad) }}
                  >
                    {ETIQUETA_CALIDAD[t.calidad]}
                  </span>
                </div>
                <span className="text-sm text-gray-600">
                  {t.localidad} · {formatearKm(t.km)} km · cubierto {t.veces} {t.veces === 1 ? 'vez' : 'veces'} ·{' '}
                  {t.cuadros} cuadros
                </span>
                <span className="text-xs text-gray-400">
                  Última visita: {t.ultimaVisita ? formatearFecha(t.ultimaVisita) : 'sin visitas'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

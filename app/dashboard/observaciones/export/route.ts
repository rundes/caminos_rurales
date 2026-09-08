import { NextResponse, type NextRequest } from 'next/server'
import { aCsv, aGeoJson, type FilaCsv, type FilaGeoJson } from '@/lib/exportar'
import { formatearFechaHora } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ETIQUETA_ESTADO_OBSERVACION, ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_FALLA } from '@/lib/tipos'

const LIMITE_OBSERVACIONES = 500

const ETIQUETA_ORIGEN: Record<'manual' | 'sensor', string> = {
  manual: 'Manual',
  sensor: 'Sensor',
}

/**
 * Export de observaciones (CSV o GeoJSON), `?formato=csv|geojson`. Requiere
 * sesión: la consulta corre con el cliente del usuario, así que RLS
 * (`fallas_select`) es lo que limita el resultado a su municipio, igual que
 * en la página. No se exponen más datos personales que los que ya muestra la
 * app (ni email ni quién reportó cada observación).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sesión vencida. Volvé a ingresar.' }, { status: 401 })

  const formato = request.nextUrl.searchParams.get('formato') === 'geojson' ? 'geojson' : 'csv'

  const { data, error } = await supabase
    .from('fallas_deteccion')
    .select('id, tipo_falla, severidad, origen, estado, latitud, longitud, created_at, tramo_id, recorridos(inicio)')
    .order('created_at', { ascending: false })
    .limit(LIMITE_OBSERVACIONES)

  if (error) {
    console.error('[observaciones-export]', error.message)
    return NextResponse.json({ error: 'No se pudieron exportar las observaciones.' }, { status: 500 })
  }

  const filas = data ?? []

  if (formato === 'geojson') {
    const geo: FilaGeoJson[] = filas.map((f) => ({
      latitud: Number(f.latitud),
      longitud: Number(f.longitud),
      propiedades: {
        id: f.id,
        tipo: ETIQUETA_TIPO_FALLA[f.tipo_falla],
        severidad: ETIQUETA_SEVERIDAD[f.severidad],
        origen: ETIQUETA_ORIGEN[f.origen],
        estado: ETIQUETA_ESTADO_OBSERVACION[f.estado],
        tramo_id: f.tramo_id,
        fecha: f.recorridos?.inicio ?? f.created_at,
      },
    }))
    return new Response(JSON.stringify(aGeoJson(geo)), {
      headers: {
        'Content-Type': 'application/geo+json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="observaciones.geojson"',
      },
    })
  }

  const filasCsv: FilaCsv[] = filas.map((f) => ({
    id: f.id,
    fecha: (f.recorridos?.inicio ?? f.created_at) ? formatearFechaHora(f.recorridos?.inicio ?? f.created_at ?? '') : '',
    tipo: ETIQUETA_TIPO_FALLA[f.tipo_falla],
    severidad: ETIQUETA_SEVERIDAD[f.severidad],
    origen: ETIQUETA_ORIGEN[f.origen],
    estado: ETIQUETA_ESTADO_OBSERVACION[f.estado],
    tramo_id: f.tramo_id,
    latitud: Number(f.latitud),
    longitud: Number(f.longitud),
  }))
  return new Response(aCsv(filasCsv), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="observaciones.csv"',
    },
  })
}

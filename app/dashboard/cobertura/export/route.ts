import { NextResponse, type NextRequest } from 'next/server'
import { obtenerTramosConEstado } from '@/lib/cobertura-consultas'
import { aCsv, aGeoJson, type FilaCsv, type FilaGeoJson } from '@/lib/exportar'
import { crearClienteServidor } from '@/lib/supabase/server'

/**
 * Export de cobertura por tramo (CSV o GeoJSON), `?formato=csv|geojson`.
 * Requiere sesión: el municipio sale del perfil y la consulta corre con el
 * cliente del usuario (RLS `tramos_select`/`cobertura_select` la limita a su
 * municipio), igual que `obtenerTramosConEstado` en el mapa.
 *
 * El GeoJSON representa cada tramo con el primer punto de su geometría (una
 * línea): alcanza para ubicarlo en un mapa de puntos sin tener que exportar
 * la polilínea completa.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sesión vencida. Volvé a ingresar.' }, { status: 401 })

  const { data: perfil, error: errorPerfil } = await supabase
    .from('perfiles')
    .select('municipio_id')
    .eq('id', user.id)
    .maybeSingle()
  if (errorPerfil || !perfil) {
    console.error('[cobertura-export]', errorPerfil?.message ?? 'perfil no encontrado')
    return NextResponse.json({ error: 'No se pudo cargar tu perfil.' }, { status: 500 })
  }

  const formato = request.nextUrl.searchParams.get('formato') === 'geojson' ? 'geojson' : 'csv'
  const tramos = await obtenerTramosConEstado(supabase, perfil.municipio_id)

  if (formato === 'geojson') {
    const geo: FilaGeoJson[] = tramos
      .filter((t) => t.geometria.length > 0)
      .map((t) => ({
        latitud: t.geometria[0][0],
        longitud: t.geometria[0][1],
        propiedades: {
          id: t.id,
          nombre_codigo: t.nombre_codigo,
          localidad: t.localidad,
          km: t.km,
          cubierto: t.veces > 0,
          veces: t.veces,
        },
      }))
    return new Response(JSON.stringify(aGeoJson(geo)), {
      headers: {
        'Content-Type': 'application/geo+json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="cobertura.geojson"',
      },
    })
  }

  const filasCsv: FilaCsv[] = tramos.map((t) => ({
    id: t.id,
    nombre_codigo: t.nombre_codigo,
    localidad: t.localidad,
    km: t.km,
    cubierto: t.veces > 0,
    veces: t.veces,
  }))
  return new Response(aCsv(filasCsv), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="cobertura.csv"',
    },
  })
}

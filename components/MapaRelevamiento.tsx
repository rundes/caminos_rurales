'use client'

import 'leaflet/dist/leaflet.css'
import { useCallback, useEffect, useState } from 'react'
import { CircleMarker, LayersControl, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { obtenerCuadrosMunicipio } from '@/app/dashboard/mapa/actions'
import { CapaCuadros } from '@/components/CapaCuadros'
import { CapaTramos, type ModoMapa, type TramoEstado } from '@/components/CapaTramos'
import { CapasMunicipio } from '@/components/CapasMunicipio'
import { TESELAS_IGN, type CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'
import type { Cuadro } from '@/lib/cuadros'
import { formatearFecha } from '@/lib/fechas'
import { colorSeveridad } from '@/lib/severidad'
import type { RugosidadTramo } from '@/lib/sensores/tipos'
import { ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_FALLA, type PuntoFalla } from '@/lib/tipos'

export type { TramoEstado }

type LimitesBounds = [[number, number], [number, number]]

type Props = {
  puntos: PuntoFalla[]
  centro: [number, number]
  urlsEvidencia: Record<string, string>
  capas?: CapasMunicipioTipo | null
  limites?: LimitesBounds
  tramos?: TramoEstado[]
  rugosidad?: Record<string, RugosidadTramo>
  cuadrosPorTramo?: Record<string, number>
}

/**
 * Estado de la capa "Cuadros", cargada bajo demanda al activar el toggle vía
 * la server action `obtenerCuadrosMunicipio` (ver `app/dashboard/mapa/actions.ts`):
 * la mayoría de las visitas al mapa nunca activa esa capa, así que firmar
 * cientos de URLs en cada carga de página sería trabajo desperdiciado.
 */
type EstadoCuadros =
  | { estado: 'inactivo' }
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; cuadros: Cuadro[]; urls: Record<string, string> }

const ZOOM_INICIAL = 10
const URL_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATRIBUCION_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const RADIO_OBSERVACION = 9
const RADIO_OBSERVACION_SENSOR = 7
const PUNTEADO_SENSOR = '3 3'

/** URL de "Ver video": directa si ya es `https://`, o la firmada equivalente a la de imágenes. */
function urlVideo(ruta: string, urlsEvidencia: Record<string, string>): string | null {
  if (ruta.startsWith('https://')) return ruta
  return urlsEvidencia[ruta] ?? null
}

/** Encuadra el mapa en `limites` una sola vez al montar (no en cada render). */
function EnfoqueLimites({ limites }: { limites: LimitesBounds }) {
  const map = useMap()

  useEffect(() => {
    map.fitBounds(limites)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberado: encuadrar solo al montar
  }, [])

  return null
}

/** Toggle "Cobertura" / "Estado estimado" del mapa, más el toggle independiente "Cuadros", arriba a la derecha. */
function ControlModo({
  modo,
  onCambiar,
  mostrarCuadros,
  onCambiarCuadros,
}: {
  modo: ModoMapa
  onCambiar: (modo: ModoMapa) => void
  mostrarCuadros: boolean
  onCambiarCuadros: (mostrar: boolean) => void
}) {
  const base = 'px-3 py-1.5 text-sm font-medium'
  const activo = 'bg-blue-600 text-white'
  const inactivo = 'bg-white text-gray-700 hover:bg-gray-50'

  return (
    <div
      role="group"
      aria-label="Modo del mapa"
      className="absolute right-3 top-3 z-[1000] flex overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm"
    >
      <button
        type="button"
        aria-pressed={modo === 'cobertura'}
        onClick={() => onCambiar('cobertura')}
        className={`${base} ${modo === 'cobertura' ? activo : inactivo}`}
      >
        Cobertura
      </button>
      <button
        type="button"
        aria-pressed={modo === 'estado'}
        onClick={() => onCambiar('estado')}
        className={`${base} ${modo === 'estado' ? activo : inactivo}`}
      >
        Estado estimado
      </button>
      <button
        type="button"
        aria-pressed={mostrarCuadros}
        onClick={() => onCambiarCuadros(!mostrarCuadros)}
        className={`${base} ${mostrarCuadros ? activo : inactivo}`}
      >
        Cuadros
      </button>
    </div>
  )
}

export function MapaRelevamiento({
  puntos,
  centro,
  urlsEvidencia,
  capas,
  limites,
  tramos,
  rugosidad,
  cuadrosPorTramo,
}: Props) {
  const [modo, setModo] = useState<ModoMapa>('cobertura')
  const [mostrarCuadros, setMostrarCuadros] = useState(false)
  const [estadoCuadros, setEstadoCuadros] = useState<EstadoCuadros>({ estado: 'inactivo' })

  const cargarCuadros = useCallback(() => {
    setEstadoCuadros({ estado: 'cargando' })
    obtenerCuadrosMunicipio()
      .then((resultado) => {
        if (resultado.ok) {
          setEstadoCuadros({ estado: 'listo', cuadros: resultado.data.cuadros, urls: resultado.data.urls })
        } else {
          setEstadoCuadros({ estado: 'error', mensaje: resultado.error })
        }
      })
      .catch((error: unknown) => {
        console.error('[mapa]', error)
        setEstadoCuadros({ estado: 'error', mensaje: 'No se pudieron cargar los cuadros.' })
      })
  }, [])

  // Se pide al activar el toggle, no en un efecto: dispara el pedido desde el
  // propio evento en vez de observar `mostrarCuadros` para no encadenar
  // renders. Una sola vez por sesión del componente: apagar y prender de
  // nuevo no repite el pedido mientras ya haya un resultado (listo o error).
  const cambiarMostrarCuadros = useCallback(
    (mostrar: boolean) => {
      setMostrarCuadros(mostrar)
      if (mostrar && estadoCuadros.estado === 'inactivo') cargarCuadros()
    },
    [estadoCuadros.estado, cargarCuadros],
  )

  return (
    <div className="relative">
      <ControlModo
        modo={modo}
        onCambiar={setModo}
        mostrarCuadros={mostrarCuadros}
        onCambiarCuadros={cambiarMostrarCuadros}
      />
      {mostrarCuadros && estadoCuadros.estado === 'cargando' && (
        <p className="absolute right-3 top-14 z-[1000] rounded-lg bg-white px-3 py-1 text-sm text-gray-600 shadow-sm">
          Cargando cuadros…
        </p>
      )}
      {mostrarCuadros && estadoCuadros.estado === 'error' && (
        <p
          role="alert"
          className="absolute right-3 top-14 z-[1000] rounded-lg bg-red-50 px-3 py-1 text-sm text-red-800 shadow-sm"
        >
          {estadoCuadros.mensaje}{' '}
          <button type="button" className="underline" onClick={cargarCuadros}>
            Reintentar
          </button>
        </p>
      )}
      <MapContainer
        center={centro}
        zoom={ZOOM_INICIAL}
        className="h-[60dvh] w-full rounded-2xl"
        scrollWheelZoom
        preferCanvas
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="IGN">
            <TileLayer
              attribution={TESELAS_IGN.attribution}
              url={TESELAS_IGN.url}
              tms={TESELAS_IGN.tms}
              maxNativeZoom={TESELAS_IGN.maxNativeZoom}
              maxZoom={TESELAS_IGN.maxZoom}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer attribution={ATRIBUCION_OSM} url={URL_OSM} />
          </LayersControl.BaseLayer>
        </LayersControl>
        {limites && <EnfoqueLimites limites={limites} />}
        {capas && <CapasMunicipio capas={capas} />}
        {tramos && <CapaTramos tramos={tramos} modo={modo} rugosidad={rugosidad} cuadrosPorTramo={cuadrosPorTramo} />}
        {mostrarCuadros && estadoCuadros.estado === 'listo' && (
          <CapaCuadros cuadros={estadoCuadros.cuadros} urls={estadoCuadros.urls} />
        )}
        {puntos.map((p) => {
          const hrefVideo = p.url_evidencia_video ? urlVideo(p.url_evidencia_video, urlsEvidencia) : null
          const esSensor = p.origen === 'sensor'
          return (
            <CircleMarker
              key={p.id}
              center={[p.latitud, p.longitud]}
              radius={esSensor ? RADIO_OBSERVACION_SENSOR : RADIO_OBSERVACION}
              pathOptions={{
                color: colorSeveridad(p.severidad),
                fillColor: colorSeveridad(p.severidad),
                fillOpacity: 0.8,
                dashArray: esSensor ? PUNTEADO_SENSOR : undefined,
              }}
            >
              <Popup>
                <strong>{ETIQUETA_TIPO_FALLA[p.tipo_falla]}</strong>
                <br />
                Severidad: {ETIQUETA_SEVERIDAD[p.severidad]}
                <br />
                {p.fecha ? formatearFecha(p.fecha) : ''}
                {esSensor && (
                  <>
                    <br />
                    Detectada por sensores (pico {p.magnitud ?? '-'} m/s²)
                  </>
                )}
                {p.url_evidencia_imagen && urlsEvidencia[p.url_evidencia_imagen] && (
                  <>
                    <br />
                    <a href={urlsEvidencia[p.url_evidencia_imagen]} target="_blank" rel="noreferrer">
                      Ver evidencia
                    </a>
                  </>
                )}
                {hrefVideo && (
                  <>
                    <br />
                    <a href={hrefVideo} target="_blank" rel="noreferrer">
                      Ver video
                    </a>
                  </>
                )}
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}

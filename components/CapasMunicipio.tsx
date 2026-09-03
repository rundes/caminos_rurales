'use client'

import type { Feature, FeatureCollection, GeometryObject, Point } from 'geojson'
import L from 'leaflet'
import { useEffect, useState } from 'react'
import { GeoJSON } from 'react-leaflet'
import { colorRedProvincial, colorSuperficie, type CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'

type Props = { capas: CapasMunicipioTipo }

const PESO_CAMINO = 3
const PESO_RED_PROVINCIAL = 4
const PESO_LIMITE = 2
const DASH_LIMITE = '6 4'
const COLOR_LIMITE = '#166534'
const RELLENO_LOCALIDAD = 0.08
const RADIO_POI = 4
const COLOR_POI = '#616161'

/** Descarga un GeoJSON estático desde `public/`. Si falla, loguea y no rompe el mapa. */
function useGeoJSON(url: string | undefined): FeatureCollection | null {
  const [datos, setDatos] = useState<FeatureCollection | null>(null)

  useEffect(() => {
    if (!url) return
    let cancelado = false

    fetch(url)
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
        return respuesta.json() as Promise<FeatureCollection>
      })
      .then((json) => {
        if (!cancelado) setDatos(json)
      })
      .catch((error) => {
        console.error('[capas]', error)
      })

    return () => {
      cancelado = true
    }
  }, [url])

  return datos
}

function etiquetaCamino(propiedades: Record<string, unknown>): string {
  const nombre = (propiedades.name as string | null) ?? (propiedades.ref as string | null) ?? 'Camino sin nombre'
  const superficie = (propiedades.surface as string | null) ?? 'sin dato'
  return `${nombre} · superficie: ${superficie}`
}

function estiloCamino(feature?: Feature<GeometryObject>): L.PathOptions {
  const surface = (feature?.properties?.surface as string | null) ?? null
  return { color: colorSuperficie(surface), weight: PESO_CAMINO }
}

function alRenderizarCamino(feature: Feature<GeometryObject>, capa: L.Layer) {
  capa.bindTooltip(etiquetaCamino(feature.properties ?? {}))
}

function estiloLimite(): L.PathOptions {
  return { color: COLOR_LIMITE, weight: PESO_LIMITE, dashArray: DASH_LIMITE, fill: false }
}

function etiquetaRedProvincial(propiedades: Record<string, unknown>): string {
  const ruta = (propiedades.ruta as string | null) ?? '?'
  const tipo = (propiedades.tipo as string | null) ?? 'sin dato'
  const superficie = (propiedades.superficie as string | null) ?? 'sin dato'
  return `RP ${ruta} · ${tipo} · ${superficie}`
}

function estiloRedProvincial(feature?: Feature<GeometryObject>): L.PathOptions {
  const superficie = (feature?.properties?.superficie as string | null) ?? null
  return { color: colorRedProvincial(superficie), weight: PESO_RED_PROVINCIAL }
}

function alRenderizarRedProvincial(feature: Feature<GeometryObject>, capa: L.Layer) {
  capa.bindTooltip(etiquetaRedProvincial(feature.properties ?? {}))
}

function esPoligono(feature: Feature<GeometryObject>): boolean {
  return feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'
}

function esPunto(feature: Feature<GeometryObject>): boolean {
  return feature.geometry.type === 'Point'
}

function alRenderizarLocalidad(feature: Feature<GeometryObject>, capa: L.Layer) {
  const nombre = (feature.properties?.name as string | null) ?? 'Localidad'
  capa.bindTooltip(nombre)
}

function puntoAMarcador(feature: Feature<Point>, latlng: L.LatLng): L.Layer {
  const marcador = L.circleMarker(latlng, {
    radius: RADIO_POI,
    color: COLOR_POI,
    fillColor: COLOR_POI,
    fillOpacity: 0.8,
  })
  const nombre = (feature.properties?.name as string | null) ?? 'Punto de interés'
  marcador.bindTooltip(nombre)
  return marcador
}

/**
 * Capas GeoJSON de un municipio sobre el mapa: límite del partido, red vial
 * provincial, caminos (OSM), localidades y puntos de interés, en ese orden.
 */
export function CapasMunicipio({ capas }: Props) {
  const limite = useGeoJSON(capas.limite)
  const redProvincial = useGeoJSON(capas.redProvincial)
  const caminos = useGeoJSON(capas.caminos)
  const localidades = useGeoJSON(capas.localidades)

  return (
    <>
      {limite && <GeoJSON key={capas.limite} data={limite} style={estiloLimite} />}
      {redProvincial && (
        <GeoJSON
          key={capas.redProvincial}
          data={redProvincial}
          style={estiloRedProvincial}
          onEachFeature={alRenderizarRedProvincial}
        />
      )}
      {caminos && (
        <GeoJSON key={capas.caminos} data={caminos} style={estiloCamino} onEachFeature={alRenderizarCamino} />
      )}
      {localidades && (
        <GeoJSON
          key={`${capas.localidades}-poligonos`}
          data={localidades}
          filter={esPoligono}
          style={{ fillOpacity: RELLENO_LOCALIDAD }}
          onEachFeature={alRenderizarLocalidad}
        />
      )}
      {localidades && (
        <GeoJSON
          key={`${capas.localidades}-pois`}
          data={localidades}
          filter={esPunto}
          pointToLayer={puntoAMarcador}
        />
      )}
    </>
  )
}

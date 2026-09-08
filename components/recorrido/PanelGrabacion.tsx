'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Boton } from '@/components/Boton'
import type { CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'
import type { ControlCamara } from '@/hooks/useCamara'
import type { EstadoSensores } from '@/hooks/useSensores'
import type { Grabador } from '@/lib/local/grabador'
import { partirEnSegmentos, simplificar, type PuntoGps } from '@/lib/track'
import { formatearKm, formatearPrecision, formatearVelocidad } from './formato'
import { MapaRecorridoCliente } from './MapaRecorridoCliente'
import { Reloj } from './Reloj'
import { VistaCamara } from './VistaCamara'

export type EstadoPanelSensores = {
  estado: EstadoSensores
  impactos: number
  /** Impactos recientes, para los marcadores efímeros del mapa. */
  posiciones: readonly [number, number][]
}

/** Lo que el panel necesita de la cámara: estado, contador y el `<video>`. */
export type EstadoPanelCamara = Pick<ControlCamara, 'estado' | 'cuadros' | 'videoRef'> & {
  onAlternar: () => void
}

type Props = {
  estado: Grabador
  precision: number | null
  /** Velocidad instantánea que informa el GPS (m/s convertido a km/h), o `null` si no la trae. */
  velocidadKmh: number | null
  obtenerPuntos: () => readonly PuntoGps[]
  centro: [number, number]
  capas: CapasMunicipioTipo | null
  error: string | null
  sensores: EstadoPanelSensores
  camara: EstadoPanelCamara
  /** El cierre está en curso: deshabilita el botón para que un doble tap no lo dispare dos veces. */
  finalizando: boolean
  onObservacion: () => void
  onPausar: () => void
  onReanudar: () => void
  onFinalizar: () => void
}

/** Tolerancia del simplificado que se dibuja: más gruesa que la que se sube. */
const TOLERANCIA_DIBUJO_M = 15
/** La traza se recalcula cada tantos puntos aceptados, no en cada punto. */
const PUNTOS_POR_REDIBUJO = 50

/** Por qué no hay sensores, en palabras que sirvan a quien está manejando. */
const MOTIVO_SIN_SENSORES: Record<EstadoSensores, string | null> = {
  activo: null,
  calibrando: null,
  inactivo: 'todavía no arrancaron',
  sin_permiso: 'sin permiso de movimiento',
  no_disponible: 'este dispositivo no los tiene',
}

/** Estado de la captura por sensores, con el motivo cuando no está activa. */
function ChipSensores({ estado }: { estado: EstadoSensores }) {
  if (estado === 'activo') {
    return <span className="rounded-full bg-green-100 px-3 py-1 text-green-800">Sensores activos</span>
  }
  if (estado === 'calibrando') {
    return <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">Calibrando…</span>
  }
  return (
    <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
      Sin sensores: {MOTIVO_SIN_SENSORES[estado]}
    </span>
  )
}

/**
 * Métrica grande y de alto contraste, pensada para leerse de un vistazo con
 * el sol de frente. `destacada` marca las dos que más importan mientras se
 * maneja (km y tiempo): texto blanco sobre un verde saturado en vez de gris
 * sobre gris.
 */
function Metrica({
  etiqueta,
  valor,
  vivo = false,
  destacada = false,
}: {
  etiqueta: string
  valor: ReactNode
  vivo?: boolean
  destacada?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 rounded-2xl p-4 text-center ${
        destacada ? 'bg-green-800 text-white' : 'border-2 border-gray-300 bg-white text-gray-950'
      }`}
      aria-label={etiqueta}
      {...(vivo ? { 'aria-live': 'polite' as const, 'aria-atomic': true } : {})}
    >
      <p className={`font-black tabular-nums ${destacada ? 'text-4xl' : 'text-3xl'}`}>{valor}</p>
      <p
        className={`text-xs font-bold uppercase tracking-wide ${
          destacada ? 'text-green-100' : 'text-gray-600'
        }`}
      >
        {etiqueta}
      </p>
    </div>
  )
}

/** Pantalla de grabación: mapa en vivo, métricas y controles del recorrido. */
export function PanelGrabacion({
  estado,
  precision,
  velocidadKmh,
  obtenerPuntos,
  centro,
  capas,
  error,
  sensores,
  camara,
  finalizando,
  onObservacion,
  onPausar,
  onReanudar,
  onFinalizar,
}: Props) {
  const grabando = estado.estado === 'grabando'
  const [seguir, setSeguir] = useState(true)
  // "Finalizar" pide confirmación aparte: un tap solo arma el aviso, un
  // segundo tap (en "Sí, finalizar") lo dispara. Así una mano temblando en un
  // camino de tierra no corta el recorrido por accidente.
  const [confirmandoFinalizar, setConfirmandoFinalizar] = useState(false)

  const bloque = Math.floor(estado.cantidad / PUNTOS_POR_REDIBUJO)
  const segmentosBase = useMemo(
    () =>
      partirEnSegmentos(obtenerPuntos(), estado.cortes).map((segmento) =>
        simplificar(segmento, TOLERANCIA_DIBUJO_M).map((p): [number, number] => [p.lat, p.lng]),
      ),
    // El bloque es la clave: dentro de los mismos 50 puntos no hace falta rehacerla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obtenerPuntos, bloque, estado.cortes],
  )

  const posicion = useMemo<[number, number] | null>(
    () => (estado.ultimo ? [estado.ultimo.lat, estado.ultimo.lng] : null),
    [estado.ultimo],
  )
  // La punta viva se agrega al último segmento para que la traza no quede
  // corta entre redibujos; los segmentos anteriores a una pausa no se tocan.
  const tracks = useMemo(() => {
    if (segmentosBase.length === 0) return posicion ? [[posicion]] : []
    const ultimo = segmentosBase[segmentosBase.length - 1]
    const conPunta = posicion ? [...ultimo, posicion] : ultimo
    return [...segmentosBase.slice(0, -1), conPunta]
  }, [segmentosBase, posicion])

  return (
    <div className="flex flex-col gap-4">
      <MapaRecorridoCliente
        centro={centro}
        tracks={tracks}
        posicion={posicion}
        capas={capas}
        seguir={seguir}
        impactos={sensores.posiciones}
        onArrastrar={() => setSeguir(false)}
      />

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          Precisión GPS: <span className="font-semibold text-gray-700">{formatearPrecision(precision)}</span>
        </p>
        <button
          type="button"
          aria-pressed={seguir}
          onClick={() => setSeguir((previo) => !previo)}
          className="min-h-11 shrink-0 rounded-xl border-2 border-green-700 bg-white px-4 text-sm font-semibold text-green-800"
        >
          {seguir ? 'Seguir' : 'Centrar'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metrica etiqueta="km" valor={formatearKm(estado.km)} vivo destacada />
        <Metrica
          etiqueta="tiempo"
          valor={<Reloj inicio={estado.inicio} fin={estado.fin} activo={grabando} />}
          destacada
        />
        <Metrica etiqueta="velocidad" valor={formatearVelocidad(velocidadKmh)} vivo />
        <Metrica etiqueta="cuadros" valor={camara.cuadros} vivo />
        <div className="col-span-2">
          <Metrica etiqueta="impactos" valor={sensores.impactos} vivo />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
        <ChipSensores estado={sensores.estado} />
      </div>

      <VistaCamara
        estado={camara.estado}
        cuadros={camara.cuadros}
        videoRef={camara.videoRef}
        onAlternar={camara.onAlternar}
      />

      {!grabando && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Recorrido en pausa: no se están registrando puntos.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Boton
          variante="secundario"
          onClick={grabando ? onPausar : onReanudar}
          className="min-h-11"
        >
          {grabando ? 'Pausar' : 'Reanudar'}
        </Boton>

        {confirmandoFinalizar || finalizando ? (
          <div
            role="group"
            aria-label="Confirmar finalizar recorrido"
            className="flex flex-col gap-2 rounded-xl border-2 border-red-200 bg-red-50 p-3"
          >
            <p className="text-sm font-medium text-red-900">¿Finalizar el recorrido?</p>
            <Boton cargando={finalizando} onClick={onFinalizar}>
              Sí, finalizar
            </Boton>
            <Boton
              variante="secundario"
              disabled={finalizando}
              onClick={() => setConfirmandoFinalizar(false)}
            >
              Seguir grabando
            </Boton>
          </div>
        ) : (
          <Boton variante="secundario" onClick={() => setConfirmandoFinalizar(true)}>
            Finalizar
          </Boton>
        )}
      </div>

      <button
        type="button"
        onClick={onObservacion}
        className="fixed bottom-24 right-4 z-10 flex min-h-14 items-center gap-2 rounded-full bg-amber-500 px-5 text-base font-bold text-gray-950 shadow-lg active:bg-amber-600"
      >
        <span aria-hidden="true">📍</span>
        Observación
      </button>
    </div>
  )
}

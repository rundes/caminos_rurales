'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEnLinea } from '@/hooks/useEnLinea'
import { useGrabadorGps } from '@/hooks/useGrabadorGps'
import { useSensores, type ControlSensores } from '@/hooks/useSensores'
import { useSincronizacion } from '@/hooks/useSincronizacion'
import type { CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'
import { cerrarRecorrido } from '@/lib/local/cierre'
import { guardarObservacion, recorridoEnCurso } from '@/lib/local/db'
import type { RecorridoLocal } from '@/lib/local/tipos'
import type { Impacto } from '@/lib/sensores/tipos'
import type { PuntoGps } from '@/lib/track'
import { ModalObservacion } from './ModalObservacion'
import { ObservacionForm, type NuevaObservacion } from './ObservacionForm'
import { PanelGrabacion } from './PanelGrabacion'
import { PantallaInicio } from './PantallaInicio'
import { ResumenRecorrido } from './ResumenRecorrido'

export type LimitesBounds = [[number, number], [number, number]]

type Props = {
  usuarioId: string
  municipio: string
  capas: CapasMunicipioTipo | null
  limites: LimitesBounds | null
  centro: [number, number]
}

type Cerrado = { recorridoId: string; km: number; puntosGps: number }

const ERROR_LOCAL = 'No pudimos leer los recorridos guardados en este dispositivo.'
const ERROR_ACCION = 'No pudimos completar la acción en este dispositivo.'

/** Impactos que se dibujan en el mapa durante la grabación. */
const MAX_MARCADORES_IMPACTO = 20

/** Centro del municipio cuando hay límites; si no, el centro del partido. */
function centroInicial(centro: [number, number], limites: LimitesBounds | null): [number, number] {
  if (!limites) return centro
  const [[sur, oeste], [norte, este]] = limites
  return [(sur + norte) / 2, (oeste + este) / 2]
}

export function RecorridoView({ usuarioId, municipio, capas, limites, centro }: Props) {
  const [marcadores, setMarcadores] = useState<readonly [number, number][]>([])

  // El grabador y los sensores se necesitan mutuamente (el hook de sensores
  // depende del recorrido que abre el grabador, y el grabador le pasa cada
  // punto). El `ref` corta ese ciclo sin reabrir el `watchPosition`.
  const registrarGps = useRef<ControlSensores['registrarGps'] | null>(null)
  const alPunto = useCallback(
    (punto: PuntoGps, posicion?: GeolocationPosition) => registrarGps.current?.(punto, posicion),
    [],
  )

  const grabador = useGrabadorGps({ usuarioId, municipio, onPunto: alPunto })
  const alImpacto = useCallback((impacto: Impacto) => {
    setMarcadores((previos) =>
      [...previos, [impacto.lat, impacto.lng] as [number, number]].slice(-MAX_MARCADORES_IMPACTO),
    )
  }, [])
  const sensores = useSensores({
    recorridoId: grabador.estado.recorridoId,
    activo: grabador.estado.estado === 'grabando',
    onImpacto: alImpacto,
  })
  useEffect(() => {
    registrarGps.current = sensores.registrarGps
  }, [sensores.registrarGps])

  const { pendientes, resumenes, sincronizar } = useSincronizacion(usuarioId)
  const enLinea = useEnLinea()

  const [sinTerminar, setSinTerminar] = useState<RecorridoLocal | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [posicionObs, setPosicionObs] = useState<PuntoGps | null>(null)
  const [cerrado, setCerrado] = useState<Cerrado | null>(null)
  const [errorLocal, setErrorLocal] = useState<string | null>(null)

  useEffect(() => {
    recorridoEnCurso(usuarioId)
      .then((recorrido) => setSinTerminar(recorrido ?? null))
      .catch((error) => {
        console.error('[recorrido]', error)
        setErrorLocal(ERROR_LOCAL)
      })
  }, [usuarioId])

  /** Corre una acción asíncrona sin dejar que un rechazo quede sin mostrar. */
  const correr = useCallback((accion: () => Promise<void>) => {
    accion().catch((error) => {
      console.error('[recorrido]', error)
      setErrorLocal(ERROR_ACCION)
    })
  }, [])

  const { solicitarPermiso } = sensores

  const iniciar = useCallback(async () => {
    // iOS solo concede el permiso de movimiento si se pide dentro del gesto:
    // va antes de cualquier `await`. Si lo rechazan, el recorrido sigue igual.
    const permiso = solicitarPermiso()
    setCerrado(null)
    setErrorLocal(null)
    setSinTerminar(null)
    setMarcadores([])
    await permiso
    await grabador.iniciar()
  }, [grabador, solicitarPermiso])

  const continuar = useCallback(async () => {
    if (!sinTerminar) return
    const permiso = solicitarPermiso()
    const id = sinTerminar.id
    setSinTerminar(null)
    setMarcadores([])
    await permiso
    await grabador.retomar(id)
  }, [grabador, sinTerminar, solicitarPermiso])

  const cerrarPendiente = useCallback(async () => {
    if (!sinTerminar) return
    const resultado = await cerrarRecorrido(sinTerminar.id)
    setSinTerminar(null)
    if (!resultado.ok) {
      setErrorLocal(resultado.mensaje)
      return
    }
    await sincronizar()
  }, [sinTerminar, sincronizar])

  const finalizar = useCallback(async () => {
    const { recorridoId, km, cantidad } = grabador.estado
    const resultado = await grabador.finalizar()
    if (resultado && !resultado.ok) {
      setErrorLocal(resultado.mensaje)
      return
    }
    if (recorridoId) setCerrado({ recorridoId, km, puntosGps: cantidad })
    await sincronizar()
  }, [grabador, sincronizar])

  // Abrir el formulario pausa la grabación y congela la posición: la
  // observación queda donde estaba la persona al verla, no donde termina.
  const abrirObservacion = useCallback(() => {
    grabador.pausar()
    setPosicionObs(grabador.estado.ultimo)
    setMostrarForm(true)
  }, [grabador])

  const cerrarObservacion = useCallback(() => {
    setMostrarForm(false)
    setPosicionObs(null)
    grabador.reanudar()
  }, [grabador])

  const guardarObs = useCallback(
    async (nueva: NuevaObservacion) => {
      const recorridoId = grabador.estado.recorridoId
      if (!recorridoId || !posicionObs) return
      await guardarObservacion({
        id: crypto.randomUUID(),
        recorridoId,
        tipo_falla: nueva.tipo_falla,
        severidad: nueva.severidad,
        latitud: posicionObs.lat,
        longitud: posicionObs.lng,
        descripcion: nueva.descripcion,
        archivo: nueva.archivo,
        nombreArchivo: nueva.archivo?.name,
        tipoArchivo: nueva.archivo?.type,
        estadoSubida: 'pendiente',
      })
      cerrarObservacion()
    },
    [grabador.estado.recorridoId, posicionObs, cerrarObservacion],
  )

  if (cerrado) {
    return (
      <ResumenRecorrido
        km={cerrado.km}
        puntosGps={cerrado.puntosGps}
        resumen={resumenes[cerrado.recorridoId] ?? null}
        sinConexion={!enLinea}
        onNuevo={() => correr(iniciar)}
      />
    )
  }

  const activo = grabador.estado.estado === 'grabando' || grabador.estado.estado === 'pausado'
  if (activo) {
    return (
      <>
        <div inert={mostrarForm}>
          <PanelGrabacion
            estado={grabador.estado}
            precision={grabador.precision}
            obtenerPuntos={grabador.obtenerPuntos}
            centro={centroInicial(centro, limites)}
            capas={capas}
            error={grabador.error ?? errorLocal}
            sensores={{
              estado: sensores.estado,
              impactos: sensores.impactos,
              posiciones: marcadores,
            }}
            onObservacion={abrirObservacion}
            onPausar={grabador.pausar}
            onReanudar={grabador.reanudar}
            onFinalizar={() => correr(finalizar)}
          />
        </div>
        {mostrarForm && (
          <ModalObservacion etiqueta="Nueva observación" onCerrar={cerrarObservacion}>
            <ObservacionForm
              posicion={posicionObs}
              onGuardar={guardarObs}
              onCancelar={cerrarObservacion}
            />
          </ModalObservacion>
        )}
      </>
    )
  }

  return (
    <PantallaInicio
      sinTerminar={sinTerminar}
      error={grabador.error ?? errorLocal}
      pendientes={pendientes}
      onIniciar={() => correr(iniciar)}
      onContinuar={() => correr(continuar)}
      onCerrarPendiente={() => correr(cerrarPendiente)}
    />
  )
}

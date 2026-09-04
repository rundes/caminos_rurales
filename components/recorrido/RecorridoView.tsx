'use client'

import { useCallback, useEffect, useState } from 'react'
import { useEnLinea } from '@/hooks/useEnLinea'
import { useGrabadorGps } from '@/hooks/useGrabadorGps'
import { useSincronizacion } from '@/hooks/useSincronizacion'
import type { CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'
import { cerrarRecorrido } from '@/lib/local/cierre'
import { guardarObservacion, recorridoEnCurso } from '@/lib/local/db'
import type { RecorridoLocal } from '@/lib/local/tipos'
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

/** Centro del municipio cuando hay límites; si no, el centro del partido. */
function centroInicial(centro: [number, number], limites: LimitesBounds | null): [number, number] {
  if (!limites) return centro
  const [[sur, oeste], [norte, este]] = limites
  return [(sur + norte) / 2, (oeste + este) / 2]
}

export function RecorridoView({ usuarioId, municipio, capas, limites, centro }: Props) {
  const grabador = useGrabadorGps({ usuarioId, municipio })
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

  const iniciar = useCallback(async () => {
    setCerrado(null)
    setErrorLocal(null)
    setSinTerminar(null)
    await grabador.iniciar()
  }, [grabador])

  const continuar = useCallback(async () => {
    if (!sinTerminar) return
    const id = sinTerminar.id
    setSinTerminar(null)
    await grabador.retomar(id)
  }, [grabador, sinTerminar])

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

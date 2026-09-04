'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamara } from '@/hooks/useCamara'
import { useEnLinea } from '@/hooks/useEnLinea'
import { useGrabadorGps } from '@/hooks/useGrabadorGps'
import { useSensores, type ControlSensores } from '@/hooks/useSensores'
import { useSincronizacion } from '@/hooks/useSincronizacion'
import { useSincronizacionCuadros } from '@/hooks/useSincronizacionCuadros'
import type { CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'
import { cerrarRecorrido } from '@/lib/local/cierre'
import { contarCuadros, guardarObservacion, recorridoEnCurso } from '@/lib/local/db'
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

/** Velocidad informada por el navegador (m/s) en km/h, o `null` si no la trae. */
function velocidadKmh(posicion?: GeolocationPosition): number | null {
  const velocidad = posicion?.coords.speed
  return velocidad === null || velocidad === undefined || velocidad < 0 ? null : velocidad * 3.6
}

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
  const camara = useCamara({ activaInicial: true })
  const capturarSi = useRef(camara.capturarSi)
  const recorridoEnGrabacion = useRef<string | null>(null)
  const alPunto = useCallback((punto: PuntoGps, posicion?: GeolocationPosition) => {
    registrarGps.current?.(punto, posicion)
    const recorridoId = recorridoEnGrabacion.current
    if (!recorridoId) return
    // La captura no puede frenar la grabación: los fallos se avisan por consola.
    void capturarSi.current(
      {
        lat: punto.lat,
        lng: punto.lng,
        t: punto.t,
        velocidadKmh: velocidadKmh(posicion),
        rumbo: posicion?.coords.heading ?? null,
      },
      recorridoId,
    )
  }, [])

  const grabador = useGrabadorGps({ usuarioId, municipio, onPunto: alPunto })
  useEffect(() => {
    capturarSi.current = camara.capturarSi
  }, [camara.capturarSi])
  useEffect(() => {
    recorridoEnGrabacion.current = grabador.estado.recorridoId
  }, [grabador.estado.recorridoId])
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
  const cuadros = useSincronizacionCuadros(usuarioId)
  const enLinea = useEnLinea()

  const [sinTerminar, setSinTerminar] = useState<RecorridoLocal | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [posicionObs, setPosicionObs] = useState<PuntoGps | null>(null)
  const [cerrado, setCerrado] = useState<Cerrado | null>(null)
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const [totalCuadros, setTotalCuadros] = useState({ capturados: 0, pendientes: 0 })

  useEffect(() => {
    recorridoEnCurso(usuarioId)
      .then((recorrido) => setSinTerminar(recorrido ?? null))
      .catch((error) => {
        console.error('[recorrido]', error)
        setErrorLocal(ERROR_LOCAL)
      })
  }, [usuarioId])

  // Los cuadros del recorrido recién cerrado, refrescados cuando la cola sube.
  useEffect(() => {
    const recorridoId = cerrado?.recorridoId
    if (!recorridoId) return
    Promise.all([contarCuadros(recorridoId), contarCuadros(recorridoId, 'pendiente')])
      .then(([capturados, pendientesDeSubir]) =>
        setTotalCuadros({ capturados, pendientes: pendientesDeSubir }),
      )
      .catch((error) => console.error('[recorrido]', error))
  }, [cerrado?.recorridoId, cuadros.subidos])

  /** Corre una acción asíncrona sin dejar que un rechazo quede sin mostrar. */
  const correr = useCallback((accion: () => Promise<void>) => {
    accion().catch((error) => {
      console.error('[recorrido]', error)
      setErrorLocal(ERROR_ACCION)
    })
  }, [])

  const { solicitarPermiso } = sensores
  const { solicitarPermiso: solicitarCamara } = camara

  const iniciar = useCallback(async () => {
    // iOS solo concede los permisos si se piden dentro del gesto: los dos se
    // lanzan antes de cualquier `await`. Si los rechazan, el recorrido sigue.
    const permiso = solicitarPermiso()
    const permisoCamara = solicitarCamara()
    setCerrado(null)
    setErrorLocal(null)
    setSinTerminar(null)
    setMarcadores([])
    await permiso
    await permisoCamara
    await grabador.iniciar()
  }, [grabador, solicitarPermiso, solicitarCamara])

  const continuar = useCallback(async () => {
    if (!sinTerminar) return
    const permiso = solicitarPermiso()
    const permisoCamara = solicitarCamara()
    const id = sinTerminar.id
    setSinTerminar(null)
    setMarcadores([])
    await permiso
    await permisoCamara
    await grabador.retomar(id)
  }, [grabador, sinTerminar, solicitarPermiso, solicitarCamara])

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
        cuadros={totalCuadros.capturados}
        cuadrosPendientes={totalCuadros.pendientes}
        onSubirCuadros={cuadros.forzarConDatos}
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
            camara={{
              estado: camara.estado,
              cuadros: camara.cuadros,
              videoRef: camara.videoRef,
              onAlternar: camara.alternar,
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

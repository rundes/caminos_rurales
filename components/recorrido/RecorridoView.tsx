'use client'

import { useCallback, useEffect, useState } from 'react'
import { useEnLinea } from '@/hooks/useEnLinea'
import { useGrabadorGps } from '@/hooks/useGrabadorGps'
import { useSincronizacion } from '@/hooks/useSincronizacion'
import { Boton } from '@/components/Boton'
import type { CapasMunicipio as CapasMunicipioTipo } from '@/lib/capas'
import { cerrarRecorrido } from '@/lib/local/cierre'
import { guardarObservacion, recorridoEnCurso } from '@/lib/local/db'
import type { RecorridoLocal } from '@/lib/local/tipos'
import { ObservacionForm, type NuevaObservacion } from './ObservacionForm'
import { PanelGrabacion } from './PanelGrabacion'
import { ResumenRecorrido } from './ResumenRecorrido'

export type LimitesBounds = [[number, number], [number, number]]

type Props = {
  municipio: string
  capas: CapasMunicipioTipo | null
  limites: LimitesBounds | null
  centro: [number, number]
}

type Cerrado = { km: number; puntosGps: number }

const ERROR_LOCAL = 'No pudimos leer los recorridos guardados en este dispositivo.'

/** Centro del municipio cuando hay límites; si no, el centro del partido. */
function centroInicial(centro: [number, number], limites: LimitesBounds | null): [number, number] {
  if (!limites) return centro
  const [[sur, oeste], [norte, este]] = limites
  return [(sur + norte) / 2, (oeste + este) / 2]
}

export function RecorridoView({ municipio, capas, limites, centro }: Props) {
  const grabador = useGrabadorGps(municipio)
  const { pendientes, ultimoResumen, sincronizar } = useSincronizacion()
  const enLinea = useEnLinea()

  const [sinTerminar, setSinTerminar] = useState<RecorridoLocal | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [cerrado, setCerrado] = useState<Cerrado | null>(null)
  const [errorLocal, setErrorLocal] = useState<string | null>(null)

  useEffect(() => {
    recorridoEnCurso()
      .then((recorrido) => setSinTerminar(recorrido ?? null))
      .catch((error) => {
        console.error('[recorrido]', error)
        setErrorLocal(ERROR_LOCAL)
      })
  }, [])

  const iniciar = useCallback(async () => {
    setCerrado(null)
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
    await cerrarRecorrido(sinTerminar.id)
    setSinTerminar(null)
    void sincronizar()
  }, [sinTerminar, sincronizar])

  const finalizar = useCallback(async () => {
    const { km, puntosGps } = grabador.estado
    setCerrado({ km, puntosGps: puntosGps.length })
    await grabador.finalizar()
    void sincronizar()
  }, [grabador, sincronizar])

  const guardarObs = useCallback(
    async (nueva: NuevaObservacion) => {
      const { recorridoId, ultimo } = grabador.estado
      if (!recorridoId || !ultimo) return
      await guardarObservacion({
        id: crypto.randomUUID(),
        recorridoId,
        tipo_falla: nueva.tipo_falla,
        severidad: nueva.severidad,
        latitud: ultimo.lat,
        longitud: ultimo.lng,
        descripcion: nueva.descripcion,
        archivo: nueva.archivo,
        nombreArchivo: nueva.archivo?.name,
        tipoArchivo: nueva.archivo?.type,
        estadoSubida: 'pendiente',
      })
      setMostrarForm(false)
    },
    [grabador.estado],
  )

  if (cerrado) {
    return (
      <ResumenRecorrido
        km={cerrado.km}
        puntosGps={cerrado.puntosGps}
        resumen={ultimoResumen}
        pendiente={!enLinea || pendientes > 0}
        onNuevo={() => void iniciar()}
      />
    )
  }

  const activo = grabador.estado.estado === 'grabando' || grabador.estado.estado === 'pausado'
  if (activo) {
    const ultimo = grabador.estado.ultimo
    return (
      <>
        <PanelGrabacion
          estado={grabador.estado}
          precision={grabador.precision}
          centro={centroInicial(centro, limites)}
          capas={capas}
          error={grabador.error}
          onObservacion={() => setMostrarForm(true)}
          onPausar={grabador.pausar}
          onReanudar={grabador.reanudar}
          onFinalizar={() => void finalizar()}
        />
        {mostrarForm && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nueva observación"
            className="fixed inset-0 z-20 overflow-y-auto bg-black/40 p-4"
          >
            <div className="mx-auto max-w-md rounded-2xl bg-white p-5">
              <ObservacionForm
                posicion={ultimo ? { lat: ultimo.lat, lng: ultimo.lng } : null}
                onGuardar={guardarObs}
                onCancelar={() => setMostrarForm(false)}
              />
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      {sinTerminar && (
        <div className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-5">
          <p className="text-sm text-amber-900">Tenés un recorrido sin terminar en este dispositivo.</p>
          <Boton onClick={() => void continuar()}>Continuar</Boton>
          <Boton variante="secundario" onClick={() => void cerrarPendiente()}>
            Finalizar y subir
          </Boton>
        </div>
      )}
      {(grabador.error || errorLocal) && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {grabador.error ?? errorLocal}
        </p>
      )}
      {pendientes > 0 && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {pendientes} recorrido(s) esperando subirse.
        </p>
      )}
      {!sinTerminar && <Boton onClick={() => void iniciar()}>Iniciar recorrido</Boton>}
    </section>
  )
}

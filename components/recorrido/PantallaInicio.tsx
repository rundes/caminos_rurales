'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Boton } from '@/components/Boton'
import {
  guardarPreferenciaPrivacidad,
  leerPreferenciaPrivacidad,
  PREFERENCIA_PRIVACIDAD_DEFECTO,
  suscribirPreferenciaPrivacidad,
} from '@/lib/camara/privacidad-pref'
import {
  guardarPreferenciaRed,
  leerPreferenciaRed,
  PREFERENCIA_RED_DEFECTO,
  suscribirPreferenciaRed,
  type PreferenciaRed,
} from '@/lib/camara/red'
import { formatearFecha } from '@/lib/fechas'
import type { RecorridoEnError } from '@/lib/local/cola'
import { MAX_INTENTOS } from '@/lib/local/deps'
import type { RecorridoLocal } from '@/lib/local/tipos'
import { AvisoBateria } from './AvisoBateria'
import { formatearKm } from './formato'

type Props = {
  sinTerminar: RecorridoLocal | null
  error: string | null
  pendientes: number
  enError: RecorridoEnError[]
  proximoIntento: number | null
  intentos: number | null
  onIniciar: () => void
  onContinuar: () => void
  onCerrarPendiente: () => void
  onReintentar: (recorridoId: string) => void
  onDescartar: (recorridoId: string) => void
}

const UN_SEGUNDO_MS = 1000

/** Segundos restantes hasta `proximoIntento`, actualizado cada segundo. */
function useCuentaRegresiva(proximoIntento: number | null): number | null {
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (proximoIntento === null) return
    const id = setInterval(() => setAhora(Date.now()), UN_SEGUNDO_MS)
    return () => clearInterval(id)
  }, [proximoIntento])

  if (proximoIntento === null) return null
  return Math.max(0, Math.ceil((proximoIntento - ahora) / UN_SEGUNDO_MS))
}

/** Recorrido que no se pudo subir: motivo y acciones para reintentar o descartar. */
function BloqueError({
  error,
  onReintentar,
  onDescartar,
}: {
  error: RecorridoEnError
  onReintentar: () => void
  onDescartar: () => void
}) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-900">
      <p>
        Recorrido del {formatearFecha(error.inicio)} ({formatearKm(error.km)} km) no se pudo subir:{' '}
        {error.ultimoError}
      </p>
      <div className="flex gap-2">
        <Boton variante="secundario" onClick={onReintentar}>
          Reintentar
        </Boton>
        <Boton variante="secundario" onClick={onDescartar}>
          Descartar
        </Boton>
      </div>
    </div>
  )
}

/** Pantalla sin recorrido activo: arranque, rescate del anterior y avisos. */
export function PantallaInicio({
  sinTerminar,
  error,
  pendientes,
  enError,
  proximoIntento,
  intentos,
  onIniciar,
  onContinuar,
  onCerrarPendiente,
  onReintentar,
  onDescartar,
}: Props) {
  // `localStorage` no existe en el render del servidor: se lee como sistema
  // externo, con el valor por defecto hasta que hidrata.
  const red = useSyncExternalStore(
    suscribirPreferenciaRed,
    leerPreferenciaRed,
    () => PREFERENCIA_RED_DEFECTO,
  )
  const privacidad = useSyncExternalStore(
    suscribirPreferenciaPrivacidad,
    leerPreferenciaPrivacidad,
    () => PREFERENCIA_PRIVACIDAD_DEFECTO,
  )
  const restante = useCuentaRegresiva(proximoIntento)

  const cambiarRed = (soloWifi: boolean) => {
    const preferencia: PreferenciaRed = soloWifi ? 'wifi' : 'siempre'
    guardarPreferenciaRed(preferencia)
  }

  return (
    <section className="flex flex-col gap-4">
      <AvisoBateria />
      <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
        La grabación necesita la pantalla encendida y la app abierta en primer plano: si bloqueás el
        teléfono o cambiás a otra app, el GPS se corta y ese tramo no queda relevado. No hay grabación
        en segundo plano.
      </p>
      {sinTerminar && (
        <div className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-5">
          <p className="text-sm text-amber-900">Tenés un recorrido sin terminar en este dispositivo.</p>
          <Boton onClick={onContinuar}>Continuar</Boton>
          <Boton variante="secundario" onClick={onCerrarPendiente}>
            Finalizar y subir
          </Boton>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {pendientes > 0 && (
        <div role="status" className="flex flex-col gap-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p>{pendientes} recorrido(s) esperando subirse.</p>
          {restante !== null && intentos !== null && (
            <p>
              Reintentando en {restante}s (intento {intentos} de {MAX_INTENTOS})
            </p>
          )}
        </div>
      )}
      {enError.map((e) => (
        <BloqueError
          key={e.recorridoId}
          error={e}
          onReintentar={() => onReintentar(e.recorridoId)}
          onDescartar={() => onDescartar(e.recorridoId)}
        />
      ))}
      {!sinTerminar && <Boton onClick={onIniciar}>Iniciar recorrido</Boton>}
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white p-3 text-sm text-gray-700 shadow-sm">
        <input
          type="checkbox"
          checked={red === 'wifi'}
          onChange={(evento) => cambiarRed(evento.target.checked)}
          className="size-6 shrink-0 accent-green-700"
        />
        Subir cuadros solo con WiFi
      </label>
      <label className="flex flex-col gap-1 rounded-xl bg-white p-3 text-sm text-gray-700 shadow-sm">
        <span className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={privacidad}
            onChange={(evento) => guardarPreferenciaPrivacidad(evento.target.checked)}
            className="size-6 shrink-0 accent-green-700"
          />
          Difuminar caras y vehículos en los cuadros
        </span>
        <span className="pl-9 text-xs text-gray-500">
          Se aplica en el dispositivo antes de subir, nunca después. Cubre caras y vehículos que
          el modelo llega a detectar; no es infalible con caras chicas o lejanas, ángulos raros ni
          patentes sueltas sin un vehículo detectado alrededor. Con el ajuste apagado, los cuadros
          se suben sin procesar.
        </span>
      </label>
    </section>
  )
}

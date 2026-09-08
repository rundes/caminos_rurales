'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  calcularEstadoBanner,
  esIosSafari,
  estaDescartado,
  estaInstalada,
  marcarDescartado,
  type EstadoBanner,
} from '@/lib/pwa/instalacion'

/** El evento no está en el `lib.dom.d.ts` estándar: es específico de Chromium. */
type EventoInstalacion = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

/**
 * Banner de instalación de la PWA. En navegadores Chromium escucha
 * `beforeinstallprompt` y dispara el diálogo nativo con el botón "Instalar";
 * en iOS Safari ese evento no existe, así que se muestran las instrucciones
 * manuales (Compartir → Agregar a inicio). Se puede cerrar y queda recordado
 * en este dispositivo; nunca se muestra si la app ya corre instalada.
 */
export function BannerInstalar() {
  const [estado, setEstado] = useState<EstadoBanner>('oculto')
  const [promptEvento, setPromptEvento] = useState<EventoInstalacion | null>(null)

  const recalcular = useCallback((promptDisponible: boolean) => {
    setEstado(
      calcularEstadoBanner({
        instalada: estaInstalada(),
        descartado: estaDescartado(),
        promptDisponible,
        iosSafari: esIosSafari(),
      }),
    )
  }, [])

  useEffect(() => {
    // `estaInstalada`/`estaDescartado`/`esIosSafari` solo se pueden evaluar
    // en el cliente (localStorage, matchMedia, navigator.standalone): el
    // primer render arranca siempre oculto para que coincida con el HTML del
    // servidor, y acá se corrige apenas monta. No es un dato derivado de
    // props/estado, es sincronizarse con el entorno del navegador una vez.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recalcular(false)

    const alPedirInstalar = (evento: Event) => {
      // Sin esto Chrome muestra su propio mini-banner además del nuestro.
      evento.preventDefault()
      setPromptEvento(evento as EventoInstalacion)
      recalcular(true)
    }
    const alInstalar = () => {
      setPromptEvento(null)
      setEstado('oculto')
    }

    window.addEventListener('beforeinstallprompt', alPedirInstalar)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPedirInstalar)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [recalcular])

  const instalar = useCallback(async () => {
    if (!promptEvento) return
    try {
      await promptEvento.prompt()
      await promptEvento.userChoice
    } catch (error) {
      console.error('[instalacion]', error)
    } finally {
      setPromptEvento(null)
      recalcular(false)
    }
  }, [promptEvento, recalcular])

  const descartar = useCallback(() => {
    marcarDescartado()
    setEstado('oculto')
  }, [])

  if (estado === 'oculto') return null

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-xl bg-green-50 p-3 text-sm text-green-900"
    >
      {estado === 'instalable' ? (
        <>
          <p>Instalá Visiovial para grabar más rápido, incluso sin señal.</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void instalar()}
              className="min-h-11 rounded-lg bg-green-700 px-3 font-semibold text-white"
            >
              Instalar
            </button>
            <button
              type="button"
              onClick={descartar}
              aria-label="Cerrar aviso de instalación"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-lg text-green-800"
            >
              ✕
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Para instalar: tocá <strong>Compartir</strong> y elegí <strong>Agregar a inicio</strong>.
          </p>
          <button
            type="button"
            onClick={descartar}
            aria-label="Cerrar aviso de instalación"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg text-green-800"
          >
            ✕
          </button>
        </>
      )}
    </div>
  )
}

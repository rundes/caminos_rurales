'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  finalizarRecorrido,
  prepararSubida,
  type ResumenRecorrido,
} from '@/app/dashboard/recorrido/actions'
import { comprimirImagen } from '@/lib/imagenes'
import { baseLocal } from '@/lib/local/db'
import { procesarCola, type RecorridoEnError } from '@/lib/local/cola'
import type { DepsSincronizacion } from '@/lib/local/deps'
import { MAX_INTENTOS } from '@/lib/local/deps'
import { subirArchivo } from '@/lib/subida'
import { useEnLinea } from './useEnLinea'

const INTERVALO_MS = 60_000

const DEPS: DepsSincronizacion = {
  db: baseLocal,
  prepararSubida,
  finalizarRecorrido,
  subir: (destino, archivo) => subirArchivo(destino, archivo),
  comprimir: (archivo) => comprimirImagen(archivo),
  ahora: () => Date.now(),
}

export type { RecorridoEnError }

export type EstadoSincronizacion = {
  pendientes: number
  /** Resumen del servidor por recorrido, para no mostrarle a uno el de otro. */
  resumenes: Record<string, ResumenRecorrido>
  /** Recorridos del usuario que quedaron en error, con su motivo. */
  enError: RecorridoEnError[]
  /** Próximo reintento programado entre los recorridos que ya fallaron al menos una vez. */
  proximoIntento: number | null
  /** Intentos ya hechos para ese próximo reintento (de `MAX_INTENTOS`). */
  intentos: number | null
  sincronizar: () => Promise<void>
  /** Reintenta un recorrido en error: reinicia sus intentos y lo vuelve a encolar. */
  reintentar: (recorridoId: string) => Promise<void>
  /** Descarta un recorrido en error: no se vuelve a intentar subir. */
  descartar: (recorridoId: string) => Promise<void>
}

/** Próximo reintento entre los items de cola del usuario que ya fallaron al menos una vez. */
async function proximoPendiente(
  usuarioId: string,
): Promise<{ proximoIntento: number; intentos: number } | null> {
  const propios = await DEPS.db.listarRecorridos(usuarioId)
  const ids = new Set(propios.map((r) => r.id))
  const enEspera = (await DEPS.db.listarCola()).filter(
    (item) => ids.has(item.recorridoId) && item.intentos > 0 && item.intentos < MAX_INTENTOS,
  )
  if (enEspera.length === 0) return null
  const proximo = enEspera.reduce((min, item) => (item.proximoIntento < min.proximoIntento ? item : min))
  return { proximoIntento: proximo.proximoIntento, intentos: proximo.intentos }
}

/**
 * Vacía la cola de recorridos pendientes del usuario: al montar, al recuperar
 * conexión y cada minuto mientras queden pendientes. Nunca corre dos pasadas a
 * la vez; si llega un pedido mientras corre, se reencola para el final.
 */
export function useSincronizacion(usuarioId: string): EstadoSincronizacion {
  const [pendientes, setPendientes] = useState(0)
  const [resumenes, setResumenes] = useState<Record<string, ResumenRecorrido>>({})
  const [enError, setEnError] = useState<RecorridoEnError[]>([])
  const [proximo, setProximo] = useState<{ proximoIntento: number; intentos: number } | null>(null)
  const enLinea = useEnLinea()
  const corriendo = useRef(false)
  const pendienteDeCorrer = useRef(false)

  const sincronizar = useCallback(async () => {
    if (corriendo.current) {
      pendienteDeCorrer.current = true
      return
    }
    corriendo.current = true
    try {
      // Si llegó un pedido mientras corría la pasada, se repite en vez de perderse.
      do {
        pendienteDeCorrer.current = false
        const resultado = await procesarCola(DEPS, usuarioId)
        setPendientes(resultado.pendientes)
        setEnError(resultado.enError)
        setProximo(await proximoPendiente(usuarioId))
        if (Object.keys(resultado.resumenes).length > 0) {
          setResumenes((previos) => ({ ...previos, ...resultado.resumenes }))
        }
      } while (pendienteDeCorrer.current)
    } catch (error) {
      console.error('[sincronizacion]', error)
    } finally {
      pendienteDeCorrer.current = false
      corriendo.current = false
    }
  }, [usuarioId])

  const reintentar = useCallback(
    async (recorridoId: string) => {
      try {
        const recorrido = await DEPS.db.obtenerRecorrido(recorridoId)
        if (recorrido) {
          await DEPS.db.guardarRecorrido({ ...recorrido, estado: 'finalizado', ultimoError: undefined })
        }
        // Reinicia los intentos y el backoff: reemplaza el item, no lo mezcla.
        await DEPS.db.guardarItemCola({ recorridoId, intentos: 0, proximoIntento: 0 })
      } catch (error) {
        console.error('[sincronizacion]', error)
      }
      await sincronizar()
    },
    [sincronizar],
  )

  const descartar = useCallback(
    async (recorridoId: string) => {
      try {
        const recorrido = await DEPS.db.obtenerRecorrido(recorridoId)
        if (recorrido) await DEPS.db.guardarRecorrido({ ...recorrido, estado: 'descartado' })
        await DEPS.db.borrarItemCola(recorridoId)
      } catch (error) {
        console.error('[sincronizacion]', error)
      }
      setEnError((previos) => previos.filter((e) => e.recorridoId !== recorridoId))
    },
    [],
  )

  // El pase se difiere a un microtask para no encadenar renders desde el efecto.
  useEffect(() => {
    if (!enLinea) return
    void Promise.resolve().then(sincronizar)
  }, [enLinea, sincronizar])

  useEffect(() => {
    if (pendientes === 0) return
    const id = setInterval(() => {
      if (navigator.onLine) void sincronizar()
    }, INTERVALO_MS)
    return () => clearInterval(id)
  }, [pendientes, sincronizar])

  return {
    pendientes,
    resumenes,
    enError,
    proximoIntento: proximo?.proximoIntento ?? null,
    intentos: proximo?.intentos ?? null,
    sincronizar,
    reintentar,
    descartar,
  }
}

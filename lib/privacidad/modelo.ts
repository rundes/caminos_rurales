import type { BlazeFaceModel } from '@tensorflow-models/blazeface'
import type { ObjectDetection } from '@tensorflow-models/coco-ssd'
import type { DetectorPrivacidad, RegionDetectada } from './tipos'
import { CLASES_COCO_A_BLOQUEAR } from './umbrales'

/**
 * Pesos servidos desde el propio origen (`public/modelos/`), nunca desde un
 * CDN: la CSP (`next.config.ts`) no tiene `script-src` propio y su
 * `connect-src` es `'self'` más los hosts de Supabase/IGN/OSM, así que un
 * `fetch` a un CDN de terceros en tiempo de ejecución quedaría bloqueado.
 * Ver la sección de privacidad del README para el tamaño de cada modelo.
 */
const RUTA_BLAZEFACE = '/modelos/blazeface/model.json'
const RUTA_COCO_SSD = '/modelos/coco-ssd/model.json'

type Modelos = { coco: ObjectDetection; cara: BlazeFaceModel }

let cargando: Promise<Modelos> | null = null

async function cargarModelos(): Promise<Modelos> {
  const [tf, cocoSsd, blazeface] = await Promise.all([
    import('@tensorflow/tfjs-core'),
    import('@tensorflow-models/coco-ssd'),
    import('@tensorflow-models/blazeface'),
  ])
  // Efecto de borde: registra los backends. WebGL es el rápido (GPU); CPU
  // queda de respaldo en el dispositivo raro que no lo soporte.
  await Promise.all([import('@tensorflow/tfjs-backend-webgl'), import('@tensorflow/tfjs-backend-cpu')])
  try {
    await tf.setBackend('webgl')
  } catch (error) {
    console.error('[privacidad]', error)
    await tf.setBackend('cpu')
  }
  await tf.ready()

  const [coco, cara] = await Promise.all([
    cocoSsd.load({ modelUrl: RUTA_COCO_SSD }),
    blazeface.load({ modelUrl: RUTA_BLAZEFACE }),
  ])
  return { coco, cara }
}

/**
 * Detector real: caras con BlazeFace, personas y vehículos con COCO-SSD
 * (`lib/privacidad/umbrales.ts` decide qué clases de COCO-SSD se bloquean
 * enteras). Los modelos se cargan recién la primera vez que hace falta
 * difuminar algo — nunca durante la grabación, ver `lib/local/cola-
 * cuadros.ts` — y la promesa de carga se memoiza en el módulo: una vez
 * cargados, cuadros sucesivos del mismo dispositivo no vuelven a pedir los
 * pesos (además de que el service worker los cachea, ver `public/sw.js`).
 */
export const detectorReal: DetectorPrivacidad = {
  async cargar() {
    if (!cargando) {
      cargando = cargarModelos().catch((error: unknown) => {
        // Un intento fallido no queda memoizado: el próximo cuadro reintenta
        // la carga en vez de fallar para siempre por, por ejemplo, un corte
        // de red a mitad de la descarga de los pesos.
        cargando = null
        throw error
      })
    }
    await cargando
  },

  async detectar(datos) {
    if (!cargando) throw new Error('El modelo de privacidad todavía no se cargó.')
    const { coco, cara } = await cargando

    const [caras, objetos] = await Promise.all([
      cara.estimateFaces(datos, false),
      coco.detect(datos),
    ])

    const regiones: RegionDetectada[] = []

    for (const f of caras) {
      const [x1, y1] = f.topLeft as [number, number]
      const [x2, y2] = f.bottomRight as [number, number]
      const confianza = typeof f.probability === 'number' ? f.probability : 1
      regiones.push({
        caja: { x: x1, y: y1, ancho: x2 - x1, alto: y2 - y1 },
        tipo: 'cara',
        confianza,
      })
    }

    for (const o of objetos) {
      if (!CLASES_COCO_A_BLOQUEAR.has(o.class)) continue
      const [x, y, ancho, alto] = o.bbox
      regiones.push({
        caja: { x, y, ancho, alto },
        tipo: o.class === 'person' ? 'persona' : 'vehiculo',
        confianza: o.score,
      })
    }

    return regiones
  },
}

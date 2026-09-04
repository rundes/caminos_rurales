import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ResumenRecorrido as Resumen } from '@/app/dashboard/recorrido/actions'
import type { ControlGrabador } from '@/hooks/useGrabadorGps'
import type { ResultadoCierre } from '@/lib/local/cierre'
import { GRABADOR_INICIAL, type Grabador } from '@/lib/local/grabador'
import type { PuntoGps } from '@/lib/track'

vi.mock('next/dynamic', () => ({
  default: () => function MapaFalso() {
    return <div data-testid="mapa" />
  },
}))

vi.mock('@/hooks/useGrabadorGps', () => ({ useGrabadorGps: vi.fn() }))
vi.mock('@/hooks/useSincronizacion', () => ({ useSincronizacion: vi.fn() }))
vi.mock('@/hooks/useSincronizacionCuadros', () => ({ useSincronizacionCuadros: vi.fn() }))
vi.mock('@/lib/local/db', () => ({
  recorridoEnCurso: vi.fn(async () => undefined),
  guardarObservacion: vi.fn(async () => {}),
  // Los usan `useSensores` y `useCamara`, que corren de verdad dentro de la vista.
  guardarMuestra: vi.fn(async () => {}),
  guardarImpacto: vi.fn(async () => {}),
  guardarCuadro: vi.fn(async () => 1),
  encolarCuadros: vi.fn(async () => {}),
  contarCuadros: vi.fn(async () => 0),
}))
vi.mock('@/lib/local/cierre', () => ({ cerrarRecorrido: vi.fn(async () => ({ ok: true })) }))

const { RecorridoView } = await import('@/components/recorrido/RecorridoView')
const { useGrabadorGps } = await import('@/hooks/useGrabadorGps')
const { useSincronizacion } = await import('@/hooks/useSincronizacion')
const { useSincronizacionCuadros } = await import('@/hooks/useSincronizacionCuadros')
const { recorridoEnCurso } = await import('@/lib/local/db')

const CENTRO: [number, number] = [-36.85, -57.88]
const T0 = 1_700_000_000_000
const USUARIO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const RECORRIDO = '11111111-1111-4111-8111-111111111111'

const RESUMEN: Resumen = {
  km: 4.5,
  tramosNuevos: 2,
  tramosRepetidos: 1,
  puntos: 30,
  insignias: [],
  coberturaMunicipio: 0.2,
  kmPorCalidad: { sin_dato: 0, bueno: 0, regular: 0, malo: 0, intransitable: 0 },
  impactos: 0,
}

function punto(indice: number): PuntoGps {
  return { lat: -36.85 + indice * 0.01, lng: -57.88, t: T0 + indice * 1000, precision: 6 }
}

const GRABANDO: Grabador = {
  estado: 'grabando',
  recorridoId: RECORRIDO,
  inicio: T0,
  fin: null,
  ultimo: punto(1),
  km: 1.23,
  cantidad: 2,
}

function control(estado: Grabador, extra: Partial<ControlGrabador> = {}): ControlGrabador {
  const cierre: ResultadoCierre = { ok: true, recorrido: { ...RECORRIDO_LOCAL, id: estado.recorridoId ?? '' } }
  return {
    estado,
    error: null,
    precision: 7,
    obtenerPuntos: () => [punto(0), punto(1)],
    iniciar: vi.fn(async () => {}),
    retomar: vi.fn(async () => {}),
    pausar: vi.fn(),
    reanudar: vi.fn(),
    finalizar: vi.fn(async (): Promise<ResultadoCierre | null> => cierre),
    ...extra,
  }
}

const RECORRIDO_LOCAL = {
  id: RECORRIDO,
  usuarioId: USUARIO,
  inicio: '2026-09-03T10:00:00.000Z',
  estado: 'finalizado' as const,
  municipio: 'maipu',
  puntosGps: 2,
  km: 1.23,
}

function sincronizacion(pendientes = 0, resumenes: Record<string, Resumen> = {}) {
  return { pendientes, resumenes, sincronizar: vi.fn(async () => {}) }
}

/** `getUserMedia` falso: jsdom no trae `mediaDevices`. */
function stubCamara(implementacion: () => Promise<MediaStream> = async () => STREAM) {
  const getUserMedia = vi.fn<(restricciones: MediaStreamConstraints) => Promise<MediaStream>>(
    implementacion,
  )
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } })
  return getUserMedia
}

const STREAM = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream

function renderVista() {
  return render(
    <RecorridoView usuarioId={USUARIO} municipio="maipu" capas={null} limites={null} centro={CENTRO} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(recorridoEnCurso).mockResolvedValue(undefined)
  vi.mocked(useSincronizacion).mockReturnValue(sincronizacion())
  vi.mocked(useSincronizacionCuadros).mockReturnValue({
    pendientes: 0,
    subidos: 0,
    forzarConDatos: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RecorridoView', () => {
  test('sin recorrido activo muestra el botón de iniciar', async () => {
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABADOR_INICIAL))

    renderVista()

    expect(await screen.findByRole('button', { name: /iniciar recorrido/i })).toBeInTheDocument()
    expect(screen.queryByTestId('mapa')).not.toBeInTheDocument()
  })

  test('busca el recorrido sin terminar del usuario en sesión', async () => {
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABADOR_INICIAL))

    renderVista()

    await waitFor(() => expect(recorridoEnCurso).toHaveBeenCalledWith(USUARIO))
  })

  test('ofrece continuar o finalizar un recorrido sin terminar', async () => {
    const retomar = vi.fn(async () => {})
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABADOR_INICIAL, { retomar }))
    vi.mocked(recorridoEnCurso).mockResolvedValue({ ...RECORRIDO_LOCAL, id: 'abc', estado: 'en_curso' })

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /continuar/i }))

    expect(retomar).toHaveBeenCalledWith('abc')
    expect(screen.queryByRole('button', { name: /iniciar recorrido/i })).toBeInTheDocument()
  })

  test('pide el permiso de cámara dentro del gesto de iniciar', async () => {
    const iniciar = vi.fn(async () => {})
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABADOR_INICIAL, { iniciar }))
    const getUserMedia = stubCamara()

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /iniciar recorrido/i }))

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({
      video: { facingMode: 'environment' },
    })
    expect(iniciar).toHaveBeenCalledTimes(1)
  })

  test('sin permiso de cámara el recorrido arranca igual', async () => {
    const iniciar = vi.fn(async () => {})
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABADOR_INICIAL, { iniciar }))
    stubCamara(async () => {
      throw new Error('NotAllowedError')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /iniciar recorrido/i }))

    await waitFor(() => expect(iniciar).toHaveBeenCalledTimes(1))
  })

  test('grabando muestra la vista de cámara con su contador', async () => {
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO))

    renderVista()

    expect(await screen.findByTestId('video-camara')).toBeInTheDocument()
    expect(screen.getByLabelText('cuadros capturados')).toHaveTextContent('0 cuadro(s)')
  })

  test('grabando muestra el mapa, los km y el tiempo transcurrido', async () => {
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO))

    renderVista()

    expect(await screen.findByTestId('mapa')).toBeInTheDocument()
    expect(screen.getByText('km')).toBeInTheDocument()
    expect(screen.getByText(/1[.,]23/)).toBeInTheDocument()
    expect(screen.getByText('tiempo')).toBeInTheDocument()
    expect(screen.getByText(/^\d+:\d{2}(:\d{2})?$/)).toBeInTheDocument()
    expect(screen.getByText('7 m')).toBeInTheDocument()
  })

  test('el botón Observación pausa la grabación y abre el formulario con la posición congelada', async () => {
    const pausar = vi.fn()
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO, { pausar }))

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /^observación$/i }))

    expect(pausar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar observación/i })).toBeInTheDocument()
    // La posición congelada es el último punto: el formulario ya no pide ubicación.
    await userEvent.click(screen.getByRole('button', { name: /guardar observación/i }))
    expect(screen.queryByText(/todavía no tenemos tu ubicación/i)).not.toBeInTheDocument()
  })

  test('cancelar la observación reanuda la grabación', async () => {
    const reanudar = vi.fn()
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO, { reanudar }))

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /^observación$/i }))
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(reanudar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('finalizar cierra el recorrido y muestra el estado pendiente cuando no hay conexión', async () => {
    const finalizar = vi.fn(async (): Promise<ResultadoCierre> => ({ ok: true, recorrido: RECORRIDO_LOCAL }))
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO, { finalizar }))
    vi.mocked(useSincronizacion).mockReturnValue(sincronizacion(1))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    await waitFor(() => expect(finalizar).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/recorrido finalizado/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Pendiente de subir (sin conexión)')
    vi.restoreAllMocks()
  })

  test('un recorrido sin puntos se descarta y se avisa', async () => {
    const finalizar = vi.fn(
      async (): Promise<ResultadoCierre> => ({
        ok: false,
        motivo: 'descartado',
        mensaje: 'Recorrido sin puntos GPS, descartado.',
      }),
    )
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO, { finalizar }))

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/descartado/i))
    expect(screen.queryByText(/recorrido finalizado/i)).not.toBeInTheDocument()
  })

  test('muestra el resumen del propio recorrido y no el de otro', async () => {
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO))
    vi.mocked(useSincronizacion).mockReturnValue(sincronizacion(0, { otro: RESUMEN }))

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    await waitFor(() => expect(screen.getByText(/recorrido finalizado/i)).toBeInTheDocument())
    // Sin resumen propio se sigue mostrando el aviso de subida, no los datos ajenos.
    expect(screen.getByRole('status')).toHaveTextContent('Subiendo')
    expect(screen.queryByText(/tramo\(s\) nuevo\(s\)/i)).not.toBeInTheDocument()
  })

  test('con el resumen del propio recorrido muestra los tramos', async () => {
    vi.mocked(useGrabadorGps).mockReturnValue(control(GRABANDO))
    vi.mocked(useSincronizacion).mockReturnValue(sincronizacion(0, { [RECORRIDO]: RESUMEN }))

    renderVista()

    await userEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    await waitFor(() => expect(screen.getByText(/tramo\(s\) nuevo\(s\)/i)).toBeInTheDocument())
  })
})

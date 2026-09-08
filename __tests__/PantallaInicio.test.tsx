import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { PantallaInicio } from '@/components/recorrido/PantallaInicio'
import { CLAVE_PREFERENCIA_PRIVACIDAD } from '@/lib/camara/privacidad-pref'
import type { RecorridoEnError } from '@/lib/local/cola'
import type { RecorridoLocal } from '@/lib/local/tipos'

const USUARIO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'

const SIN_TERMINAR: RecorridoLocal = {
  id: '11111111-1111-4111-8111-111111111111',
  usuarioId: USUARIO,
  inicio: '2026-09-03T10:00:00.000Z',
  estado: 'en_curso',
  municipio: 'maipu',
  puntosGps: 12,
  km: 1.5,
}

function props(extra: Partial<Parameters<typeof PantallaInicio>[0]> = {}) {
  return {
    sinTerminar: null,
    error: null,
    pendientes: 0,
    enError: [] as RecorridoEnError[],
    proximoIntento: null,
    intentos: null,
    onIniciar: vi.fn(),
    onContinuar: vi.fn(),
    onCerrarPendiente: vi.fn(),
    onReintentar: vi.fn(),
    onDescartar: vi.fn(),
    ...extra,
  }
}

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('PantallaInicio', () => {
  test('sin recorrido sin terminar muestra el botón de iniciar', async () => {
    const onIniciar = vi.fn()
    render(<PantallaInicio {...props({ onIniciar })} />)

    await userEvent.click(screen.getByRole('button', { name: /iniciar recorrido/i }))

    expect(onIniciar).toHaveBeenCalledTimes(1)
  })

  test('con un recorrido sin terminar ofrece continuar o finalizar y no el de iniciar', async () => {
    const onContinuar = vi.fn()
    const onCerrarPendiente = vi.fn()
    render(<PantallaInicio {...props({ sinTerminar: SIN_TERMINAR, onContinuar, onCerrarPendiente })} />)

    expect(screen.queryByRole('button', { name: /^iniciar recorrido$/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }))
    expect(onContinuar).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: /finalizar y subir/i }))
    expect(onCerrarPendiente).toHaveBeenCalledTimes(1)
  })

  test('muestra el error general en un rol alert', () => {
    render(<PantallaInicio {...props({ error: 'No pudimos leer los recorridos guardados.' })} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/no pudimos leer/i)
  })

  test('muestra la cantidad de pendientes', () => {
    render(<PantallaInicio {...props({ pendientes: 2 })} />)

    expect(screen.getByRole('status')).toHaveTextContent('2 recorrido(s) esperando subirse.')
  })

  test('con proximoIntento muestra la cuenta regresiva y el intento', () => {
    vi.useFakeTimers().setSystemTime(1_700_000_000_000)
    render(
      <PantallaInicio
        {...props({ pendientes: 1, proximoIntento: 1_700_000_005_000, intentos: 3 })}
      />,
    )

    expect(screen.getByText(/reintentando en 5s \(intento 3 de 20\)/i)).toBeInTheDocument()
  })

  test('un recorrido en error muestra el motivo con Reintentar y Descartar', async () => {
    const error: RecorridoEnError = {
      recorridoId: 'r1',
      ultimoError: 'Ese recorrido ya fue registrado por otra persona.',
      inicio: '2026-09-03T10:00:00.000Z',
      km: 4.2,
    }
    const onReintentar = vi.fn()
    const onDescartar = vi.fn()
    render(<PantallaInicio {...props({ enError: [error], onReintentar, onDescartar })} />)

    const bloque = screen.getByRole('alert')
    expect(bloque).toHaveTextContent(/no se pudo subir/i)
    expect(bloque).toHaveTextContent(/ese recorrido ya fue registrado por otra persona/i)

    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(onReintentar).toHaveBeenCalledWith('r1')

    await userEvent.click(screen.getByRole('button', { name: /descartar/i }))
    expect(onDescartar).toHaveBeenCalledWith('r1')
  })

  test('sin errores no muestra ningún bloque rojo de error', () => {
    render(<PantallaInicio {...props()} />)

    expect(screen.queryByRole('button', { name: /descartar/i })).not.toBeInTheDocument()
  })

  test('el ajuste de difuminado viene activado por defecto y avisa lo que no cubre', () => {
    render(<PantallaInicio {...props()} />)

    const casilla = screen.getByRole('checkbox', { name: /difuminar caras y vehículos/i })
    expect(casilla).toBeChecked()
    expect(screen.getByText(/no es infalible con caras chicas o lejanas/i)).toBeInTheDocument()
  })

  test('se puede apagar el difuminado, y queda guardado', async () => {
    render(<PantallaInicio {...props()} />)

    const casilla = screen.getByRole('checkbox', { name: /difuminar caras y vehículos/i })
    await userEvent.click(casilla)

    expect(casilla).not.toBeChecked()
    expect(window.localStorage.getItem(CLAVE_PREFERENCIA_PRIVACIDAD)).toBe('0')
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AvisoBateria } from '@/components/recorrido/AvisoBateria'

type OyenteBateria = () => void

/** `BatteryManager` falso, con `level`/`charging` mutables y oyentes reales. */
function bateriaFalsa(level: number, charging: boolean) {
  const oyentes: Record<string, OyenteBateria[]> = { levelchange: [], chargingchange: [] }
  const gestor = {
    level,
    charging,
    addEventListener: (tipo: string, oyente: OyenteBateria) => {
      oyentes[tipo]?.push(oyente)
    },
    removeEventListener: (tipo: string, oyente: OyenteBateria) => {
      oyentes[tipo] = (oyentes[tipo] ?? []).filter((o) => o !== oyente)
    },
  }
  return {
    gestor,
    disparar(tipo: 'levelchange' | 'chargingchange') {
      oyentes[tipo]?.forEach((o) => o())
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AvisoBateria', () => {
  test('sin Battery Status API (iOS) muestra el mensaje genérico, sin romper', () => {
    render(<AvisoBateria />)

    expect(screen.getByText(/gastan batería rápido/i)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  test('con batería baja y sin cargar muestra el porcentaje y el aviso más serio', async () => {
    const { gestor } = bateriaFalsa(0.15, false)
    vi.stubGlobal('navigator', { ...navigator, getBattery: vi.fn(async () => gestor) })

    render(<AvisoBateria />)

    expect(await screen.findByText(/15%/)).toBeInTheDocument()
    expect(screen.getByText(/puede no alcanzar/i)).toBeInTheDocument()
  })

  test('con batería normal no muestra el aviso serio', async () => {
    const { gestor } = bateriaFalsa(0.8, false)
    vi.stubGlobal('navigator', { ...navigator, getBattery: vi.fn(async () => gestor) })

    render(<AvisoBateria />)

    expect(await screen.findByText(/80%/)).toBeInTheDocument()
    expect(screen.queryByText(/puede no alcanzar/i)).not.toBeInTheDocument()
  })

  test('un cambio de nivel actualiza el mensaje en vivo', async () => {
    const { gestor, disparar } = bateriaFalsa(0.5, false)
    vi.stubGlobal('navigator', { ...navigator, getBattery: vi.fn(async () => gestor) })

    render(<AvisoBateria />)
    await screen.findByText(/50%/)

    gestor.level = 0.1
    disparar('levelchange')

    await waitFor(() => expect(screen.getByText(/10%/)).toBeInTheDocument())
  })

  test('se puede cerrar con un toque', async () => {
    render(<AvisoBateria />)

    await userEvent.click(screen.getByRole('button', { name: /cerrar aviso de batería/i }))

    expect(screen.queryByText(/gastan batería rápido/i)).not.toBeInTheDocument()
  })
})

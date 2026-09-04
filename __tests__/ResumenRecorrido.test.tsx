import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { ResumenRecorrido as Resumen } from '@/app/dashboard/recorrido/actions'
import { ResumenRecorrido } from '@/components/recorrido/ResumenRecorrido'

const RESUMEN: Resumen = {
  km: 4.5,
  tramosNuevos: 2,
  tramosRepetidos: 1,
  puntos: 30,
  insignias: [],
  coberturaMunicipio: 0.2,
  kmPorCalidad: { sin_dato: 0.5, bueno: 2, regular: 1.2, malo: 0.8, intransitable: 0 },
  impactos: 3,
}

function renderResumen(resumen: Resumen | null) {
  return render(
    <ResumenRecorrido
      km={4.5}
      puntosGps={120}
      resumen={resumen}
      sinConexion={false}
      onNuevo={vi.fn()}
    />,
  )
}

describe('ResumenRecorrido', () => {
  test('muestra los km por calidad estimada y los impactos', () => {
    renderResumen(RESUMEN)

    expect(screen.getByText(/estado estimado del camino/i)).toBeInTheDocument()
    expect(screen.getByText('Bueno')).toBeInTheDocument()
    expect(screen.getByText('Regular')).toBeInTheDocument()
    expect(screen.getByText('Malo')).toBeInTheDocument()
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(screen.getByText('2,00 km')).toBeInTheDocument()
    expect(screen.getByText(/3 impacto\(s\) detectado\(s\)/i)).toBeInTheDocument()
  })

  test('omite las calidades sin km', () => {
    renderResumen(RESUMEN)

    expect(screen.queryByText('Intransitable')).not.toBeInTheDocument()
  })

  test('sin km de sensores no dibuja las barras ni los impactos', () => {
    renderResumen({
      ...RESUMEN,
      kmPorCalidad: { sin_dato: 0, bueno: 0, regular: 0, malo: 0, intransitable: 0 },
      impactos: 0,
    })

    expect(screen.queryByText(/estado estimado del camino/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/impacto\(s\) detectado\(s\)/i)).not.toBeInTheDocument()
  })

  test('muestra los cuadros capturados y ofrece subirlos con datos', async () => {
    const onSubirCuadros = vi.fn()
    render(
      <ResumenRecorrido
        km={4.5}
        puntosGps={120}
        resumen={null}
        sinConexion={false}
        cuadros={40}
        cuadrosPendientes={12}
        onSubirCuadros={onSubirCuadros}
        onNuevo={vi.fn()}
      />,
    )

    expect(screen.getByText(/40 capturados · 12 pendientes de subir \(WiFi\)/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /subir ahora con datos/i }))
    expect(onSubirCuadros).toHaveBeenCalledTimes(1)
  })

  test('sin cuadros pendientes no ofrece subirlos con datos', () => {
    render(
      <ResumenRecorrido
        km={4.5}
        puntosGps={120}
        resumen={null}
        sinConexion={false}
        cuadros={40}
        cuadrosPendientes={0}
        onSubirCuadros={vi.fn()}
        onNuevo={vi.fn()}
      />,
    )

    expect(screen.getByText(/40 capturados/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /subir ahora con datos/i })).not.toBeInTheDocument()
  })

  test('sin resumen del servidor avisa que se está subiendo', async () => {
    const onNuevo = vi.fn()
    render(
      <ResumenRecorrido km={4.5} puntosGps={120} resumen={null} sinConexion onNuevo={onNuevo} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/pendiente de subir/i)
    await userEvent.click(screen.getByRole('button', { name: /iniciar otro recorrido/i }))
    expect(onNuevo).toHaveBeenCalledTimes(1)
  })
})

import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { BarraCobertura } from '@/components/BarraCobertura'

test('muestra etiqueta, cubiertos/tramos y porcentaje', () => {
  render(<BarraCobertura etiqueta="Maipú" cubiertos={3} tramos={10} />)
  expect(screen.getByText('Maipú')).toBeInTheDocument()
  expect(screen.getByText('3/10 · 30%')).toBeInTheDocument()
})

test('expone la barra como progressbar accesible', () => {
  render(<BarraCobertura etiqueta="Maipú" cubiertos={3} tramos={10} />)
  const barra = screen.getByRole('progressbar', { name: 'Maipú' })
  expect(barra).toHaveAttribute('aria-valuenow', '30')
  expect(barra).toHaveAttribute('aria-valuemin', '0')
  expect(barra).toHaveAttribute('aria-valuemax', '100')
})

test('sin tramos no divide por cero', () => {
  render(<BarraCobertura etiqueta="Sin datos" cubiertos={0} tramos={0} />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
})

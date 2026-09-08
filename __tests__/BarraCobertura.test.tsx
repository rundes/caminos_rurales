import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { BarraCobertura } from '@/components/BarraCobertura'

test('muestra etiqueta, km cubiertos/total y porcentaje', () => {
  render(<BarraCobertura etiqueta="Maipú" km={10} kmCubiertos={3} cubiertos={3} tramos={10} />)
  expect(screen.getByText('Maipú')).toBeInTheDocument()
  expect(screen.getByText('3,0 km de 10,0 km · 30%')).toBeInTheDocument()
})

test('muestra la cantidad de tramos como texto secundario', () => {
  render(<BarraCobertura etiqueta="Maipú" km={10} kmCubiertos={3} cubiertos={3} tramos={10} />)
  expect(screen.getByText('3 de 10 tramos')).toBeInTheDocument()
})

test('expone la barra como progressbar accesible, con % de km', () => {
  render(<BarraCobertura etiqueta="Maipú" km={10} kmCubiertos={3} cubiertos={9} tramos={10} />)
  const barra = screen.getByRole('progressbar', { name: 'Maipú' })
  expect(barra).toHaveAttribute('aria-valuenow', '30')
  expect(barra).toHaveAttribute('aria-valuemin', '0')
  expect(barra).toHaveAttribute('aria-valuemax', '100')
})

test('sin km no divide por cero', () => {
  render(<BarraCobertura etiqueta="Sin datos" km={0} kmCubiertos={0} cubiertos={0} tramos={0} />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
})

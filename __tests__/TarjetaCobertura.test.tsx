import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { TarjetaCobertura } from '@/components/TarjetaCobertura'
import type { ResumenCobertura } from '@/lib/cobertura-resumen'

const RESUMEN: ResumenCobertura = {
  porLocalidad: [
    { localidad: 'Maipú', tramos: 10, cubiertos: 5, km: 50, kmCubiertos: 25 },
    { localidad: 'Franklin', tramos: 4, cubiertos: 4, km: 20, kmCubiertos: 20 },
  ],
  total: { tramos: 14, cubiertos: 9, km: 70, kmCubiertos: 45, fraccion: 9 / 14 },
}

test('muestra el porcentaje del municipio y los km cubiertos/total', () => {
  render(<TarjetaCobertura resumen={RESUMEN} />)
  expect(screen.getByText('64%')).toBeInTheDocument()
  expect(screen.getByText(/45 km cubiertos de 70 km/)).toBeInTheDocument()
})

test('renderiza una barra por localidad', () => {
  render(<TarjetaCobertura resumen={RESUMEN} />)
  expect(screen.getByRole('progressbar', { name: 'Maipú' })).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Franklin' })).toBeInTheDocument()
})

test('sin localidades muestra un mensaje en vez de barras vacías', () => {
  render(<TarjetaCobertura resumen={{ porLocalidad: [], total: { tramos: 0, cubiertos: 0, km: 0, kmCubiertos: 0, fraccion: 0 } }} />)
  expect(screen.getByText('Todavía no hay tramos registrados.')).toBeInTheDocument()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})

test('acepta un título personalizado', () => {
  render(<TarjetaCobertura resumen={RESUMEN} titulo="Cobertura de Maipú" />)
  expect(screen.getByRole('heading', { name: 'Cobertura de Maipú' })).toBeInTheDocument()
})

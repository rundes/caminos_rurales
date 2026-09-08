import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

const push = vi.fn()
let query = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/dashboard/mapa',
  useSearchParams: () => new URLSearchParams(query),
}))

const { FiltrosObservaciones } = await import('@/components/FiltrosObservaciones')

test('cambiar tipo escribe la query string', async () => {
  query = ''
  render(<FiltrosObservaciones />)
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'bache')
  expect(push).toHaveBeenCalledWith('/dashboard/mapa?tipo=bache')
})

test('cambiar severidad conserva el resto de la query', async () => {
  query = 'tipo=bache'
  render(<FiltrosObservaciones />)
  await userEvent.selectOptions(screen.getByLabelText('Severidad'), 'alta')
  expect(push).toHaveBeenCalledWith('/dashboard/mapa?tipo=bache&severidad=alta')
})

test('cambiar origen y estado actualiza la query', async () => {
  query = ''
  render(<FiltrosObservaciones />)
  await userEvent.selectOptions(screen.getByLabelText('Origen'), 'sensor')
  expect(push).toHaveBeenCalledWith('/dashboard/mapa?origen=sensor')
})

test('cambiar desde/hasta actualiza la query con fechas', async () => {
  query = ''
  render(<FiltrosObservaciones />)
  await userEvent.type(screen.getByLabelText('Desde'), '2026-01-01')
  expect(push).toHaveBeenCalledWith('/dashboard/mapa?desde=2026-01-01')
})

test('no hay selector de municipio', () => {
  query = ''
  render(<FiltrosObservaciones />)
  expect(screen.queryByLabelText(/municipio/i)).not.toBeInTheDocument()
})

test('sin filtros activos no muestra "Limpiar filtros"', () => {
  query = ''
  render(<FiltrosObservaciones />)
  expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
})

test('con filtros activos, "Limpiar filtros" navega sin query string', async () => {
  query = 'tipo=bache&estado=pendiente'
  render(<FiltrosObservaciones />)
  await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  expect(push).toHaveBeenCalledWith('/dashboard/mapa')
})

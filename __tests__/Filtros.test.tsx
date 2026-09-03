import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/dashboard/mapa',
  useSearchParams: () => new URLSearchParams('municipio=carlos-tejedor'),
}))

const { Filtros } = await import('@/app/dashboard/mapa/Filtros')

test('cambiar tipo actualiza la query string conservando municipio', async () => {
  render(<Filtros municipios={['carlos-tejedor']} />)
  await userEvent.selectOptions(screen.getByLabelText(/tipo de falla/i), 'bache')
  expect(push).toHaveBeenCalledWith('/dashboard/mapa?municipio=carlos-tejedor&tipo=bache')
})

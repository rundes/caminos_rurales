import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { KpiCard } from '@/components/KpiCard'

test('muestra etiqueta y valor', () => {
  render(<KpiCard etiqueta="Km relevados" valor="12,5" />)
  expect(screen.getByText('Km relevados')).toBeInTheDocument()
  expect(screen.getByText('12,5')).toBeInTheDocument()
})

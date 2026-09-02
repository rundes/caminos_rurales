import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

function Hola() {
  return <h1>Visiovial Rural</h1>
}

test('renderiza un componente con Testing Library', () => {
  render(<Hola />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Visiovial Rural')
})

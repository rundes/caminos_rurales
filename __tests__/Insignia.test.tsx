import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Insignia } from '@/components/Insignia'

test('muestra la etiqueta legible de una insignia obtenida', () => {
  render(<Insignia codigo="primer_recorrido" obtenida />)
  expect(screen.getByText('Primer recorrido')).toBeInTheDocument()
  expect(screen.getByLabelText('Primer recorrido')).toBeInTheDocument()
})

test('marca visualmente y en el label las insignias no obtenidas', () => {
  render(<Insignia codigo="explorador_50km" obtenida={false} />)
  const insignia = screen.getByLabelText('Explorador 50 km (sin obtener)')
  expect(insignia.className).toMatch(/grayscale/)
})

test('resuelve la etiqueta de localidad_completa:<localidad>', () => {
  render(<Insignia codigo="localidad_completa:Franklin" obtenida />)
  expect(screen.getByText('Localidad completa: Franklin')).toBeInTheDocument()
})

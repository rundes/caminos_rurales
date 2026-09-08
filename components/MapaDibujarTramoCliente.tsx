'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { MapaDibujarTramo } from './MapaDibujarTramo'

const Mapa = dynamic(() => import('./MapaDibujarTramo').then((m) => m.MapaDibujarTramo), {
  ssr: false,
  loading: () => <div className="h-[40dvh] w-full animate-pulse rounded-2xl bg-gray-200" />,
})

export function MapaDibujarTramoCliente(props: ComponentProps<typeof MapaDibujarTramo>) {
  return <Mapa {...props} />
}

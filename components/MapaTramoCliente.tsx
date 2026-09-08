'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { MapaTramo } from './MapaTramo'

const Mapa = dynamic(() => import('./MapaTramo').then((m) => m.MapaTramo), {
  ssr: false,
  loading: () => <div className="h-[40dvh] w-full animate-pulse rounded-2xl bg-gray-200" />,
})

export function MapaTramoCliente(props: ComponentProps<typeof MapaTramo>) {
  return <Mapa {...props} />
}

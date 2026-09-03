'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { MapaRelevamiento } from './MapaRelevamiento'

const Mapa = dynamic(() => import('./MapaRelevamiento').then((m) => m.MapaRelevamiento), {
  ssr: false,
  loading: () => <div className="h-[60dvh] w-full animate-pulse rounded-2xl bg-gray-200" />,
})

export function MapaCliente(props: ComponentProps<typeof MapaRelevamiento>) {
  return <Mapa {...props} />
}

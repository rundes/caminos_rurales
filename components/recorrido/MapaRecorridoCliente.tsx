'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { MapaRecorrido } from './MapaRecorrido'

const Mapa = dynamic(() => import('./MapaRecorrido').then((m) => m.MapaRecorrido), {
  ssr: false,
  loading: () => <div className="h-[45dvh] w-full animate-pulse rounded-2xl bg-gray-200" />,
})

/** Envoltorio sin SSR: Leaflet necesita `window` para montarse. */
export function MapaRecorridoCliente(props: ComponentProps<typeof MapaRecorrido>) {
  return <Mapa {...props} />
}

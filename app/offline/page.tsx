import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sin conexión · Visiovial Rural',
}

/**
 * Página de reserva del service worker cuando no hay red. Es estática y no
 * muestra ningún dato de sesión: puede quedar cacheada sin filtrar nada.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-gray-900">Sin conexión</h1>
      <p className="text-base text-gray-700">
        Sin conexión. Tus recorridos se guardan en el celular y se suben cuando vuelva la señal.
      </p>
    </main>
  )
}

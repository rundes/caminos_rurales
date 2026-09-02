import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold text-green-800">Visiovial Rural</h1>
      <p className="text-lg text-gray-600">
        Plataforma de relevamiento del estado de caminos rurales de la Provincia de Buenos Aires.
      </p>
      <Link
        href="/login"
        className="rounded-xl bg-green-700 px-4 py-4 text-lg font-semibold text-white"
      >
        Ingresar
      </Link>
    </main>
  )
}

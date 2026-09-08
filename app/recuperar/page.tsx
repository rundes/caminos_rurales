import { RecuperarForm } from './RecuperarForm'

export default function RecuperarPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold text-green-800">Recuperar contraseña</h1>
        <p className="text-gray-600">Te mandamos un enlace por email para elegir una nueva.</p>
      </div>
      <RecuperarForm />
    </main>
  )
}

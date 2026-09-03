import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold text-green-800">Visiovial Rural</h1>
        <p className="text-gray-600">Relevamiento de caminos rurales</p>
      </div>
      <LoginForm />
    </main>
  )
}

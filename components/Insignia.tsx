import { ETIQUETA_INSIGNIA } from '@/lib/juego'

type Props = { codigo: string; obtenida: boolean }

const PREFIJO_LOCALIDAD_COMPLETA = 'localidad_completa:'

const ICONOS: Record<string, string> = {
  primer_recorrido: '🚩',
  explorador_50km: '🥾',
  cartografo_200km: '🗺️',
  municipio_100: '🏆',
}

function iconoDe(codigo: string): string {
  if (codigo.startsWith(PREFIJO_LOCALIDAD_COMPLETA)) return '📍'
  return ICONOS[codigo] ?? '🎖️'
}

/** Insignia individual: ícono + etiqueta, atenuada cuando todavía no se obtuvo. */
export function Insignia({ codigo, obtenida }: Props) {
  const etiqueta = ETIQUETA_INSIGNIA(codigo)

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl p-3 text-center ${
        obtenida ? 'bg-green-50 text-green-900' : 'bg-gray-100 text-gray-400 grayscale'
      }`}
      aria-label={obtenida ? etiqueta : `${etiqueta} (sin obtener)`}
    >
      <span className="text-2xl" aria-hidden="true">
        {iconoDe(codigo)}
      </span>
      <span className="text-xs font-medium">{etiqueta}</span>
    </div>
  )
}

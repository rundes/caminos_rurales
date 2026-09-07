// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { envPublico, envServidor, limpiarCacheEnvServidor } from '@/lib/env'

const URL_VALIDA = 'https://sb.example.co'
const CLAVE_VALIDA = 'sb_publishable_test_1234'
const entornoOriginal = { ...process.env }

function limpiarEntorno() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  delete process.env.SUPABASE_SECRET_KEY
  delete process.env.ALMACENAMIENTO
  delete process.env.GCS_BUCKET
  delete process.env.GCS_SERVICE_ACCOUNT_KEY
}

beforeEach(() => {
  limpiarCacheEnvServidor()
  limpiarEntorno()
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALIDA
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = CLAVE_VALIDA
})

afterEach(() => {
  process.env = { ...entornoOriginal }
  limpiarCacheEnvServidor()
})

describe('envPublico', () => {
  test('lee las variables públicas literalmente', () => {
    expect(envPublico()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: URL_VALIDA,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CLAVE_VALIDA,
    })
  })
})

describe('envServidor', () => {
  test('valida y devuelve el entorno con ALMACENAMIENTO por defecto', () => {
    const env = envServidor()
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(URL_VALIDA)
    expect(env.ALMACENAMIENTO).toBe('supabase')
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined()
  })

  test('cachea el resultado: una segunda llamada no vuelve a parsear', () => {
    const primera = envServidor()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://otra.example.co'
    const segunda = envServidor()
    expect(segunda).toBe(primera)
    expect(segunda.NEXT_PUBLIC_SUPABASE_URL).toBe(URL_VALIDA)
  })

  test('limpiarCacheEnvServidor fuerza un nuevo parseo', () => {
    envServidor()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://otra.example.co'
    limpiarCacheEnvServidor()
    expect(envServidor().NEXT_PUBLIC_SUPABASE_URL).toBe('https://otra.example.co')
  })

  test('URL inválida falla con un mensaje en español que la nombra', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'no-es-una-url'
    expect(() => envServidor()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  test('clave publicable corta falla con un mensaje que la nombra', () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'corta'
    expect(() => envServidor()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
  })

  test('faltan varias variables: el mensaje las lista todas', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    expect(() => envServidor()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY[\s\S]*NEXT_PUBLIC_SUPABASE_URL/,
    )
  })

  test('ALMACENAMIENTO=gcs sin GCS_BUCKET ni GCS_SERVICE_ACCOUNT_KEY falla nombrando ambas', () => {
    process.env.ALMACENAMIENTO = 'gcs'
    expect(() => envServidor()).toThrow(/GCS_BUCKET/)
    limpiarCacheEnvServidor()
    expect(() => envServidor()).toThrow(/GCS_SERVICE_ACCOUNT_KEY/)
  })

  test('ALMACENAMIENTO=gcs con GCS_BUCKET y GCS_SERVICE_ACCOUNT_KEY pasa', () => {
    process.env.ALMACENAMIENTO = 'gcs'
    process.env.GCS_BUCKET = 'maipu-pba'
    process.env.GCS_SERVICE_ACCOUNT_KEY = '{}'
    const env = envServidor()
    expect(env.ALMACENAMIENTO).toBe('gcs')
    expect(env.GCS_BUCKET).toBe('maipu-pba')
  })

  test('un ALMACENAMIENTO fuera del enum falla', () => {
    process.env.ALMACENAMIENTO = 'otro'
    expect(() => envServidor()).toThrow()
  })
})

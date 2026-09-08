// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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
  delete process.env.SITE_URL
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

  test('ALMACENAMIENTO=gcs con GCS_BUCKET y GCS_SERVICE_ACCOUNT_KEY válidas pasa', () => {
    process.env.ALMACENAMIENTO = 'gcs'
    process.env.GCS_BUCKET = 'maipu-pba'
    process.env.GCS_SERVICE_ACCOUNT_KEY = JSON.stringify({
      client_email: 'cuenta@maipu-pba.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    })
    const env = envServidor()
    expect(env.ALMACENAMIENTO).toBe('gcs')
    expect(env.GCS_BUCKET).toBe('maipu-pba')
  })

  test('ALMACENAMIENTO=gcs con GCS_SERVICE_ACCOUNT_KEY que no es JSON falla con un mensaje claro', () => {
    process.env.ALMACENAMIENTO = 'gcs'
    process.env.GCS_BUCKET = 'maipu-pba'
    process.env.GCS_SERVICE_ACCOUNT_KEY = 'no-es-json'
    expect(() => envServidor()).toThrow(/GCS_SERVICE_ACCOUNT_KEY.*JSON válido/)
  })

  test('ALMACENAMIENTO=gcs con GCS_SERVICE_ACCOUNT_KEY sin client_email ni private_key falla nombrando el campo', () => {
    process.env.ALMACENAMIENTO = 'gcs'
    process.env.GCS_BUCKET = 'maipu-pba'
    process.env.GCS_SERVICE_ACCOUNT_KEY = '{}'
    expect(() => envServidor()).toThrow(/client_email/)
  })

  test('ALMACENAMIENTO=gcs con GCS_SERVICE_ACCOUNT_KEY sin private_key falla nombrando el campo', () => {
    process.env.ALMACENAMIENTO = 'gcs'
    process.env.GCS_BUCKET = 'maipu-pba'
    process.env.GCS_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: 'cuenta@maipu-pba.iam.gserviceaccount.com' })
    expect(() => envServidor()).toThrow(/private_key/)
  })

  test('no registra el contenido de la clave al fallar la validación', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.ALMACENAMIENTO = 'gcs'
    process.env.GCS_BUCKET = 'maipu-pba'
    process.env.GCS_SERVICE_ACCOUNT_KEY = 'un-secreto-que-no-debe-aparecer-en-ningun-log'
    expect(() => envServidor()).toThrow()
    for (const llamada of spy.mock.calls) {
      expect(llamada.join(' ')).not.toContain('un-secreto-que-no-debe-aparecer-en-ningun-log')
    }
    spy.mockRestore()
  })

  test('un ALMACENAMIENTO fuera del enum falla', () => {
    process.env.ALMACENAMIENTO = 'otro'
    expect(() => envServidor()).toThrow()
  })

  test('SITE_URL es opcional', () => {
    expect(envServidor().SITE_URL).toBeUndefined()
  })

  test('SITE_URL inválida falla con un mensaje que la nombra', () => {
    process.env.SITE_URL = 'no-es-una-url'
    expect(() => envServidor()).toThrow(/SITE_URL/)
  })

  test('SITE_URL válida pasa', () => {
    process.env.SITE_URL = 'https://visiovial.example'
    expect(envServidor().SITE_URL).toBe('https://visiovial.example')
  })
})

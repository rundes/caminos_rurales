// Verifica el bucket GCS después del cutover: sube un objeto chico, firma una
// URL de lectura, la descarga, borra el objeto, y chequea que el bucket NO
// sea de lectura pública (si `https://storage.googleapis.com/<bucket>/<ruta>`
// devuelve 200 sin firma, el bucket sigue público — hay que arreglarlo antes
// de dar el cutover por terminado).
//
// Uso:
//   GCS_BUCKET=maipu-pba GCS_SERVICE_ACCOUNT_KEY='{"client_email":...}' node scripts/verificar-gcs.mjs
// o con un `.env.local` en la raíz que ya tenga esas dos variables.
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const REPO = process.cwd()
const require = createRequire(REPO + '/package.json')

function cargarEnvLocal() {
  const ruta = REPO + '/.env.local'
  if (!existsSync(ruta)) return {}
  return Object.fromEntries(
    readFileSync(ruta, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      }),
  )
}

const envArchivo = cargarEnvLocal()
const BUCKET = process.env.GCS_BUCKET ?? envArchivo.GCS_BUCKET
const CLAVE_CRUDA = process.env.GCS_SERVICE_ACCOUNT_KEY ?? envArchivo.GCS_SERVICE_ACCOUNT_KEY
const SEGUNDOS_LECTURA_EXPIRACION = 60 * 60

let fallos = 0
function ok(cond, msg, extra = '') {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? ' :: ' + extra : ''}`)
  if (!cond) fallos++
}

function avisar(msg) {
  console.log(`AVISO ${msg}`)
}

async function main() {
  if (!BUCKET || !CLAVE_CRUDA) {
    console.error(
      '[verificar-gcs] Faltan GCS_BUCKET y/o GCS_SERVICE_ACCOUNT_KEY (variable de entorno o .env.local)',
    )
    process.exitCode = 1
    return
  }

  let credenciales
  try {
    credenciales = JSON.parse(CLAVE_CRUDA)
  } catch {
    console.error('[verificar-gcs] GCS_SERVICE_ACCOUNT_KEY no contiene un JSON válido')
    process.exitCode = 1
    return
  }
  if (!credenciales.client_email || !credenciales.private_key) {
    console.error('[verificar-gcs] GCS_SERVICE_ACCOUNT_KEY no tiene "client_email"/"private_key"')
    process.exitCode = 1
    return
  }

  const { Storage } = require('@google-cloud/storage')
  const storage = new Storage({ credentials: credenciales })
  const bucket = storage.bucket(BUCKET)

  const ruta = `verificacion/${randomUUID()}.txt`
  const contenido = `verificar-gcs ${new Date().toISOString()}`
  const file = bucket.file(ruta)

  console.log(`[verificar-gcs] bucket=${BUCKET} ruta=${ruta}\n`)

  try {
    // 1. Subir un objeto chico.
    try {
      await file.save(contenido, { contentType: 'text/plain' })
      ok(true, 'sube un objeto de prueba')
    } catch (error) {
      ok(false, 'sube un objeto de prueba', error.message)
      throw error
    }

    // 2. Firmar una URL de lectura (V4) y descargarla.
    let urlFirmada
    try {
      ;[urlFirmada] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + SEGUNDOS_LECTURA_EXPIRACION * 1000,
      })
      ok(true, 'firma una URL de lectura V4')
    } catch (error) {
      ok(false, 'firma una URL de lectura V4', error.message)
      throw error
    }

    try {
      const respuesta = await fetch(urlFirmada)
      const texto = await respuesta.text()
      ok(respuesta.ok && texto === contenido, 'la URL firmada devuelve el contenido subido', `status=${respuesta.status}`)
    } catch (error) {
      ok(false, 'la URL firmada devuelve el contenido subido', error.message)
    }

    // 3. El bucket NO debe ser de lectura pública: sin firma, debe fallar.
    const urlPublica = `https://storage.googleapis.com/${BUCKET}/${ruta}`
    try {
      const respuestaPublica = await fetch(urlPublica)
      const esPublico = respuestaPublica.status === 200
      ok(!esPublico, 'el bucket NO es de lectura pública (sin firma)', `status=${respuestaPublica.status}`)
      if (esPublico) {
        avisar(
          `${urlPublica} devolvió 200 SIN firmar: el bucket sigue siendo público. Sacar "allUsers" ` +
            'de los permisos del bucket antes de dar el cutover por terminado.',
        )
      }
    } catch (error) {
      // Un error de red (no un 403/404) no confirma que el bucket sea privado.
      ok(false, 'el bucket NO es de lectura pública (sin firma)', error.message)
    }
  } finally {
    // 4. Borrar el objeto de prueba, pase lo que pase arriba.
    try {
      await file.delete()
      ok(true, 'borra el objeto de prueba')
    } catch (error) {
      ok(false, 'borra el objeto de prueba', error.message)
    }
  }

  console.log(`\n[verificar-gcs] ${fallos === 0 ? 'todo OK' : `${fallos} chequeo(s) fallaron`}`)
  process.exitCode = fallos === 0 ? 0 : 1
}

main().catch((error) => {
  console.error('[verificar-gcs] error inesperado:', error)
  process.exitCode = 1
})

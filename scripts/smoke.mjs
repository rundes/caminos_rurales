// Smoke test de integración contra Supabase real + dev server local.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/smoke.mjs
// Requiere .env.local con las claves del proyecto y `npm run dev` corriendo en :3000.
// Crea usuarios y datos temporales con prefijo smoke+ y los borra al terminar.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const REPO = process.cwd()
const require = createRequire(REPO + '/package.json')
const { createClient } = require('@supabase/supabase-js')

const env = Object.fromEntries(
  readFileSync(REPO + '/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim())),
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const SECRET = env.SUPABASE_SECRET_KEY
const REF = 'gtuulbdxgtcqybbtocpz'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const DEV = 'http://localhost:3000'

const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
const user = createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } })

let fallos = 0
function ok(cond, msg, extra = '') {
  console.log(`${cond ? 'OK ' : 'FAIL'} ${msg}${extra ? ' :: ' + extra : ''}`)
  if (!cond) fallos++
}

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t}`)
  return JSON.parse(t)
}

function cookieHeader(session) {
  // Formato de @supabase/ssr: base64url del JSON, prefijo "base64-", chunks de 3180.
  const name = `sb-${REF}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const MAX = 3180
  if (value.length <= MAX) return `${name}=${value}`
  const partes = []
  for (let i = 0, n = 0; i < value.length; i += MAX, n++) partes.push(`${name}.${n}=${value.slice(i, i + MAX)}`)
  return partes.join('; ')
}

const email = `smoke+${Date.now()}@example.com`
const password = 'smoke-pass-12345'
let uid, caminoId, relId, ruta
const extraUids = []

try {
  // 1. Crear usuario (autoconfirmado) con metadata → trigger crea perfil
  const { data: creado, error: eCrear } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nombre: 'Smoke Test', municipio_id: 'carlos-tejedor' },
  })
  ok(!eCrear && creado?.user, 'crear usuario', eCrear?.message)
  uid = creado.user.id

  const perfil = await sql(`select nombre, rol, municipio_id from public.perfiles where id = '${uid}'`)
  ok(perfil[0]?.nombre === 'Smoke Test' && perfil[0]?.municipio_id === 'carlos-tejedor' && perfil[0]?.rol === 'productor',
    'trigger handle_new_user creó perfil', JSON.stringify(perfil[0]))

  // 2. Login
  const { data: login, error: eLogin } = await user.auth.signInWithPassword({ email, password })
  ok(!eLogin && login.session, 'signInWithPassword', eLogin?.message)

  // 3. RLS: productor no puede crear camino
  const ins1 = await user.from('caminos').insert({ nombre_codigo: 'SMOKE-01', municipio: 'carlos-tejedor' })
  ok(ins1.error && (ins1.error.code === '42501' || /row-level security/.test(ins1.error.message)),
    'RLS bloquea insert de camino como productor', ins1.error?.code)

  // 4. Promover y crear camino
  await sql(`update public.perfiles set rol = 'municipio' where id = '${uid}'`)
  const ins2 = await user.from('caminos').insert({ nombre_codigo: 'SMOKE-01', municipio: 'carlos-tejedor' }).select('id').single()
  ok(!ins2.error && ins2.data?.id, 'municipio crea camino', ins2.error?.message)
  caminoId = ins2.data?.id

  // 5. Camino de otro municipio no visible
  const otro = await sql(`insert into public.caminos (nombre_codigo, municipio) values ('SMOKE-OTRO', 'bahia-blanca') returning id`)
  const vis = await user.from('caminos').select('id, municipio')
  ok(vis.data?.every((c) => c.municipio === 'carlos-tejedor'), 'RLS oculta caminos de otro municipio', JSON.stringify(vis.data))
  await sql(`delete from public.caminos where id = '${otro[0].id}'`)

  // 6. Relevamiento
  const rel = await user.from('relevamientos').insert({
    usuario_id: uid, camino_id: caminoId, origen_datos: 'formulario', metadata: { km: 3.5, archivos: [] },
  }).select('id').single()
  ok(!rel.error && rel.data?.id, 'insert relevamiento propio', rel.error?.message)
  relId = rel.data?.id

  // 7. Storage: subir bajo carpeta propia OK, bajo otra carpeta FAIL
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  ruta = `${uid}/${relId}/smoke.png`
  const up1 = await user.storage.from('evidencia-vial').upload(ruta, png, { contentType: 'image/png' })
  ok(!up1.error, 'upload en carpeta propia', up1.error?.message)
  const up2 = await user.storage.from('evidencia-vial').upload(`00000000-0000-0000-0000-000000000000/${relId}/x.png`, png, { contentType: 'image/png' })
  ok(Boolean(up2.error), 'upload en carpeta ajena bloqueado', up2.error?.message)
  const upd = await user.from('relevamientos').update({ metadata: { km: 3.5, archivos: [ruta] } }).eq('id', relId).select('id')
  ok(!upd.error && upd.data?.length === 1, 'registrar archivos en metadata', upd.error?.message)

  // 8. Endpoint IA vía dev server con cookie de sesión
  const cookie = cookieHeader(login.session)
  const r1 = await fetch(`${DEV}/api/procesar-ia`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ relevamiento_id: relId }),
  })
  const b1 = await r1.json().catch(() => ({}))
  ok(r1.status === 200 && b1.ok && b1.fallas >= 2 && b1.fallas <= 6, 'POST /api/procesar-ia 200', `${r1.status} ${JSON.stringify(b1)}`)
  const r2 = await fetch(`${DEV}/api/procesar-ia`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ relevamiento_id: relId }),
  })
  ok(r2.status === 409, 'segundo POST → 409', String(r2.status))
  const r3 = await fetch(`${DEV}/api/procesar-ia`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relevamiento_id: relId }),
  })
  ok(r3.status === 401, 'sin cookie → 401', String(r3.status))

  // 9. Verificar fallas y estado del camino
  const fallas = await sql(`select count(*)::int as n, min(url_evidencia_imagen) as ruta from public.fallas_deteccion where relevamiento_id = '${relId}'`)
  ok(fallas[0].n === b1.fallas && fallas[0].ruta === ruta, 'fallas insertadas con ruta de evidencia', JSON.stringify(fallas[0]))
  const cam = await sql(`select estado_general, procesado from (select c.estado_general, r.procesado_ia as procesado from public.caminos c join public.relevamientos r on r.camino_id = c.id where r.id = '${relId}') t`)
  ok(cam[0].procesado === true && ['bueno', 'regular', 'malo', 'intransitable'].includes(cam[0].estado_general), 'procesado_ia y estado_general actualizados', JSON.stringify(cam[0]))

  // 10. Lectura de fallas vía RLS y URL firmada
  const fr = await user.from('fallas_deteccion').select('id, url_evidencia_imagen, relevamientos(fecha, caminos(municipio))')
  ok(!fr.error && fr.data?.length === b1.fallas && fr.data[0].relevamientos?.caminos?.municipio === 'carlos-tejedor', 'select fallas anidado vía RLS', fr.error?.message ?? JSON.stringify(fr.data?.[0]))
  const firmada = await user.storage.from('evidencia-vial').createSignedUrls([ruta], 60)
  ok(!firmada.error && firmada.data?.[0]?.signedUrl, 'createSignedUrls', firmada.error?.message)

  // 10b. Storage por municipio: mismo municipio lee, otro municipio no
  const mkUser = async (municipio) => {
    const e = `smoke+${municipio}+${Date.now()}@example.com`
    const { data } = await admin.auth.admin.createUser({ email: e, password, email_confirm: true, user_metadata: { nombre: 'Vecino', municipio_id: municipio } })
    const c = createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } })
    await c.auth.signInWithPassword({ email: e, password })
    return { id: data.user.id, c }
  }
  const mismo = await mkUser('carlos-tejedor')
  const otroMun = await mkUser('bahia-blanca')
  extraUids.push(mismo.id, otroMun.id)
  const dl1 = await mismo.c.storage.from('evidencia-vial').download(ruta)
  ok(!dl1.error, 'usuario del mismo municipio descarga evidencia', dl1.error?.message)
  const dl2 = await otroMun.c.storage.from('evidencia-vial').download(ruta)
  ok(Boolean(dl2.error), 'usuario de otro municipio NO descarga evidencia', dl2.error?.message)
  const ls2 = await otroMun.c.storage.from('evidencia-vial').list(uid)
  ok(!ls2.error && (ls2.data?.length ?? 0) === 0, 'listado de carpeta ajena vacío para otro municipio', JSON.stringify(ls2.data))

  // 11. Páginas protegidas
  const pag = await fetch(`${DEV}/dashboard/mapa`, { headers: { Cookie: cookie }, redirect: 'manual' })
  ok(pag.status === 200, 'GET /dashboard/mapa con sesión → 200', String(pag.status))
  const pag2 = await fetch(`${DEV}/dashboard`, { redirect: 'manual' })
  ok(pag2.status === 307, 'GET /dashboard sin sesión → 307', String(pag2.status))
} catch (e) {
  fallos++
  console.error('EXCEPCION', e)
} finally {
  // Limpieza
  try {
    if (ruta) await admin.storage.from('evidencia-vial').remove([ruta])
    if (caminoId) await sql(`delete from public.caminos where id = '${caminoId}'`)
    if (uid) await admin.auth.admin.deleteUser(uid)
    for (const x of extraUids) await admin.auth.admin.deleteUser(x)
    console.log('limpieza OK')
  } catch (e) {
    console.error('limpieza FALLO', e.message)
  }
}
console.log(fallos === 0 ? '\nSMOKE: TODO OK' : `\nSMOKE: ${fallos} fallo(s)`)
process.exit(fallos === 0 ? 0 : 1)

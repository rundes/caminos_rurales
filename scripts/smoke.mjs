// Smoke test de integración v2: recorridos GPS, cobertura por tramo, puntos,
// ranking y observaciones. Contra Supabase real + dev server local.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/smoke.mjs
// Requiere .env.local con las claves del proyecto y `npm run dev` corriendo en :3000.
// Crea usuarios y datos temporales con prefijo smoke+ y los borra al terminar.
//
// No ejecuta `finalizarRecorrido` (Server Action, no accesible desde este
// script): las filas de recorridos, cobertura_tramos, puntos_eventos y
// fallas_deteccion se insertan directamente (con el cliente del usuario o
// con la clave secreta, según lo que exista RLS) y se verifica el resultado
// contra las funciones `cobertura_municipio` y `ranking_municipio`.
import { randomUUID } from 'node:crypto'
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
const PASSWORD = 'smoke-pass-12345'

const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })

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

/**
 * Crea un usuario autoconfirmado con el código de invitación `codigo`, lo
 * loguea y devuelve su cliente. `municipio` es solo la etiqueta esperada
 * (0008: el trigger `handle_new_user` resuelve el municipio real a partir del
 * código, nunca de la metadata) — se usa para el email y los mensajes.
 */
async function crearUsuario(municipio, codigo) {
  const email = `smoke+${municipio}+${Date.now()}+${Math.random().toString(36).slice(2, 8)}@example.com`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { nombre: 'Smoke Test', codigo_invitacion: codigo },
  })
  if (error || !data?.user) throw new Error(`crear usuario ${municipio}: ${error?.message}`)
  const c = createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: login, error: eLogin } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (eLogin || !login.session) throw new Error(`login ${municipio}: ${eLogin?.message}`)
  return { id: data.user.id, municipio, c, session: login.session }
}

let uid, ruta
const extraUids = []
const recorridoIds = []
const coberturaIds = []
const puntosIds = []
const fallasIds = []
const muestrasIds = []
const cuadrosIds = []
const tramoIds = []

try {
  // 1. Crear usuario (autoconfirmado) con código de invitación de maipu → trigger crea perfil
  const maipu = await crearUsuario('maipu', 'MAIPU-2027')
  uid = maipu.id
  const cookie = cookieHeader(maipu.session)

  const perfil = await sql(`select nombre, municipio_id, acepto_terminos_at from public.perfiles where id = '${uid}'`)
  ok(
    perfil[0]?.nombre === 'Smoke Test' && perfil[0]?.municipio_id === 'maipu' && perfil[0]?.acepto_terminos_at === null,
    'trigger handle_new_user crea perfil con acepto_terminos_at null',
    JSON.stringify(perfil[0]),
  )

  // 2. Sin términos aceptados: /dashboard redirige, /terminos se muestra
  const rDash1 = await fetch(`${DEV}/dashboard`, { headers: { Cookie: cookie }, redirect: 'manual' })
  ok(rDash1.status === 307, 'GET /dashboard sin términos → 307', String(rDash1.status))
  const rTerminos = await fetch(`${DEV}/terminos`, { headers: { Cookie: cookie }, redirect: 'manual' })
  ok(rTerminos.status === 200, 'GET /terminos con sesión → 200', String(rTerminos.status))

  // 3. Aceptar términos (update propio, RLS perfiles_update_propio) habilita el dashboard
  const aceptar = await maipu.c
    .from('perfiles')
    .update({ acepto_terminos_at: new Date().toISOString() })
    .eq('id', uid)
    .select('id')
  ok(!aceptar.error && aceptar.data?.length === 1, 'aceptar términos vía update propio', aceptar.error?.message)

  const rDash2 = await fetch(`${DEV}/dashboard`, { headers: { Cookie: cookie }, redirect: 'manual' })
  ok(rDash2.status === 200, 'GET /dashboard con términos aceptados → 200', String(rDash2.status))
  const rMapa = await fetch(`${DEV}/dashboard/mapa`, { headers: { Cookie: cookie }, redirect: 'manual' })
  ok(rMapa.status === 200, 'GET /dashboard/mapa → 200', String(rMapa.status))
  const rRanking = await fetch(`${DEV}/dashboard/ranking`, { headers: { Cookie: cookie }, redirect: 'manual' })
  ok(rRanking.status === 200, 'GET /dashboard/ranking → 200', String(rRanking.status))

  // 4. tramos: 165 filas para maipu (seed real), 0 para un municipio sin sembrar
  const trMaipu = await maipu.c.from('tramos').select('id, km')
  ok(!trMaipu.error && trMaipu.data?.length === 165, 'usuario de maipu ve 165 tramos', trMaipu.error?.message ?? String(trMaipu.data?.length))
  const tramo = trMaipu.data?.[0]
  ok(Boolean(tramo?.id), 'hay un tramo disponible para la prueba de cobertura', JSON.stringify(tramo))

  // Código de invitación temporal para poder crear un usuario de otro municipio
  // (0008: sin código válido el trigger deja el perfil en 'sin-asignar').
  await sql(`insert into public.codigos_invitacion (codigo, municipio) values ('SMOKE-BB', 'bahia-blanca') on conflict (codigo) do nothing`)
  const bahia = await crearUsuario('bahia-blanca', 'SMOKE-BB')
  extraUids.push(bahia.id)
  const trBahia = await bahia.c.from('tramos').select('id')
  ok(!trBahia.error && trBahia.data?.length === 0, 'usuario de otro municipio ve 0 tramos', trBahia.error?.message ?? String(trBahia.data?.length))

  // 5. recorridos: insert propio OK; usuario_id ajeno → RLS error
  const recorridoId = randomUUID()
  const inicio = new Date(Date.now() - 3600_000).toISOString()
  const fin = new Date().toISOString()
  const insRecorrido = await maipu.c
    .from('recorridos')
    .insert({
      id: recorridoId,
      usuario_id: uid,
      municipio: 'maipu',
      inicio,
      fin,
      km: 5.2,
      track: [
        [-36.99, -57.9],
        [-36.98, -57.89],
      ],
      estado: 'finalizado',
    })
    .select('id')
    .single()
  ok(!insRecorrido.error && insRecorrido.data?.id === recorridoId, 'insert recorrido propio', insRecorrido.error?.message)
  recorridoIds.push(recorridoId)

  const insAjeno = await maipu.c.from('recorridos').insert({
    usuario_id: bahia.id,
    municipio: 'maipu',
    inicio,
    fin,
    km: 1,
    track: [],
    estado: 'finalizado',
  })
  ok(Boolean(insAjeno.error), 'RLS bloquea insert de recorrido con usuario_id ajeno', insAjeno.error?.message)

  // 6. cobertura_tramos: sin política de insert para el usuario; sí para la clave secreta.
  // cobertura_municipio agrega por localidad y respeta el municipio del usuario.
  const covUsuario = await maipu.c.from('cobertura_tramos').insert({ tramo_id: tramo?.id, recorrido_id: recorridoId, usuario_id: uid })
  ok(Boolean(covUsuario.error), 'RLS bloquea insert de cobertura_tramos como usuario', covUsuario.error?.message)

  const covAdmin = await admin
    .from('cobertura_tramos')
    .insert({ tramo_id: tramo?.id, recorrido_id: recorridoId, usuario_id: uid })
    .select('id')
    .single()
  ok(!covAdmin.error && covAdmin.data?.id, 'clave secreta inserta cobertura_tramos', covAdmin.error?.message)
  if (covAdmin.data?.id) coberturaIds.push(covAdmin.data.id)

  const covMaipu = await maipu.c.rpc('cobertura_municipio', { p_municipio: 'maipu' })
  const cubiertosTotal = covMaipu.data?.reduce((acc, f) => acc + f.cubiertos, 0) ?? -1
  ok(
    !covMaipu.error && covMaipu.data?.length === 5 && cubiertosTotal === 1,
    'cobertura_municipio(maipu) devuelve 5 localidades con 1 tramo cubierto',
    covMaipu.error?.message ?? JSON.stringify(covMaipu.data),
  )

  const covBahia = await maipu.c.rpc('cobertura_municipio', { p_municipio: 'bahia-blanca' })
  ok(
    !covBahia.error && covBahia.data?.length === 0,
    'cobertura_municipio(bahia-blanca) vacío para usuario de maipu',
    covBahia.error?.message ?? JSON.stringify(covBahia.data),
  )

  // 7. puntos_eventos (solo servidor) y ranking_municipio
  const puntoAdmin = await admin
    .from('puntos_eventos')
    .insert({ usuario_id: uid, municipio: 'maipu', recorrido_id: recorridoId, motivo: 'km_nuevo', puntos: 10 })
    .select('id')
    .single()
  ok(!puntoAdmin.error && puntoAdmin.data?.id, 'clave secreta inserta puntos_eventos', puntoAdmin.error?.message)
  if (puntoAdmin.data?.id) puntosIds.push(puntoAdmin.data.id)

  const ranking = await maipu.c.rpc('ranking_municipio', { p_municipio: 'maipu' })
  const propio = ranking.data?.find((f) => f.usuario_id === uid)
  ok(
    !ranking.error && Number(propio?.posicion) === 1,
    'ranking_municipio ubica al usuario en la posición 1',
    ranking.error?.message ?? JSON.stringify(ranking.data),
  )

  const rankingBahia = await bahia.c.rpc('ranking_municipio', { p_municipio: 'bahia-blanca' })
  ok(
    !rankingBahia.error && rankingBahia.data?.length === 0,
    'ranking_municipio(bahia-blanca) sin eventos → 0 filas',
    rankingBahia.error?.message ?? JSON.stringify(rankingBahia.data),
  )

  // 8. Observaciones (fallas_deteccion): insert sobre recorrido propio OK, ajeno RLS error, update propio OK
  const obsPropia = await maipu.c
    .from('fallas_deteccion')
    .insert({ recorrido_id: recorridoId, tipo_falla: 'bache', severidad: 'media', latitud: -36.99, longitud: -57.9, descripcion: 'smoke' })
    .select('id')
    .single()
  ok(!obsPropia.error && obsPropia.data?.id, 'insert observación en recorrido propio', obsPropia.error?.message)
  if (obsPropia.data?.id) fallasIds.push(obsPropia.data.id)

  const recorridoAjeno = await admin
    .from('recorridos')
    .insert({ usuario_id: bahia.id, municipio: 'bahia-blanca', inicio, fin, km: 1, track: [], estado: 'finalizado' })
    .select('id')
    .single()
  if (recorridoAjeno.data?.id) recorridoIds.push(recorridoAjeno.data.id)

  const obsAjena = await maipu.c
    .from('fallas_deteccion')
    .insert({ recorrido_id: recorridoAjeno.data?.id, tipo_falla: 'bache', severidad: 'baja', latitud: -36.99, longitud: -57.9 })
  ok(Boolean(obsAjena.error), 'RLS bloquea insert de observación en recorrido ajeno', obsAjena.error?.message)

  if (obsPropia.data?.id) {
    const obsUpd = await maipu.c.from('fallas_deteccion').update({ descripcion: 'smoke editado' }).eq('id', obsPropia.data.id).select('id')
    ok(!obsUpd.error && obsUpd.data?.length === 1, 'update propio de observación (política 0005)', obsUpd.error?.message)
  }

  // 8bis. muestras_sensor: insert propio OK; recorrido_id ajeno → RLS error; usuario_id ajeno → RLS error
  const muestraBase = {
    recorrido_id: recorridoId,
    usuario_id: uid,
    tramo_id: tramo?.id,
    t: fin,
    latitud: -36.99,
    longitud: -57.9,
    velocidad_kmh: 40,
    rms_vertical: 4,
    pico_vertical: 5,
    muestras: 10,
    calidad: 'malo',
  }
  const muestraPropia = await maipu.c.from('muestras_sensor').insert(muestraBase).select('id').single()
  ok(!muestraPropia.error && muestraPropia.data?.id, 'insert muestras_sensor en recorrido propio', muestraPropia.error?.message)
  if (muestraPropia.data?.id) muestrasIds.push(muestraPropia.data.id)

  const muestraRecorridoAjeno = await maipu.c
    .from('muestras_sensor')
    .insert({ ...muestraBase, recorrido_id: recorridoAjeno.data?.id })
  ok(
    Boolean(muestraRecorridoAjeno.error),
    'RLS bloquea insert de muestras_sensor con recorrido_id ajeno',
    muestraRecorridoAjeno.error?.message,
  )

  const muestraUsuarioAjeno = await maipu.c.from('muestras_sensor').insert({ ...muestraBase, usuario_id: bahia.id })
  ok(
    Boolean(muestraUsuarioAjeno.error),
    'RLS bloquea insert de muestras_sensor con usuario_id ajeno',
    muestraUsuarioAjeno.error?.message,
  )

  // 8ter. rugosidad_tramos: agrega la muestra 'malo' insertada arriba, respeta el municipio del usuario
  const rugMaipu = await maipu.c.rpc('rugosidad_tramos', { p_municipio: 'maipu' })
  const filaTramo = rugMaipu.data?.find((f) => f.tramo_id === tramo?.id)
  ok(
    !rugMaipu.error && Array.isArray(rugMaipu.data) && rugMaipu.data.length >= 1,
    'rugosidad_tramos(maipu) devuelve un array (≥ 0 filas)',
    rugMaipu.error?.message ?? JSON.stringify(rugMaipu.data),
  )
  ok(
    filaTramo?.calidad === 'malo' && filaTramo?.tramo_id === tramo?.id,
    'rugosidad_tramos(maipu) incluye el tramo de prueba con calidad malo',
    JSON.stringify(filaTramo),
  )

  const rugBahia = await bahia.c.rpc('rugosidad_tramos', { p_municipio: 'maipu' })
  ok(
    !rugBahia.error && rugBahia.data?.length === 0,
    'rugosidad_tramos(maipu) devuelve 0 filas para usuario de otro municipio',
    rugBahia.error?.message ?? JSON.stringify(rugBahia.data),
  )

  // 8quater. fallas_deteccion.origen: manual no se puede borrar (sin política), sensor sí (fallas_delete_sensor_propio)
  const fallaManual = await maipu.c
    .from('fallas_deteccion')
    .insert({
      recorrido_id: recorridoId,
      tipo_falla: 'bache',
      severidad: 'baja',
      latitud: -36.99,
      longitud: -57.9,
      descripcion: 'smoke manual',
      origen: 'manual',
    })
    .select('id')
    .single()
  ok(!fallaManual.error && fallaManual.data?.id, 'insert falla origen manual', fallaManual.error?.message)
  if (fallaManual.data?.id) fallasIds.push(fallaManual.data.id)

  if (fallaManual.data?.id) {
    const delManual = await maipu.c.from('fallas_deteccion').delete().eq('id', fallaManual.data.id).select('id')
    ok(
      !delManual.error && delManual.data?.length === 0,
      'usuario NO puede borrar observación origen manual (sin política de delete)',
      delManual.error?.message ?? JSON.stringify(delManual.data),
    )
    const sigueManual = await sql(`select id from public.fallas_deteccion where id = '${fallaManual.data.id}'`)
    ok(sigueManual.length === 1, 'la observación manual sigue existiendo tras el intento de borrado', JSON.stringify(sigueManual))
  }

  const fallaSensor = await admin
    .from('fallas_deteccion')
    .insert({
      recorrido_id: recorridoId,
      tipo_falla: 'bache',
      severidad: 'media',
      latitud: -36.99,
      longitud: -57.9,
      descripcion: 'smoke sensor',
      origen: 'sensor',
      magnitud: 8.2,
    })
    .select('id')
    .single()
  ok(!fallaSensor.error && fallaSensor.data?.id, 'clave secreta inserta falla origen sensor', fallaSensor.error?.message)
  if (fallaSensor.data?.id) fallasIds.push(fallaSensor.data.id)

  if (fallaSensor.data?.id) {
    const delSensor = await maipu.c.from('fallas_deteccion').delete().eq('id', fallaSensor.data.id).select('id')
    ok(
      !delSensor.error && delSensor.data?.length === 1,
      'usuario puede borrar su observación origen sensor (política fallas_delete_sensor_propio)',
      delSensor.error?.message ?? JSON.stringify(delSensor.data),
    )
  }

  // 9bis. Cuadros: insert propio OK; recorrido_id ajeno → RLS error; usuario_id ajeno → RLS error;
  // cuadros_por_tramo respeta el municipio del usuario; update/delete propio OK.
  const tCuadro = new Date(new Date(inicio).getTime() + 10_000).toISOString()
  const cuadroBase = {
    recorrido_id: recorridoId,
    usuario_id: uid,
    tramo_id: tramo?.id,
    t: tCuadro,
    latitud: -36.99,
    longitud: -57.9,
    ruta: `${uid}/${recorridoId}/cuadro-1.jpg`,
  }
  const cuadroPropio = await maipu.c.from('cuadros').insert(cuadroBase).select('id').single()
  ok(!cuadroPropio.error && cuadroPropio.data?.id, 'insert cuadro en recorrido propio', cuadroPropio.error?.message)
  if (cuadroPropio.data?.id) cuadrosIds.push(cuadroPropio.data.id)

  const cuadroRecorridoAjeno = await maipu.c
    .from('cuadros')
    .insert({ ...cuadroBase, recorrido_id: recorridoAjeno.data?.id, t: new Date(new Date(tCuadro).getTime() + 1_000).toISOString() })
  ok(Boolean(cuadroRecorridoAjeno.error), 'RLS bloquea insert de cuadro con recorrido_id ajeno', cuadroRecorridoAjeno.error?.message)

  const cuadroUsuarioAjeno = await maipu.c
    .from('cuadros')
    .insert({ ...cuadroBase, usuario_id: bahia.id, t: new Date(new Date(tCuadro).getTime() + 2_000).toISOString() })
  ok(Boolean(cuadroUsuarioAjeno.error), 'RLS bloquea insert de cuadro con usuario_id ajeno', cuadroUsuarioAjeno.error?.message)

  const cuadrosPorTramoMaipu = await maipu.c.rpc('cuadros_por_tramo', { p_municipio: 'maipu' })
  const filaCuadrosTramo = cuadrosPorTramoMaipu.data?.find((f) => f.tramo_id === tramo?.id)
  ok(
    !cuadrosPorTramoMaipu.error && filaCuadrosTramo?.cuadros === 1,
    'cuadros_por_tramo(maipu) incluye el tramo de prueba con cuadros: 1',
    cuadrosPorTramoMaipu.error?.message ?? JSON.stringify(cuadrosPorTramoMaipu.data),
  )

  const cuadrosPorTramoBahia = await bahia.c.rpc('cuadros_por_tramo', { p_municipio: 'maipu' })
  ok(
    !cuadrosPorTramoBahia.error && cuadrosPorTramoBahia.data?.length === 0,
    'cuadros_por_tramo(maipu) devuelve 0 filas para usuario de otro municipio',
    cuadrosPorTramoBahia.error?.message ?? JSON.stringify(cuadrosPorTramoBahia.data),
  )

  if (cuadroPropio.data?.id) {
    const cuadroUpd = await maipu.c.from('cuadros').update({ velocidad_kmh: 42 }).eq('id', cuadroPropio.data.id).select('id')
    ok(!cuadroUpd.error && cuadroUpd.data?.length === 1, 'update propio de cuadro (velocidad_kmh)', cuadroUpd.error?.message)

    const cuadroDel = await maipu.c.from('cuadros').delete().eq('id', cuadroPropio.data.id).select('id')
    ok(!cuadroDel.error && cuadroDel.data?.length === 1, 'delete propio de cuadro', cuadroDel.error?.message)
  }

  // 9. Storage: subida propia OK, carpeta ajena bloqueada, lectura limitada al municipio
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  ruta = `${uid}/${recorridoId}/smoke.png`
  const up1 = await maipu.c.storage.from('evidencia-vial').upload(ruta, png, { contentType: 'image/png' })
  ok(!up1.error, 'upload en carpeta propia', up1.error?.message)
  const up2 = await maipu.c.storage.from('evidencia-vial').upload(`${bahia.id}/${recorridoId}/x.png`, png, { contentType: 'image/png' })
  ok(Boolean(up2.error), 'upload en carpeta ajena bloqueado', up2.error?.message)

  const otroMaipu = await crearUsuario('maipu', 'MAIPU-2027')
  extraUids.push(otroMaipu.id)
  const dl1 = await otroMaipu.c.storage.from('evidencia-vial').download(ruta)
  ok(!dl1.error, 'usuario del mismo municipio descarga evidencia', dl1.error?.message)
  const dl2 = await bahia.c.storage.from('evidencia-vial').download(ruta)
  ok(Boolean(dl2.error), 'usuario de otro municipio NO descarga evidencia', dl2.error?.message)

  // 10bis. Seguridad (0008): perfil inmutable, recorridos/fallas endurecidos, código inválido
  const rolAjeno = await maipu.c.from('perfiles').update({ rol: 'admin' }).eq('id', uid).select('rol')
  ok(
    Boolean(rolAjeno.error) || rolAjeno.data?.length === 0,
    'usuario NO puede cambiar su propio rol (grant por columna + trigger perfiles_no_escalar)',
    rolAjeno.error?.message ?? JSON.stringify(rolAjeno.data),
  )
  const rolTrasIntento = await sql(`select rol from public.perfiles where id = '${uid}'`)
  ok(rolTrasIntento[0]?.rol !== 'admin', 'el rol sigue sin cambiar tras el intento', JSON.stringify(rolTrasIntento[0]))

  const municipioAjeno = await maipu.c
    .from('perfiles')
    .update({ municipio_id: 'bahia-blanca' })
    .eq('id', uid)
    .select('municipio_id')
  ok(
    Boolean(municipioAjeno.error) || municipioAjeno.data?.length === 0,
    'usuario NO puede cambiar su propio municipio_id',
    municipioAjeno.error?.message ?? JSON.stringify(municipioAjeno.data),
  )

  const nombreOk = await maipu.c.from('perfiles').update({ nombre: 'Smoke Test Editado' }).eq('id', uid).select('nombre')
  ok(
    !nombreOk.error && nombreOk.data?.[0]?.nombre === 'Smoke Test Editado',
    'usuario SI puede cambiar su nombre (columna permitida)',
    nombreOk.error?.message ?? JSON.stringify(nombreOk.data),
  )

  const recorridoOtroMunicipio = await maipu.c
    .from('recorridos')
    .insert({ usuario_id: uid, municipio: 'bahia-blanca', inicio, fin, km: 1, track: [], estado: 'finalizado' })
  ok(
    Boolean(recorridoOtroMunicipio.error),
    'RLS bloquea insert de recorrido con municipio distinto al propio',
    recorridoOtroMunicipio.error?.message,
  )

  const updKmPropio = await maipu.c.from('recorridos').update({ km: 999 }).eq('id', recorridoId).select('id')
  ok(
    Boolean(updKmPropio.error) || updKmPropio.data?.length === 0,
    'RLS bloquea update de recorrido propio (ya no hay política de update)',
    updKmPropio.error?.message ?? JSON.stringify(updKmPropio.data),
  )

  const fallaSensorPropia = await maipu.c.from('fallas_deteccion').insert({
    recorrido_id: recorridoId,
    tipo_falla: 'bache',
    severidad: 'baja',
    latitud: -36.99,
    longitud: -57.9,
    origen: 'sensor',
  })
  ok(
    Boolean(fallaSensorPropia.error),
    'RLS bloquea insert de falla origen sensor desde la app (solo manual)',
    fallaSensorPropia.error?.message,
  )

  const codigoInvalido = await crearUsuario('sin-asignar', 'CODIGO-INEXISTENTE-XYZ')
  extraUids.push(codigoInvalido.id)
  const perfilInvalido = await sql(`select municipio_id from public.perfiles where id = '${codigoInvalido.id}'`)
  ok(
    perfilInvalido[0]?.municipio_id === 'sin-asignar',
    'usuario creado con código inválido queda con perfil sin-asignar',
    JSON.stringify(perfilInvalido[0]),
  )

  // 11. Estados de observación (0010): solo municipio/auditor cambian el
  // estado; la clave secreta también puede (bypasea RLS y el trigger, que
  // solo corta cuando hay auth.uid()); resumen_observaciones respeta el
  // municipio del usuario.
  const estadoProductor = await maipu.c
    .from('fallas_deteccion')
    .update({ estado: 'en_obra', estado_at: new Date().toISOString(), estado_por: uid })
    .eq('id', fallaManual.data?.id)
    .select('id')
  ok(
    Boolean(estadoProductor.error) || estadoProductor.data?.length === 0,
    'productor NO puede cambiar el estado de una observación (trigger fallas_estado_no_escalar)',
    estadoProductor.error?.message ?? JSON.stringify(estadoProductor.data),
  )

  const estadoAdmin = await admin
    .from('fallas_deteccion')
    .update({ estado: 'en_obra', estado_at: new Date().toISOString(), estado_por: uid })
    .eq('id', fallaManual.data?.id)
    .select('id')
  ok(
    !estadoAdmin.error && estadoAdmin.data?.length === 1,
    'la clave secreta SI puede cambiar el estado de una observación',
    estadoAdmin.error?.message ?? JSON.stringify(estadoAdmin.data),
  )

  const resumenMaipu = await maipu.c.rpc('resumen_observaciones', { p_municipio: 'maipu' })
  ok(
    !resumenMaipu.error && Array.isArray(resumenMaipu.data) && resumenMaipu.data.length > 0,
    "resumen_observaciones('maipu') devuelve filas para un usuario de maipu",
    resumenMaipu.error?.message ?? JSON.stringify(resumenMaipu.data),
  )

  const resumenBahia = await bahia.c.rpc('resumen_observaciones', { p_municipio: 'maipu' })
  ok(
    !resumenBahia.error && resumenBahia.data?.length === 0,
    "resumen_observaciones('maipu') devuelve 0 filas para un usuario de otro municipio",
    resumenBahia.error?.message ?? JSON.stringify(resumenBahia.data),
  )

  const rObservaciones = await fetch(`${DEV}/dashboard/observaciones`, { headers: { Cookie: cookie }, redirect: 'manual' })
  ok(rObservaciones.status === 200, 'GET /dashboard/observaciones con sesión → 200', String(rObservaciones.status))

  // 12. Ola 2 (P2-P4): tramos, exportes, recuperar contraseña y auth/confirm.
  const rTramos = await fetch(`${DEV}/dashboard/tramos`, { headers: { Cookie: cookie }, redirect: 'manual' })
  ok(rTramos.status === 200, 'GET /dashboard/tramos con sesión → 200', String(rTramos.status))

  const rTramoDetalle = await fetch(`${DEV}/dashboard/tramos/${tramo?.id}`, { headers: { Cookie: cookie }, redirect: 'manual' })
  ok(
    rTramoDetalle.status === 200,
    'GET /dashboard/tramos/<id de un tramo de maipu> → 200',
    String(rTramoDetalle.status),
  )

  const rCaminos = await fetch(`${DEV}/dashboard/caminos`, { headers: { Cookie: cookie }, redirect: 'manual' })
  ok(rCaminos.status === 404, 'GET /dashboard/caminos (ruta dada de baja) → 404', String(rCaminos.status))

  const rExportCsv = await fetch(`${DEV}/dashboard/observaciones/export?formato=csv`, { headers: { Cookie: cookie } })
  const tipoCsv = rExportCsv.headers.get('content-type') ?? ''
  const dispositionCsv = rExportCsv.headers.get('content-disposition') ?? ''
  ok(
    rExportCsv.status === 200 && tipoCsv.startsWith('text/csv') && dispositionCsv.includes('attachment'),
    'GET /dashboard/observaciones/export?formato=csv → 200, text/csv, Content-Disposition attachment',
    `${rExportCsv.status} :: ${tipoCsv} :: ${dispositionCsv}`,
  )

  const rExportGeo = await fetch(`${DEV}/dashboard/observaciones/export?formato=geojson`, { headers: { Cookie: cookie } })
  const cuerpoGeo = await rExportGeo.text()
  let geo
  try {
    geo = JSON.parse(cuerpoGeo)
  } catch {
    geo = null
  }
  ok(
    rExportGeo.status === 200 && geo?.type === 'FeatureCollection' && Array.isArray(geo?.features),
    'GET /dashboard/observaciones/export?formato=geojson → 200, JSON válido, FeatureCollection',
    `${rExportGeo.status} :: ${cuerpoGeo.slice(0, 120)}`,
  )

  const rRecuperar = await fetch(`${DEV}/recuperar`, { redirect: 'manual' })
  ok(rRecuperar.status === 200, 'GET /recuperar sin sesión → 200', String(rRecuperar.status))

  // /nueva-clave nunca redirige: es un Server Component que muestra el
  // formulario si `getUser()` devuelve usuario (sesión de recuperación ya en
  // cookies, ver app/auth/confirm/route.ts) o, sin sesión, el mismo 200 con
  // un aviso de enlace vencido/inválido y un link de vuelta a /recuperar en
  // vez del formulario (no está en RUTAS_PROTEGIDAS de proxy.ts a propósito).
  const rNuevaClave = await fetch(`${DEV}/nueva-clave`, { redirect: 'manual' })
  ok(
    rNuevaClave.status === 200,
    'GET /nueva-clave sin sesión de recuperación → 200 (aviso de enlace vencido, no el formulario)',
    String(rNuevaClave.status),
  )

  // /auth/confirm sin `code` redirige a /recuperar (NextResponse.redirect,
  // 307) en vez de intentar exchangeCodeForSession y volar con un 500.
  const rAuthConfirm = await fetch(`${DEV}/auth/confirm`, { redirect: 'manual' })
  ok(
    rAuthConfirm.status >= 300 && rAuthConfirm.status < 400,
    'GET /auth/confirm sin code → redirect (no 500)',
    String(rAuthConfirm.status),
  )

  // 13. Alta de tramos (0011): alta/edición para municipio/auditor dentro del
  // municipio propio, sin política de delete; `activo` gobierna el
  // denominador de `cobertura_municipio` sin borrar ni ocultar el tramo.
  const geometriaSmoke = [
    [-57.9, -36.99],
    [-57.89, -36.98],
  ]

  const tramoInsertProductor = await maipu.c.from('tramos').insert({
    id: `smoke-productor-${Date.now()}`,
    municipio: 'maipu',
    nombre_codigo: 'CR-SMOKE productor',
    localidad: 'Maipú',
    km: 1,
    geometria: geometriaSmoke,
  })
  ok(Boolean(tramoInsertProductor.error), 'RLS bloquea insert de tramo como productor', tramoInsertProductor.error?.message)

  const tramoUpdateProductor = await maipu.c
    .from('tramos')
    .update({ nombre_codigo: 'hackeado' })
    .eq('id', tramo?.id)
    .select('id')
  ok(
    Boolean(tramoUpdateProductor.error) || tramoUpdateProductor.data?.length === 0,
    'RLS bloquea update de tramo como productor',
    tramoUpdateProductor.error?.message ?? JSON.stringify(tramoUpdateProductor.data),
  )

  const idTramoAdmin = `smoke-admin-${Date.now()}`
  const tramoInsertAdmin = await admin
    .from('tramos')
    .insert({
      id: idTramoAdmin,
      municipio: 'maipu',
      nombre_codigo: 'CR-SMOKE admin',
      localidad: 'Maipú',
      km: 1,
      geometria: geometriaSmoke,
    })
    .select('id')
    .single()
  ok(
    !tramoInsertAdmin.error && tramoInsertAdmin.data?.id === idTramoAdmin,
    'la clave secreta inserta un tramo (siembra)',
    tramoInsertAdmin.error?.message,
  )
  if (tramoInsertAdmin.data?.id) tramoIds.push(tramoInsertAdmin.data.id)

  // Promueve al usuario de maipu a rol 'municipio' (solo la clave secreta
  // puede: 0008, trigger perfiles_no_escalar) para probar el alta/edición de
  // tramos como gestión.
  const promover = await admin.from('perfiles').update({ rol: 'municipio' }).eq('id', uid).select('rol')
  ok(
    !promover.error && promover.data?.[0]?.rol === 'municipio',
    'la clave secreta promueve al usuario a rol municipio',
    promover.error?.message ?? JSON.stringify(promover.data),
  )

  const idTramoMunicipio = `smoke-municipio-${Date.now()}`
  const tramoInsertMunicipio = await maipu.c
    .from('tramos')
    .insert({
      id: idTramoMunicipio,
      municipio: 'maipu',
      nombre_codigo: 'CR-SMOKE municipio',
      localidad: 'Maipú',
      km: 1,
      geometria: geometriaSmoke,
    })
    .select('id, activo, creado_por')
    .single()
  ok(
    !tramoInsertMunicipio.error &&
      tramoInsertMunicipio.data?.id === idTramoMunicipio &&
      tramoInsertMunicipio.data?.activo === true &&
      tramoInsertMunicipio.data?.creado_por === uid,
    'municipio inserta un tramo propio (activo=true, creado_por sellado por el trigger tramos_auditoria)',
    tramoInsertMunicipio.error?.message ?? JSON.stringify(tramoInsertMunicipio.data),
  )
  if (tramoInsertMunicipio.data?.id) tramoIds.push(tramoInsertMunicipio.data.id)

  const tramoInsertOtroMunicipio = await maipu.c.from('tramos').insert({
    id: `smoke-otro-municipio-${Date.now()}`,
    municipio: 'bahia-blanca',
    nombre_codigo: 'CR-SMOKE otro municipio',
    localidad: 'Bahía',
    km: 1,
    geometria: geometriaSmoke,
  })
  ok(
    Boolean(tramoInsertOtroMunicipio.error),
    'RLS bloquea a un municipio insertar un tramo en otro municipio',
    tramoInsertOtroMunicipio.error?.message,
  )

  // Semántica de `activo` (0011): el denominador de cobertura cuenta solo
  // tramos activos; desactivar uno no lo borra ni lo oculta del historial.
  const coberturaAntes = await maipu.c.rpc('cobertura_municipio', { p_municipio: 'maipu' })
  const totalAntes = coberturaAntes.data?.reduce((acc, f) => acc + f.tramos, 0) ?? -1

  const desactivar = await maipu.c
    .from('tramos')
    .update({ activo: false })
    .eq('id', idTramoMunicipio)
    .select('id, activo')
  ok(
    !desactivar.error && desactivar.data?.[0]?.activo === false,
    'municipio desactiva su propio tramo',
    desactivar.error?.message ?? JSON.stringify(desactivar.data),
  )

  const coberturaDespues = await maipu.c.rpc('cobertura_municipio', { p_municipio: 'maipu' })
  const totalDespues = coberturaDespues.data?.reduce((acc, f) => acc + f.tramos, 0) ?? -1
  ok(
    !coberturaDespues.error && totalDespues === totalAntes - 1,
    'cobertura_municipio ya no cuenta el tramo desactivado en el denominador',
    `${totalAntes} -> ${totalDespues}`,
  )

  const tramoInactivoVisible = await maipu.c
    .from('tramos')
    .select('id, activo')
    .eq('id', idTramoMunicipio)
    .maybeSingle()
  ok(
    !tramoInactivoVisible.error && tramoInactivoVisible.data?.activo === false,
    'el tramo inactivo sigue siendo legible directamente (no se borra ni se oculta)',
    tramoInactivoVisible.error?.message ?? JSON.stringify(tramoInactivoVisible.data),
  )

  const borrarTramo = await maipu.c.from('tramos').delete().eq('id', idTramoMunicipio).select('id')
  ok(
    !borrarTramo.error && borrarTramo.data?.length === 0,
    'no hay política de delete: el intento de borrado no afecta filas',
    borrarTramo.error?.message ?? JSON.stringify(borrarTramo.data),
  )

  // 10. Rutas públicas y PWA
  const sinCookie = await fetch(`${DEV}/dashboard`, { redirect: 'manual' })
  ok(sinCookie.status === 307, 'GET /dashboard sin sesión → 307', String(sinCookie.status))
  const manifest = await fetch(`${DEV}/manifest.json`)
  ok(manifest.status === 200, 'GET /manifest.json → 200', String(manifest.status))
  const sw = await fetch(`${DEV}/sw.js`)
  ok(sw.status === 200, 'GET /sw.js → 200', String(sw.status))
  const offline = await fetch(`${DEV}/offline`)
  ok(offline.status === 200, 'GET /offline → 200', String(offline.status))
} catch (e) {
  fallos++
  console.error('EXCEPCION', e)
} finally {
  // Limpieza: hijos antes que padres, aunque las FK son on delete cascade.
  try {
    if (ruta) await admin.storage.from('evidencia-vial').remove([ruta])
    for (const id of tramoIds) await sql(`delete from public.tramos where id = '${id}'`)
    for (const id of cuadrosIds) await sql(`delete from public.cuadros where id = '${id}'`)
    for (const id of muestrasIds) await sql(`delete from public.muestras_sensor where id = '${id}'`)
    for (const id of fallasIds) await sql(`delete from public.fallas_deteccion where id = '${id}'`)
    for (const id of puntosIds) await sql(`delete from public.puntos_eventos where id = '${id}'`)
    for (const id of coberturaIds) await sql(`delete from public.cobertura_tramos where id = '${id}'`)
    for (const id of recorridoIds) await sql(`delete from public.recorridos where id = '${id}'`)
    await sql(`delete from public.codigos_invitacion where codigo = 'SMOKE-BB'`)
    if (uid) await admin.auth.admin.deleteUser(uid)
    for (const x of extraUids) await admin.auth.admin.deleteUser(x)
    console.log('limpieza OK')
  } catch (e) {
    console.error('limpieza FALLO', e.message)
  }
}
console.log(fallos === 0 ? '\nSMOKE: TODO OK' : `\nSMOKE: ${fallos} fallo(s)`)
process.exit(fallos === 0 ? 0 : 1)

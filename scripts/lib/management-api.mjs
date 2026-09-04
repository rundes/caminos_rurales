// Acceso a la Management API de Supabase para aplicar SQL desde los scripts.
// El token (SUPABASE_ACCESS_TOKEN) nunca se escribe en un archivo: se pasa
// por entorno al ejecutar el script.
export const PROJECT_REF = 'gtuulbdxgtcqybbtocpz'

/** Aplica una consulta SQL al proyecto y devuelve el cuerpo de la respuesta. */
export async function aplicarSql(sql, token, projectRef = PROJECT_REF) {
  const respuesta = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const cuerpo = await respuesta.text()
  if (!respuesta.ok) throw new Error(`Error ${respuesta.status}: ${cuerpo}`)
  return cuerpo
}
